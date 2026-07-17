import SimpleCommand from "../../../struct/commands/SimpleCommand";
import CommandCategory from "../../../struct/commands/CommandCategory";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import { ServerMember, Channel, Server } from "../../../stoat/index.js";
import { ULID_REGEX } from "../../util";
import { decodeTime } from "ulid";

type MentionType = "user" | "channel" | "role" | "emoji" | null;

const USER_MENTION_RE = /^<@([a-zA-Z0-9]+)>$/;
const CHANNEL_MENTION_RE = /^<#([a-zA-Z0-9]+)>$/;
const ROLE_MENTION_RE = /^<%([a-zA-Z0-9]+)>$/;
const CUSTOM_EMOJI_RE = /^:([a-zA-Z0-9]+):$/;

const parseMention = (input: string): { id: string; type: MentionType } => {
	const m = input.match(USER_MENTION_RE);
	if (m) return { id: m[1], type: "user" };
	const cm = input.match(CHANNEL_MENTION_RE);
	if (cm) return { id: cm[1], type: "channel" };
	const rm = input.match(ROLE_MENTION_RE);
	if (rm) return { id: rm[1], type: "role" };
	const em = input.match(CUSTOM_EMOJI_RE);
	if (em) return { id: em[1], type: "emoji" };
	return { id: input, type: null };
};

const normalizeEmoji = (emoji: string) => emoji.replace(/[️︎]/g, "");

const isUnicodeEmoji = (input: string): boolean => {
	const cleaned = normalizeEmoji(input);
	const chars = [...cleaned];
	return chars.length > 0 && chars.every((c) => /\p{Extended_Pictographic}/u.test(c) || /\p{Emoji_Component}/u.test(c) || c === "\uFE0E" || c === "\uFE0F");
};

const codepoints = (input: string): string => [...input].map((c) => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`).join(" ");

const fmtDate = (date: Date): string => {
	const s = Math.round(date.getTime() / 1000);
	return `<t:${s}:F> (<t:${s}:R>)`;
};

const fmtCreated = (ulid: string): string => `Created: ${fmtDate(new Date(decodeTime(ulid)))}`;

const fmtHeader = (type: string, name: string, id: string): string => `${type}: \`${name}\`${name !== id ? ` (\`${id}\`)` : ""}`;

const fmtUsername = (user: any): string => {
	if (!user) return "";
	const disc = user.discriminator && user.discriminator !== "0000" ? `#${user.discriminator}` : "";
	return `${user.username}${disc}`;
};

const roleNames = (roleIds: string[], server: any): string[] =>
	roleIds
		.map((rid) => server?.roles?.get(rid))
		.filter(Boolean)
		.map((r: any) => r.name)
		.filter(Boolean);

interface EntityLines {
	header: string;
	details: string[];
}

function userInfo(member: ServerMember): EntityLines {
	const uid = member.id.user;
	const user = member.user;
	const name = fmtUsername(user) || uid;
	const details: string[] = [];

	details.push(fmtCreated(uid));
	if (member.nickname) details.push(`Nickname: \`${member.nickname}\``);

	const rn = roleNames(member.roles, member.server);
	if (rn.length) details.push(`Roles: ${rn.map((r) => `\`${r}\``).join(", ")}`);

	if (member.joinedAt) details.push(`Joined: ${fmtDate(member.joinedAt)}`);

	return { header: fmtHeader("User", name, uid), details };
}

function userInfoFallback(uid: string): EntityLines {
	return { header: fmtHeader("User ID", uid, uid), details: [fmtCreated(uid)] };
}

function channelInfo(channel: Channel): EntityLines {
	const details: string[] = [];
	details.push(fmtCreated(channel.id));
	details.push(`Type: \`${channel.type ?? "Unknown"}\``);
	if (channel.server) details.push(`Server: \`${channel.server.name}\` (\`${channel.server.id}\`)`);
	else if (channel.serverId) details.push(`Server ID: \`${channel.serverId}\``);
	return { header: fmtHeader("Channel", `#${channel.name ?? channel.id}`, channel.id), details };
}

function channelInfoFallback(id: string): EntityLines {
	return { header: fmtHeader("Channel ID", id, id), details: [fmtCreated(id)] };
}

function roleInfo(id: string, data: any): EntityLines {
	const details: string[] = [];
	details.push(fmtCreated(id));
	if (data.rank != null) details.push(`Rank: \`${data.rank}\``);
	const color = data.colour ?? data.color;
	if (color) details.push(`Colour: \`${color}\``);
	if (data.hoist != null) details.push(`Hoisted: \`${data.hoist ? "Yes" : "No"}\``);
	return { header: fmtHeader("Role", data.name ?? id, id), details };
}

function roleInfoFallback(id: string): EntityLines {
	return { header: fmtHeader("Role ID", id, id), details: [fmtCreated(id)] };
}

function serverInfo(server: Server): EntityLines {
	const details: string[] = [];
	details.push(fmtCreated(server.id));
	if (server.owner) details.push(`Owner: \`${fmtUsername(server.owner)}\` (\`${server.owner.id}\`)`);
	else if (server.ownerId) details.push(`Owner ID: \`${server.ownerId}\``);
	details.push(`Channels: \`${server.channelIds.length}\``);
	details.push(`Roles: \`${server.roles?.size ?? 0}\``);
	if (server.discoverable) details.push(`Discoverable: \`Yes\``);
	return { header: fmtHeader("Server", server.name, server.id), details };
}

