import { ServerMember, User, Server, Channel, Message } from "../stoat/index.js";
import { client, dbs } from "..";
import Infraction from "automod-lib/dist/types/antispam/Infraction";
import LogConfig from "automod-lib/dist/types/LogConfig";
import LogMessage from "automod-lib/dist/types/LogMessage";
import { isSudo } from "./commands/owner/override";
import type { SendableEmbed } from "../stoat/index.js";
import ServerConfig from "automod-lib/dist/types/ServerConfig";

const NO_MANAGER_MSG = "Missing permission";
const ULID_REGEX = /^[0-9A-HJ-KM-NP-TV-Z]{26}$/i;
const USER_MENTION_REGEX = /^<@[0-9A-HJ-KM-NP-TV-Z]{26}>$/i;
const CHANNEL_MENTION_REGEX = /^<#[0-9A-HJ-KM-NP-TV-Z]{26}>$/i;

enum EmbedColor {
	Error = "var(--error)",
	SoftError = "var(--warning)",
	Warning = "var(--warning)",
	Success = "var(--success)",
}

// User parsing and permission checking
async function parseUser(text: string): Promise<User | null> {
	if (!text) return null;

	let uid: string | null = null;
	if (USER_MENTION_REGEX.test(text)) {
		uid = text.replace(/<@|>/g, "").toUpperCase();
	} else if (ULID_REGEX.test(text)) {
		uid = text.toUpperCase();
	} else {
		if (text.startsWith("@")) text = text.slice(1);
		return client.users.find((u) => u.username?.toLowerCase() === text.toLowerCase()) || null;
	}

	try {
		return uid ? await client.users.fetch(uid) : null;
	} catch (e) {
		return null;
	}
}

async function parseUserOrId(text: string): Promise<User | { id: string } | null> {
	const parsed = await parseUser(text);
	if (parsed) return parsed;
	if (ULID_REGEX.test(text)) return { id: text.toUpperCase() };
	return null;
}

async function isModerator(message: Message, announceSudo = false): Promise<boolean> {
	const member = message.member!;
	const server = message.channel!.server!;

	if (member.hasPermission(server, "ManageMessages")) return true;

	const [isManager, mods, isSudo] = await Promise.all([isBotManager(message), dbs.SERVERS.findOne({ id: server.id }), checkSudoPermission(message, announceSudo)]);

	return isManager || (mods?.moderators?.includes(member.user!.id) ?? false) || isSudo;
}

async function isBotManager(message: Message, announceSudo = false): Promise<boolean> {
	const member = message.member!;
	const server = message.channel!.server!;

	if (member.hasPermission(server, "ManageServer")) return true;

	const [managers, isSudo] = await Promise.all([dbs.SERVERS.findOne({ id: server.id }), checkSudoPermission(message, announceSudo)]);

	return (managers?.botManagers?.includes(member.user!.id) ?? false) || isSudo;
}

async function checkSudoPermission(message: Message, announce = true): Promise<boolean> {
	const hasPerm = isSudo(message.author!);
	if (!hasPerm) return false;

	if (announce) {
		await message.reply("# :unlock: Bypassed permission check\n" + `Sudo mode is enabled for @${message.author!.username}.\n`);
	}
	return true;
}

async function getPermissionLevel(member: ServerMember | User, server: Server): Promise<0 | 1 | 2 | 3> {
	let serverMember: ServerMember;
	if (member instanceof User) {
		serverMember = client.serverMembers.getByKey({ server: server.id, user: member.id }) || (await server.fetchMember(member.id));
	} else {
		serverMember = member;
	}

	if (isSudo(serverMember.user!)) return 3;
	if (server.ownerId === serverMember.id.user) return 3;
	if (serverMember.hasPermission(server, "ManageServer")) return 2;

	const config = await dbs.SERVERS.findOne({ id: server.id });

	if (config?.botManagers?.includes(serverMember.id.user)) return 2;
	if (config?.moderators?.includes(serverMember.id.user) || serverMember.hasPermission(server, "BanMembers")) return 1;

	return 0;
}

function getPermissionBasedOnRole(member: ServerMember): 0 | 1 | 2 | 3 {
	if (member.server && member.server.ownerId === member.id.user) return 3;
	if (member.hasPermission(member.server!, "ManageServer")) return 2;
	if (member.hasPermission(member.server!, "KickMembers")) return 1;
	return 0;
}

