import { Server, ServerMember } from "../../stoat/index.js";
import { client, dbs } from "../..";
import LogMessage from "automod-lib/dist/types/LogMessage";
import { decodeTime } from "ulid";
import { arrayToCsv, sanitizeMessageContent, sendLogMessage } from "../util";

const appURL = () => client.configuration?.app ?? "";

/**
 * Find the user who performed a deletion via the server audit log.
 * Audit entries are written around the same time the delete event fires, so we retry briefly if no matching entry is found yet.
 * Returns the actor's user ID, undefined if no matching entry exists, or null if the lookup failed.
 */
async function fetchAuditActor(serverId: string, matches: (action: any) => boolean): Promise<string | null | undefined> {
	let errored = false;
	for (let attempt = 0; attempt < 3; attempt++) {
		if (attempt > 0) await new Promise((r) => setTimeout(r, attempt * 500));
		try {
			const res = await client.api.get(`/servers/${serverId}/audit_logs`, { limit: 50 });
			for (const entry of res?.audit_logs ?? []) {
				if (matches(entry.action) && Date.now() - decodeTime(entry._id) < 15_000) {
					return entry.user;
				}
			}
		} catch (e) {
			console.error(e);
			errored = true;
		}
	}
	return errored ? null : undefined;
}

function fetchDeleteActor(serverId: string, channelId: string, authorId?: string): Promise<string | null | undefined> {
	return fetchAuditActor(serverId, (action) => action?.type === "MessageDelete" && action.channel === channelId && (!authorId || action.author === authorId));
}

function fetchBulkDeleteActor(serverId: string, channelId: string, count: number): Promise<string | null | undefined> {
	return fetchAuditActor(serverId, (action) => action?.type === "MessageBulkDelete" && action.channel === channelId && action.count === count);
}

// the `packet` event is emitted before the client's cache
// is updated, which allows us to get the old message content
// if it was cached before
client.on("messageUpdate", async (message, oldMessage) => {
	try {
		if (!message.content) return;

		if (!message.authorId) {
			// The message wasn't cached when the update arrived (eg it was sent before the bot connected).
			// Fetch it so the edit can be attributed to its author.
			await message.channel?.fetchMessage(message.id).catch(() => {});
		}

		if (message.authorId == client.user?.id) return;

		let oldMsgRaw = String(oldMessage.content ?? "(Unknown)");
		let newMsgRaw = String(message.content);
		let oldMsg = sanitizeMessageContent(oldMsgRaw) || "(Empty)";
		let newMsg = sanitizeMessageContent(newMsgRaw) || "(Empty)";

		let channel = message.channel;
		let server = channel?.server;
		if (!server || !channel) return console.warn("Received message update in unknown channel or server");
		if (oldMsg == newMsg) return console.info("Ignoring message update without edited text");

		let config = await dbs.SERVERS.findOne({ id: server.id });
		if (config?.logs?.messageUpdate) {
			const attachFullMessage = oldMsg.length > 800 || newMsg.length > 800;
			let embed: LogMessage = {
				title: `Message edited`,
				description: `**Author:** ${message.authorId ? `<@${message.authorId}>` : "Unknown"}\n` + `**Message:** [Jump to message](<${message.url}>)`,
				fields: [],
				color: "#829dff",
			};

			if (attachFullMessage) {
				embed.attachments = [
					{ name: "old_message.txt", content: Buffer.from(oldMsgRaw) },
					{ name: "new_message.txt", content: Buffer.from(newMsgRaw) },
				];
			} else {
				embed.fields!.push({ title: "Old content", content: oldMsg });
				embed.fields!.push({ title: "New content", content: newMsg });
			}

			await sendLogMessage(config.logs.messageUpdate, embed);
		}
	} catch (e) {
		console.error(e);
	}
});
client.on("messageDelete", async (message) => {
	try {
		let channel = client.channels.get(message.channelId);
		if (!channel) return;

		let msgRaw = String(message.content ?? "(Unknown)");
		let msg = sanitizeMessageContent(msgRaw);

		let config = await dbs.SERVERS.findOne({ id: channel?.server?.id });
		if (config?.logs?.messageUpdate) {
			// Link to the message before the deleted one, since the deleted message itself is gone.
			let contextId: string | undefined;
			try {
				const before = await channel.fetchMessages({ before: message.id, limit: 1 });
				contextId = before[0]?.id;
			} catch (e) {
				console.error(e);
			}

			const canViewAuditLogs = !!channel.server?.havePermission("ViewAuditLogs");
			const deleter = canViewAuditLogs ? await fetchDeleteActor(channel.serverId!, channel.id, message.authorId || undefined) : null;
			let deletedBy: string;
			if (deleter) {
				deletedBy = deleter === message.authorId ? "themselves" : `<@${deleter}>`;
			} else if (deleter === null) {
				deletedBy = "Unknown";
			} else if (message.authorId) {
				// Self-deletes aren't written to the audit log.
				deletedBy = "themselves";
			} else {
				deletedBy = "Unknown";
			}

			let embed: LogMessage = {
				title: `Message deleted`,
				description:
					`**Author:** ${message.authorId ? `<@${message.authorId}>` : "Unknown"}\n` +
					`**Deleted by:** ${deletedBy}\n` +
					(contextId ? `**Context:** [\\[Jump to context\\]](<${appURL()}${channel.path}/${contextId}>)` : ""),
				fields: [],
				color: "#ff6b6b",
			};

			if (msg.length > 1000) {
				embed.attachments?.push({ name: "message.txt", content: Buffer.from(msgRaw) });
			} else {
				embed.fields!.push({ title: "Content", content: msg || "(Empty)" });
			}

			if (message.attachments?.length) {
				let autumnURL = client.configuration?.features.autumn.url;
				embed.fields!.push({ title: "Attachments", content: message.attachments.map((a) => `[\\[${a.filename}\\]](<${autumnURL}/${a.tag}/${a.id}/${a.filename}>)`).join(" | ") });
			}

			await sendLogMessage(config.logs.messageUpdate, embed);
		}
	} catch (e) {
		console.error(e);
	}
});