function customEmojiInfo(id: string): EntityLines {
	return { header: fmtHeader("Emoji", id, id), details: [fmtCreated(id)] };
}

function unicodeEmojiInfo(input: string): EntityLines {
	const cleaned = normalizeEmoji(input);
	return { header: `Emoji: ${cleaned}`, details: [`Codepoints: \`${codepoints(input)}\``] };
}

function genericFallback(id: string): EntityLines {
	return { header: fmtHeader("ID", id, id), details: [fmtCreated(id)] };
}

function memberLines(entity: EntityLines): string[] {
	return [entity.header, ...entity.details];
}

function selfInfo(ctx: MessageCommandContext): string[] {
	const lines: string[] = [];
	const sid = ctx.channel?.serverId || "None";
	if (ctx.server) lines.push(fmtHeader("Server", ctx.server.name, sid));
	else lines.push(fmtHeader("Server ID", sid, sid));
	if (ctx.channel) lines.push(fmtHeader("Channel", `#${ctx.channel.name}`, ctx.channelId));
	else lines.push(fmtHeader("Channel ID", ctx.channelId, ctx.channelId));
	if (ctx.author) lines.push(fmtHeader("User", fmtUsername(ctx.author), ctx.authorId));
	else lines.push(fmtHeader("User ID", ctx.authorId, ctx.authorId));
	return lines;
}

const findChannelInServer = (id: string, ctx: MessageCommandContext): Channel | undefined => ctx.server?.channels.find((c: any) => c.id === id);
const findRoleInServer = (id: string, ctx: MessageCommandContext): any => ctx.server?.roles?.get(id);

type Resolved = { type: "server" | "channel" | "role"; data: any } | null;

function resolveInServer(id: string, ctx: MessageCommandContext): Resolved {
	if (ctx.server?.id === id) return { type: "server", data: ctx.server };
	const ch = findChannelInServer(id, ctx);
	if (ch) return { type: "channel", data: ch };
	const rd = findRoleInServer(id, ctx);
	if (rd) return { type: "role", data: { ...rd } };
	return null;
}

function formatReplyInfo(message: MessageCommandContext): string {
	if (!message.replyIds?.length) return "";
	return message.replyIds
		.map((rid, i) => {
			const ts = decodeTime(rid);
			const label = message.replyIds!.length > 1 ? `**Replied Message ${i + 1}:**` : `**Replied Message:**`;
			return `${label}\nMessage ID: \`${rid}\`\nCreated: ${fmtDate(new Date(ts))}`;
		})
		.join("\n\n");
}

export default {
	name: "info",
	aliases: ["debug"],
	description: "Provides information about a given ULID, user, channel, role, or emoji.",
	documentation: "/miscellaneous/info",
	category: CommandCategory.Miscellaneous,
	run: async (message: MessageCommandContext, args: string[]) => {
		const [input] = args;

		const replyPrefix = message.replyIds?.length ? formatReplyInfo(message) + "\n\n**Input Info:**\n" : "";

		if (message.replyIds?.length && !input) {
			await message.reply(formatReplyInfo(message));
			return;
		}

		if (!input) {
			await message.reply(selfInfo(message).join("\n"));
			return;
		}

		const { id, type } = parseMention(input);

		if (!ULID_REGEX.test(id)) {
			if (isUnicodeEmoji(input)) {
				const entity = unicodeEmojiInfo(input);
				await message.reply(replyPrefix + memberLines(entity).join("\n"));
			} else {
				await message.reply(`${replyPrefix}\`${input}\` is not a valid input. Please mention a user, role, or channel, provide a ULID, or use an emoji.`);
			}
			return;
		}

		const lines: string[] = [];

		if (type === "user") {
			const member = await message.server?.fetchMember(id);
			lines.push(...memberLines(member ? userInfo(member) : userInfoFallback(id)));
		} else if (type === "channel") {
			const ch = findChannelInServer(id, message);
			lines.push(...memberLines(ch ? channelInfo(ch) : channelInfoFallback(id)));
		} else if (type === "role") {
			const rd = findRoleInServer(id, message);
			lines.push(...memberLines(rd ? roleInfo(id, rd) : roleInfoFallback(id)));
		} else if (type === "emoji") {
			lines.push(...memberLines(customEmojiInfo(id)));
		} else {
			const resolved = resolveInServer(id, message);
			if (resolved) {
				if (resolved.type === "server") lines.push(...memberLines(serverInfo(resolved.data)));
				else if (resolved.type === "channel") lines.push(...memberLines(channelInfo(resolved.data)));
				else if (resolved.type === "role") lines.push(...memberLines(roleInfo(id, resolved.data)));
			} else {
				try {
					const member = await message.server?.fetchMember(id);
					lines.push(...memberLines(member ? userInfo(member) : genericFallback(id)));
				} catch {
					lines.push(...memberLines(genericFallback(id)));
				}
			}
		}

		await message.reply(replyPrefix + lines.join("\n"));
	},
} as SimpleCommand;