async function getOwnMemberInServer(server: Server): Promise<ServerMember> {
	return server.member || (await server.fetchMember(client.user!.id));
}

// Utility functions
async function storeInfraction(infraction: Infraction): Promise<{ userWarnCount: number }> {
	const [, previousInfractions] = await Promise.all([
		dbs.INFRACTIONS.insertOne(infraction),
		dbs.INFRACTIONS.find({
			server: infraction.server,
			user: infraction.user,
			_id: { $not: { $eq: infraction._id } },
		}).toArray(),
	]);

	return { userWarnCount: previousInfractions.length + 1 };
}

async function uploadFile(file: any, filename: string): Promise<string> {
	const data = new FormData();
	data.append("file", new Blob([file], { type: "application/octet-stream" }), filename);

	const response = await fetch(client.configuration?.features.autumn.url + "/attachments", { method: "POST", body: data });
	if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
	const json = (await response.json()) as { id: string };
	return json.id;
}

async function sendLogMessage(config: LogConfig, content: LogMessage) {
	if (config.stoat?.channel) {
		let c = { ...content, ...content.overrides?.stoat };
		try {
			const channel = client.channels.get(config.stoat.channel) || (await client.channels.fetch(config.stoat.channel));

			let message = "";
			let embed: SendableEmbed | undefined = undefined;
			switch (config.stoat.type) {
				case "EMBED":
					c = { ...c, ...content.overrides?.stoatEmbed };
					embed = {
						title: c.title ?? undefined,
						description: c.description ?? undefined,
						colour: c.color ?? undefined,
					};

					if (c.fields?.length) {
						for (const field of c.fields) {
							embed!.description += `\n#### ${field.title}\n${field.content}`;
						}
					}
					break;

				default: // QUOTEBLOCK, PLAIN or unspecified
					// Wrap entire message in quotes
					// please disregard this mess

					c = { ...c, ...content.overrides?.stoatQuoteblock };
					const quote = config.stoat.type == "PLAIN" ? "" : ">";

					if (c.title) message += `## ${c.title}\n`;
					if (c.description) message += `${c.description}\n`;
					if (c.fields?.length) {
						for (const field of c.fields) {
							message +=
								`${quote ? "\u200b\n" : ""}${quote}### ${field.title}\n` +
								`${quote}${field.content
									.trim()
									.split("\n")
									.join("\n" + quote)}\n${quote ? "\n" : ""}`;
						}
					}

					message = message
						.trim()
						.split("\n")
						.join("\n" + quote);
					if (c.image?.url) message += `\n[Attachment](${c.image.url})`;
					break;
			}

			channel
				.sendMessage({
					content: message,
					embeds: embed ? [embed] : undefined,
					attachments: content.attachments ? await Promise.all(content.attachments?.map((a) => uploadFile(a.content, a.name))) : undefined,
				})
				.catch((e) => console.error(`Failed to send log message (stoat): ${e}`));
		} catch (e) {
			console.error(`Failed to send log message in ${config.stoat.channel}: ${e}`);
		}
	}
}

/**
 * Attempts to escape a message's markdown content (quotes, headers, **bold** / *italic*, etc)
 */
function sanitizeMessageContent(msg: string): string {
	let str = "";
	for (let line of msg.split("\n")) {
		line = line.trim();

		if (
			line.startsWith("#") || // headers
			line.startsWith(">") || // quotes
			line.startsWith("|") || // tables
			line.startsWith("*") || // unordered lists
			line.startsWith("-") || // ^
			line.startsWith("+") // ^
		) {
			line = `\\${line}`;
		}

		// Ordered lists can't be escaped using `\`,
		// so we just put an invisible character \u200b
		if (/^[0-9]+[)\.].*/gi.test(line)) {
			line = `\u200b${line}`;
		}

		for (const char of ["_", "!!", "~", "`", "*", "^", "$"]) {
			line = line.replace(new RegExp(`(?<!\\\\)\\${char}`, "g"), `\\${char}`);
		}

		// Mentions
		line = line.replace(/<@/g, `<\\@`);

		str += line + "\n";
	}

	return str;
}

function embed(content: string, title?: string | null, color?: string | EmbedColor): SendableEmbed {
	return {
		description: content,
		title: title as string | undefined,
		colour: color ?? undefined,
	};
}