client.on("messageDeleteBulk", async (messages) => {
	if (!messages || messages.length === 0) return;

	const channel = client.channels.get(messages[0].channelId);
	if (!channel) return;

	try {
		let config = await dbs.SERVERS.findOne({ id: channel.serverId });
		if (config?.logs?.messageUpdate) {
			const data: string[][] = [["Message ID", "Author ID", "Author Name", "Content", "Attachment URLs"], []];

			for (const message of messages) {
				data.push([
					message.id,
					message.authorId ?? "",
					message.authorId ? (client.users.get(message.authorId)?.username ?? "") : "",
					message.content ?? "",
					message.attachments?.map((a) => a.id).join(", ") ?? "",
				]);
			}

			const csv = arrayToCsv(data);

			// Link to the message before the deleted ones, since they themselves are gone.
			let contextId: string | undefined;
			try {
				const before = await channel.fetchMessages({ before: messages[0].id, limit: 1 });
				contextId = before[0]?.id;
			} catch (e) {
				console.error(e);
			}

			const canViewAuditLogs = !!channel.server?.havePermission("ViewAuditLogs");
			const deleter = canViewAuditLogs ? await fetchBulkDeleteActor(channel.serverId!, channel.id, messages.length) : null;

			let embed: LogMessage = {
				title: `Messages bulk deleted`,
				description:
					`${messages.length} messages deleted.\n` +
					`**Deleted by:** ${deleter ? `<@${deleter}>` : "Unknown"}\n` +
					(contextId ? `**Context:** [\\[Jump to context\\]](<${appURL()}${channel.path}/${contextId}>)` : ""),
				fields: [],
				attachments: [{ name: "messages.csv", content: Buffer.from(csv) }],
				color: "#ff392b",
			};

			await sendLogMessage(config.logs.messageUpdate, embed);
		}
	} catch (e) {
		console.error(e);
	}
});

async function logModAction(
	type: "warn" | "kick" | "ban" | "timeout" | "votekick",
	server: Server,
	mod: ServerMember,
	target: string,
	reason: string | null,
	infractionID: string,
	extraText?: string,
): Promise<void> {
	try {
		let config = await dbs.SERVERS.findOne({ id: server.id });

		if (config?.logs?.modAction) {
			let aType = type == "ban" ? "banned" : type == "timeout" ? "timed out" : type == "votekick" ? "started a vote against" : type + "ed";
			let embedColor = "#0576ff";
			if (type == "kick") embedColor = "#ff861d";
			if (type == "ban") embedColor = "#ff2f05";

			sendLogMessage(config.logs.modAction, {
				title: type == "votekick" ? "Vote started" : `User ${aType}`,
				description:
					`\`@${mod.user?.username}\` **${aType}** \`` +
					`${await fetchUsername(target)}\`${type == "warn" ? "." : ` from ${server.name}.`}\n` +
					`**Reason**: \`${reason ? reason : "No reason provided."}\`\n` +
					`**Warn ID**: \`${infractionID}\`` +
					(extraText ? `\n${extraText}` : ""),
				color: embedColor,
			});
		}
	} catch (e) {
		console.error(e);
	}
}

let fetchUsername = async (id: string, fallbackText?: string) => {
	try {
		let u = client.users.get(id) || (await client.users.fetch(id));
		return `@${u.username}`;
	} catch (e) {
		return fallbackText || "Unknown user";
	}
};

export { fetchUsername, logModAction };
