import { ServerMember, User, Server, Channel, Message } from "stoat.js";
import { client, dbs } from "..";
import Infraction from "automod-lib/dist/types/antispam/Infraction";
import FormData from "form-data";
import axios from "axios";
import LogConfig from "automod-lib/dist/types/LogConfig";
import LogMessage from "automod-lib/dist/types/LogMessage";
import { isSudo } from "./commands/owner/override";
import type { SendableEmbed } from "stoat-api";
import ServerConfig from "automod-lib/dist/types/ServerConfig";

const NO_MANAGER_MSG = "Missing permission";
const ULID_REGEX = /^[0-9A-HJ-KM-NP-TV-Z]{26}$/i;
const USER_MENTION_REGEX = /^<@[0-9A-HJ-KM-NP-TV-Z]{26}>$/i;
const CHANNEL_MENTION_REGEX = /^<#[0-9A-HJ-KM-NP-TV-Z]{26}>$/i;
const RE_HTTP_URI = /^https?:\/\//;
const RE_MAILTO_URI = /^mailto:/;

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

	if (member.hasPermission(server, "KickMembers")) return true;

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
	if (member instanceof User) {
		member = client.serverMembers.getByKey({ server: server.id, user: member.id }) || (await server.fetchMember(member.id));
	}

	if (isSudo(member.user!)) return 3;
	if (member.hasPermission(server, "ManageServer")) return 3;

	const config = await dbs.SERVERS.findOne({ id: server.id });

	if (config?.botManagers?.includes(member.id.user)) return 2;
	if (config?.moderators?.includes(member.id.user) || member.hasPermission(server, "KickMembers")) return 1;

	return 0;
}

function getPermissionBasedOnRole(member: ServerMember): 0 | 1 | 2 | 3 {
	if (member.hasPermission(member.server!, "ManageServer")) return 3;
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
	data.append("file", file, { filename });

	const response = await axios.post(client.configuration?.features.autumn.url + "/attachments", data, {
		headers: data.getHeaders(),
	});
	return response.data.id;
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
						title: c.title,
						description: c.description,
						colour: c.color,
					};

					if (c.fields?.length) {
						for (const field of c.fields) {
							embed.description += `\n#### ${field.title}\n${field.content}`;
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
		title: title,
		colour: color,
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

function getMutualServers(user: User) {
	const servers: Server[] = [];
	for (const member of client.serverMembers.entries()) {
		if (member[1].id.user == user.id && member[1].server) servers.push(member[1].server);
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

const generateInfractionDMEmbed = (server: Server, serverConfig: ServerConfig, infraction: Infraction, message: Message) => {
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

	if (serverConfig.contact) {
		if (RE_MAILTO_URI.test(serverConfig.contact)) {
			embed.description +=
				`\n\nIf you wish to appeal this decision, you may contact the server's moderation team at ` + `[${serverConfig.contact.replace(RE_MAILTO_URI, "")}](${serverConfig.contact}).`;
		} else if (RE_HTTP_URI.test(serverConfig.contact)) {
			embed.description += `\n\nIf you wish to appeal this decision, you may do so [here](${serverConfig.contact}).`;
		} else {
			embed.description += `\n\n${serverConfig.contact}`;
		}
	}

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
};