function dedupeArray<T>(...arrays: T[][]): T[] {
	const found: T[] = [];

	for (const array of arrays) {
		for (const item of array) {
			if (!found.includes(item)) found.push(item);
		}
	}

	return found;
}

async function getMutualServers(user: User) {
	const servers: Server[] = [];
	// Iterate the bot's actual servers, not the member cache (which is event-driven and incomplete).
		for (const server of client.servers.values()) {
			try {
				const cached = client.serverMembers.getByKey({ server: server.id, user: user.id });
				if (cached) { servers.push(server); continue; }
				const fetched = await server.fetchMember(user.id);
				if (fetched) servers.push(server);
			} catch (_e) { /* skip unreachable servers */ }
	}
	return servers;
}

const awaitClient = () =>
	new Promise<void>(async (resolve) => {
		if (!client.user) client.once("ready", () => resolve());
		else resolve();
	});

const getDmChannel = async (user: string | { id: string } | User) => {
	if (typeof user == "string") {
		user = client.users.get(user) || (await client.users.fetch(user));
	}

	if (!(user instanceof User)) {
		user = client.users.get(user.id) || (await client.users.fetch(user.id));
	}

	return Array.from(client.channels.values()).find((c: Channel) => c.type == "DirectMessage" && c.recipient?.id == (user as User).id) || (await (user as User).openDM());
};

const generateInfractionDMEmbed = (server: Server, _serverConfig: ServerConfig, infraction: Infraction, message: Message) => {
	const embed: SendableEmbed = {
		title: server.name,
		icon_url: server.icon?.createFileURL({ max_side: 128 } as any),
		colour: "#ff9e2f",
		url: message.url,
		description:
			"You have been " +
			(infraction.actionType ? `**${infraction.actionType == "ban" ? "banned" : "kicked"}** from ` : `**warned** in `) +
			`'${sanitizeMessageContent(server.name).trim()}' <t:${Math.round(infraction.date / 1000)}:R>.\n` +
			`**Reason:** ${infraction.reason}\n` +
			`**Moderator:** [@${sanitizeMessageContent(message.author?.username || "Unknown")}](/@${message.authorId})\n` +
			`**Infraction ID:** \`${infraction._id}\`` +
			(infraction.actionType == "ban" && infraction.expires
				? infraction.expires == Infinity
					? "\n**Ban duration:** Permanent"
					: `\n**Ban expires** <t:${Math.round(infraction.expires / 1000)}:R>`
				: "") +
			(infraction.actionType == "ban"
				? "\n\n**Reminder:** Circumventing this ban by using another account is a violation of [Stoat Policies](<https://stoat.chat/legal>) and may result in your accounts getting suspended from the platform."
				: ""),
	};


	return embed;
};

// Copied from https://github.com/janderedev/feeds-bot/blob/master/src/util.ts
const yesNoMessage = (channel: Channel, allowedUser: string, message: string, title?: string, messageYes?: string, messageNo?: string): Promise<boolean> =>
	new Promise(async (resolve, reject) => {
		const EMOJI_YES = "✅",
			EMOJI_NO = "❌";
		try {
			const msg = await channel.sendMessage({
				embeds: [
					{
						colour: "var(--status-streaming)",
						title: title,
						description: message,
					},
				],
				interactions: {
					reactions: [EMOJI_YES, EMOJI_NO],
					restrict_reactions: true,
				},
			});

			let destroyed = false;
			const cb = async (m: Message, userId: string, emoji: string) => {
				if (m.id != msg.id) return;
				if (userId != allowedUser) return;

				switch (emoji) {
					case EMOJI_YES:
						client.removeListener("messageReactionAdd", cb);
						destroyed = true;
						resolve(true);
						msg
							.edit({
								embeds: [
									{
										colour: "var(--success)",
										title: title,
										description: `${EMOJI_YES} ${messageYes ?? "Confirmed!"}`,
									},
								],
							})
							.catch((e) => console.error(e));
						break;

					case EMOJI_NO:
						client.removeListener("messageReactionAdd", cb);
						destroyed = true;
						resolve(false);
						msg
							.edit({
								embeds: [
									{
										colour: "var(--error)",
										title: title,
										description: `${EMOJI_NO} ${messageNo ?? "Cancelled."}`,
									},
								],
							})
							.catch((e) => console.error(e));
						break;

					default:
						console.warn("Received unexpected reaction: " + emoji);
				}
			};
			client.on("messageReactionAdd", cb);

			setTimeout(() => {
				if (!destroyed) {
					resolve(false);
					client.removeListener("messageReactionAdd", cb);
					msg
						.edit({
							embeds: [
								{
									colour: "var(--error)",
									title: title,
									description: `${EMOJI_NO} Timed out`,
								},
							],
						})
						.catch((e) => console.error(e));
				}
			}, 30000);
		} catch (e) {
			reject(e);
		}
	});

