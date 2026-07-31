import { ulid } from "ulid";
import crypto from "crypto";
import { client, dbs } from "../..";
import Infraction from "automod-lib/dist/types/antispam/Infraction";
import InfractionType from "automod-lib/dist/types/antispam/InfractionType";
import { getOwnMemberInServer, storeInfraction } from "../util";
import { fetchUsername } from "./mod_logs";
import { DEFAULT_PREFIX } from "./command_handler";
import { UserSystemMessage } from "../../stoat/index.js";

const DM_SESSION_LIFETIME = 1000 * 60 * 5;

// Listen to system messages
client.on("messageCreate", async (message) => {
	let systemMessage = message.systemMessage;

	if (systemMessage)
		switch (systemMessage.type) {
			case "user_kicked":
			case "user_banned":
				try {
					let sysMsg = systemMessage as UserSystemMessage;
					let recentEvents = await dbs.INFRACTIONS.findOne({
						date: { $gt: Date.now() - 30000 },
						user: sysMsg.userId,
						server: message.channel!.serverId!,
						actionType: sysMsg.type == "user_kicked" ? "kick" : "ban",
					});

					if (!message.channel || !sysMsg.userId || recentEvents) return;

					const actionType = sysMsg.type == "user_kicked" ? ("kick" as const) : ("ban" as const);
					const actorName = sysMsg.by ? await fetchUsername(sysMsg.by).catch(() => "Unknown") : "Unknown";
					const reason = `${actionType === "kick" ? "Kicked" : "Banned"} by ${actorName} (caught system message)`;

					storeInfraction({
						_id: ulid(),
						createdBy: sysMsg.by || null,
						reason,
						date: message.createdAt.getTime(),
						server: message.channel!.serverId,
						type: InfractionType.Manual,
						user: sysMsg.userId,
						actionType,
					} as Infraction).catch(console.warn);
				} catch (e) {
					console.error(e);
				}
				break;
			case "user_joined":
				break;
			case "user_left":
				break;
		}
});

// DM message based API session token retrieval
client.on("messageCreate", async (message) => {
	try {
		if (message.channel?.type == "DirectMessage" && message.nonce?.startsWith("REQUEST_SESSION_TOKEN-") && message.content?.toLowerCase().startsWith("requesting session token.")) {
			console.info("Received session token request in DMs.");

			const token = crypto.randomBytes(48).toString("base64").replace(/=/g, "");

			await client.db.collection("sessions").insertOne({
				user: message.authorId,
				token: token,
				nonce: message.nonce,
				invalid: false,
				expires: Date.now() + DM_SESSION_LIFETIME,
			});

			await message.channel.sendMessage({
				content: `Token request granted. **Do not send the content of this message to anyone!**\n$%${token}%$`,
				replies: [{ id: message.id, mention: false }],
			});
			return;
		}
	} catch (e) {
		console.error(e);
	}
});

// Send a message when added to a server
client.on("serverCreate", async (server) => {
	console.log(`Joined new server: ${server.name} (${server.id})`);

	const member = await getOwnMemberInServer(server).catch((e) => {
		console.warn("Cannot send hello message: Failed to fetch own member in server:", e);
		return undefined;
	});

	const channels = server.channels.filter((c) => c && c.type == "TextChannel");

	// Filter by permissions when possible, but never reject ALL channels
	let candidates = channels;
	if (member) {
		const permitted = channels.filter((c) => member.hasPermission(c, "SendMessage"));
		if (permitted.length > 0) {
			candidates = permitted;
		}
	}

	// Attempt to find an appropriate channel, otherwise use the first one available
	let channel =
		candidates.find((c) => c?.name?.toLowerCase() == "welcome") ||
		candidates.find((c) => c?.name?.toLowerCase() == "general") ||
		candidates.find((c) => c?.name?.toLowerCase() == "bots") ||
		candidates.find((c) => c?.name?.toLowerCase() == "spam") ||
		candidates[0];

	if (!channel) {
		console.warn("Cannot send hello message: No suitable channel found in server", server.id);
		return;
	}
	channel
		.sendMessage({
			content: `## Hey ${server.name}!\nThanks for trusting AutoMod to protect and manage your community.\nThis bot's prefix is "${DEFAULT_PREFIX}", but you can also @mention it instead.\nCheck out \`${DEFAULT_PREFIX}help\` to get started!\n\nFull setup guide: <https://automod.vale.rocks/docs/automod/setup>`,
		})
		.catch((e) => console.warn("Cannot send hello message:", e));
});

client.on("error", (err) => console.error("Client error:", err));

client.on("disconnected", () => console.warn("Client disconnected!"));

client.events.on("state", (state) => {
	switch (state) {
		case 2:
			console.info("Connection state: Connected");
			break;
		case 1:
			console.info("Connection state: Connecting");
			break;
		case 3:
			console.info("Connection state: Disconnected");
			break;
		case 0:
			console.info("Connection state: Idle");
			break;
	}
});
