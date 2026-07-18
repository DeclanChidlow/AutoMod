import { ulid } from "ulid";
import { client, dbs } from "../..";
import MessageCommandContext from "../../struct/MessageCommandContext";
import ServerConfig from "automod-lib/dist/types/ServerConfig";
import { User } from "../../stoat/index.js";
import { getPermissionLevel, parseUser } from "../util";
import { logModAction } from "./mod_logs";

type VoteType = "kick" | "ban" | "timeout";

interface VoteSession {
	type: VoteType;
	serverId: string;
	channelId: string;
	targetId: string;
	messageId: string;
	originatorId: string;
	startedAt: number;
	windowMs: number;
	onPass: (target: User) => Promise<void>;
}

interface VoteOptions {
	type: VoteType;
	isModerator: boolean;
	onPass: (target: User) => Promise<void>;
	logActionType: "kick" | "ban" | "timeout";
	logActionReason: string;
	passMessage: (target: User, votesCount: number, votesRequired: number) => string;
}

const EMOJI_YES = "✅";

const activeSessions = new Map<string, VoteSession>();
const sessionsByMessage = new Map<string, VoteSession>();

function sessionKey(serverId: string, targetId: string, type: VoteType): string {
	return `${serverId}:${targetId}:${type}`;
}

function isTypeEnabled(config: ServerConfig | null | undefined, type: VoteType): boolean {
	if (!config?.votekick) return false;
	switch (type) {
		case "kick":
			return config.votekick.kickEnabled ?? config.votekick.enabled ?? false;
		case "ban":
			return config.votekick.banEnabled ?? config.votekick.enabled ?? false;
		case "timeout":
			return config.votekick.timeoutEnabled ?? config.votekick.enabled ?? false;
	}
}

function formatExpiry(expiresAt: number): string {
	return `<t:${Math.floor(expiresAt / 1000)}:R>`;
}

function cleanupSession(session: VoteSession) {
	sessionsByMessage.delete(session.messageId);
	activeSessions.delete(sessionKey(session.serverId, session.targetId, session.type));
}

client.on("messageReactionAdd", async (message, userId, emoji) => {
	try {
		if (userId === client.user?.id) return;

		const session = sessionsByMessage.get(message.id);
		if (!session) return;
		if (Date.now() - session.startedAt > session.windowMs) {
			cleanupSession(session);
			return;
		}

		if (emoji === EMOJI_YES) {
			await processReactionVote(session, userId);
		}
	} catch (e) {
		console.error("Vote reaction error:", e);
	}
});

async function processReactionVote(session: VoteSession, userId: string) {
	const recentVotes = await dbs.VOTEKICKS.find({
		server: session.serverId,
		target: session.targetId,
		type: session.type,
		time: { $gt: Date.now() - session.windowMs },
		ignore: false,
	}).toArray();

	if (recentVotes.find((v) => v.user === userId)) return;

	const target = await client.users.fetch(session.targetId);
	if (!target) return;
	if ((target as any)?.bot != null) return;
	if ((await getPermissionLevel(target, { id: session.serverId } as any)) > 0) return;

	const voteEntry = {
		id: ulid(),
		type: session.type,
		target: session.targetId,
		user: userId,
		server: session.serverId,
		time: Date.now(),
		ignore: false,
		messageId: session.messageId,
	};
	await dbs.VOTEKICKS.insertOne(voteEntry);

	await checkThresholdAndAct(session, recentVotes.length + 1);
}

async function checkThresholdAndAct(session: VoteSession, votesCount: number) {
	const config = await dbs.SERVERS.findOne({ id: session.serverId });
	const cfg = config?.votekick;
	const votesRequired = session.type === "kick" ? cfg?.kickVotesRequired || 3 : session.type === "ban" ? cfg?.banVotesRequired || 3 : cfg?.timeoutVotesRequired || 3;

	if (votesCount >= votesRequired) {
		const target = await client.users.fetch(session.targetId);

		await session.onPass(target);

		const channel = await client.channels.get(session.channelId);
		if (channel) {
			const actionLabel = session.type.charAt(0).toUpperCase() + session.type.slice(1);
			channel
				.sendMessage(
					`**${votesCount}/${votesRequired}** votes reached on the **${actionLabel}** vote. <@${session.targetId}> has been ${session.type === "kick" ? "kicked" : session.type === "ban" ? "banned" : "timed out"}.`,
				)
				.catch(() => {});
		}

		await dbs.VOTEKICKS.updateMany(
			{
				server: session.serverId,
				target: session.targetId,
				type: session.type,
				ignore: false,
			},
			{ $set: { ignore: true } },
		);

		cleanupSession(session);
	} else {
		await updateVoteMessage(session, votesCount);
	}
}

function buildVoteMessageContent(type: VoteType, targetUsername: string, votesCount: number, votesRequired: number, startedAt: number, windowMs: number): string {
	const actionLabel = type.charAt(0).toUpperCase() + type.slice(1);
	const expiryTime = startedAt + windowMs;
	const actionVerb = type === "kick" ? "kick" : type === "ban" ? "ban" : "timeout";
	return (
		`**Vote ${actionLabel}**: @${targetUsername}\n` +
		`A community vote to ${actionVerb} this user has been started. ` +
		`React with ✅ to cast your vote.\n` +
		`**${votesCount}/${votesRequired}** votes. Ends ${formatExpiry(expiryTime)}`
	);
}