// Get all cached members of a server. Whoever put STRINGIFIED JSON as map keys is now on my hit list.
const getMembers = (id: string) =>
	Array.from(client.serverMembers.entries())
		.filter((item) => item[0].includes(`"${id}"`))
		.map((entry) => entry[1]);

const memberRanking = (member: ServerMember) => {
	const inferior = (member.server?.member?.ranking ?? Infinity) < member.ranking;
	const kickable = member.server?.havePermission("KickMembers") && inferior;
	const bannable = member.server?.havePermission("BanMembers") && inferior;

	return { inferior, kickable, bannable };
};

/**
 * Converts a 2D array to a CSV string with proper escaping.
 */
const arrayToCsv = (data: string[][]): string => {
	return data
		.map((row) =>
			row
				.map((cell) => {
					if (cell.includes(",") || cell.includes('"') || cell.includes("\n")) {
						return `"${cell.replace(/"/g, '""')}"`;
					}
					return cell;
				})
				.join(","),
		)
		.join("\n");
};

/**
 * Returns a human-readable relative time string (e.g. "3 hours ago", "in 2 days").
 * @param date - timestamp in milliseconds
 * @param withoutSuffix - if true, omits the "ago"/"in" prefix/suffix (dayjs-compatible)
 */
const formatRelativeTime = (date: number, withoutSuffix?: boolean): string => {
	const diff = date - Date.now();
	const absDiff = Math.abs(diff);
	const seconds = Math.floor(absDiff / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);
	const weeks = Math.floor(days / 7);
	const months = Math.floor(days / 30);
	const years = Math.floor(days / 365);

	const isPast = diff < 0;

	const format = (value: number, unit: string): string => {
		const s = `${value} ${unit}${value !== 1 ? "s" : ""}`;
		if (withoutSuffix) return s;
		return isPast ? `${s} ago` : `in ${s}`;
	};

	if (years > 0) return format(years, "year");
	if (months > 0) return format(months, "month");
	if (weeks > 0) return format(weeks, "week");
	if (days > 0) return format(days, "day");
	if (hours > 0) return format(hours, "hour");
	if (minutes > 0) return format(minutes, "minute");
	return format(Math.max(seconds, 0), "second");
};

/**
 * Parses a duration string like "7d", "24h", "30m" into milliseconds.
 * Returns 0 if the input doesn't match the expected pattern.
 */
const parseDuration = (input: string): number => {
	if (!input || !/([0-9]{1,3}[smhdwy])+/g.test(input)) return 0;

	const pieces = input.match(/([0-9]{1,3}[smhdwy])/g) ?? [];
	let total = 0;

	for (const piece of pieces) {
		const num = Number(piece.slice(0, piece.length - 1));
		const letter = piece.slice(piece.length - 1);
		let multiplier = 0;

		switch (letter) {
			case "s": multiplier = 1000; break;
			case "m": multiplier = 1000 * 60; break;
			case "h": multiplier = 1000 * 60 * 60; break;
			case "d": multiplier = 1000 * 60 * 60 * 24; break;
			case "w": multiplier = 1000 * 60 * 60 * 24 * 7; break;
			case "y": multiplier = 1000 * 60 * 60 * 24 * 365; break;
		}

		total += num * multiplier;
	}

	return total;
};

export {
	getOwnMemberInServer,
	isModerator,
	isBotManager,
	getPermissionLevel,
	getPermissionBasedOnRole,
	parseUser,
	parseUserOrId,
	storeInfraction,
	uploadFile,
	sanitizeMessageContent,
	sendLogMessage,
	embed,
	dedupeArray,
	awaitClient,
	getMutualServers,
	getDmChannel,
	generateInfractionDMEmbed,
	yesNoMessage,
	getMembers,
	memberRanking,
	EmbedColor,
	NO_MANAGER_MSG,
	ULID_REGEX,
	USER_MENTION_REGEX,
	CHANNEL_MENTION_REGEX,
	arrayToCsv,
	formatRelativeTime,
	parseDuration,
};