async function updateVoteMessage(session: VoteSession, votesCount: number) {
	try {
		const channel = await client.channels.get(session.channelId);
		if (!channel) return;

		const config = await dbs.SERVERS.findOne({ id: session.serverId });
		const cfg = config?.votekick;
		const votesRequired = session.type === "kick" ? cfg?.kickVotesRequired || 3 : session.type === "ban" ? cfg?.banVotesRequired || 3 : cfg?.timeoutVotesRequired || 3;
		const target = await client.users.fetch(session.targetId);

		const msg = await channel.fetchMessage(session.messageId);
		if (msg) {
			msg
				.edit({
					content: buildVoteMessageContent(session.type, target?.username ?? session.targetId, votesCount, votesRequired, session.startedAt, session.windowMs),
				})
				.catch(() => {});
		}
	} catch (e) {
		// message may have been deleted
	}
}

async function handleVoteCommand(message: MessageCommandContext, args: string[], serverConfig: ServerConfig | null | undefined, options: VoteOptions): Promise<void> {
	try {
		if (!isTypeEnabled(serverConfig, options.type)) {
			const base = "This vote type is not enabled for this server.";
			if (options.isModerator) {
				return message.reply(base + " It can be enabled from the server dashboard.");
			}
			return message.reply(base);
		}

		const cfg = serverConfig?.votekick;
		if (!cfg) return message.reply("Vote moderation is not configured for this server.");

		const voteDurationMin = options.type === "kick" ? cfg.kickVoteDuration || 1 : options.type === "ban" ? cfg.banVoteDuration || 1 : cfg.timeoutVoteDuration || 1;
		const votesRequired = options.type === "kick" ? cfg.kickVotesRequired || 3 : options.type === "ban" ? cfg.banVotesRequired || 3 : cfg.timeoutVotesRequired || 3;

		if (!args.length) {
			const actionLabel = options.type.charAt(0).toUpperCase() + options.type.slice(1);
			return message.reply(
				`**Vote ${actionLabel} configuration:**\n` +
					`Votes required: **${votesRequired}**\n` +
					`Voting duration: **${voteDurationMin} minute${voteDurationMin !== 1 ? "s" : ""}**\n\n` +
					`Run \`/${options.type} vote <user>\` to start or cast a ${options.type} vote.`,
			);
		}

		const target = await parseUser(args[0]);
		if (!target) return message.reply("Sorry, I can't find this user.");

		if (target.id === message.authorId) {
			return message.reply("You can't vote against yourself.");
		}

		if ((target as any)?.bot != null) {
			return message.reply("You can't vote against bots.");
		}

		if (target.id === client.user!.id) {
			return message.reply("You can't vote against the bot.");
		}

		if ((await getPermissionLevel(target, message.serverContext)) > 0) {
			return message.reply("This target can not be vote-moderated.");
		}

		const voteWindowMs = voteDurationMin * 60 * 1000;

		let existingSession = activeSessions.get(sessionKey(message.serverContext.id, target.id, options.type));
		if (existingSession && Date.now() - existingSession.startedAt > voteWindowMs) {
			cleanupSession(existingSession);
			existingSession = undefined;
		}
		const hasActiveSession = !!existingSession;

		const recentVotes = await dbs.VOTEKICKS.find({
			server: message.serverContext.id,
			target: target.id,
			type: options.type,
			time: { $gt: Date.now() - voteWindowMs },
			ignore: false,
		}).toArray();

		if (recentVotes.find((v) => v.user === message.authorId)) {
			return message.reply(`You have already voted to ${options.type} this user recently.`);
		}

		const voteEntry = {
			id: ulid(),
			type: options.type,
			target: target.id,
			user: message.authorId!,
			server: message.serverContext.id,
			time: Date.now(),
			ignore: false,
		};

		await dbs.VOTEKICKS.insertOne(voteEntry);
		const votesCount = recentVotes.length + 1;

		await logModAction("votekick", message.serverContext, message.member!, target.id, "n/a", voteEntry.id, `${options.type} vote ${votesCount}/${votesRequired} for this user.`);

		if (!hasActiveSession) {
			const now = Date.now();
			const voteMsg = await message.channel!.sendMessage({
				content: buildVoteMessageContent(options.type, target.username, votesCount, votesRequired, now, voteWindowMs),
				interactions: {
					reactions: [EMOJI_YES],
					restrict_reactions: false,
				},
			});

			const session: VoteSession = {
				type: options.type,
				serverId: message.serverContext.id,
				channelId: message.channel!.id,
				targetId: target.id,
				messageId: voteMsg.id,
				originatorId: message.authorId!,
				startedAt: now,
				windowMs: voteWindowMs,
				onPass: options.onPass,
			};

			activeSessions.set(sessionKey(session.serverId, session.targetId, session.type), session);
			sessionsByMessage.set(voteMsg.id, session);
		}

		if (votesCount >= votesRequired) {
			await options.onPass(target);

			message.reply(options.passMessage(target, votesCount, votesRequired));

			await dbs.VOTEKICKS.updateMany(
				{
					server: message.serverContext.id,
					target: target.id,
					type: options.type,
					ignore: false,
				},
				{ $set: { ignore: true } },
			);

			const key = sessionKey(message.serverContext.id, target.id, options.type);
			const session = activeSessions.get(key);
			if (session) cleanupSession(session);
		} else if (hasActiveSession) {
			message.reply(`Your vote was added to the ongoing **${options.type}** vote. **${votesCount}/${votesRequired}** votes.`);
		}
	} catch (e) {
		console.error(e);
		message.reply("An error occurred: " + e);
	}
}

export { handleVoteCommand };
export type { VoteType, VoteOptions };
