import { Message } from "../../stoat/index.js";
import { ulid } from "ulid";
import { dbs } from "../..";
import AntispamRule from "automod-lib/dist/types/antispam/AntispamRule";
import Infraction from "automod-lib/dist/types/antispam/Infraction";
import InfractionType from "automod-lib/dist/types/antispam/InfractionType";
import ModerationAction from "automod-lib/dist/types/antispam/ModerationAction";
import { generateInfractionDMEmbed, isModerator, sendLogMessage, storeInfraction } from "../util";
import { getDmChannel, sanitizeMessageContent } from "../util";
import ServerConfig from "automod-lib/dist/types/ServerConfig";
import { WORDLIST_DEFAULT_MESSAGE } from "../commands/configuration/filter";

let msgCountStore: Map<string, { users: any }> = new Map();
const MAX_STORE_ENTRIES = 10000;
const STORE_PRUNE_INTERVAL = 60_000;

// Periodically prune stale entries and enforce size cap
setInterval(() => {
	const keys = [...msgCountStore.keys()];
	if (keys.length <= MAX_STORE_ENTRIES) return;
	const toRemove = keys.slice(0, keys.length - MAX_STORE_ENTRIES);
	for (const key of toRemove) msgCountStore.delete(key);
}, STORE_PRUNE_INTERVAL);

// Per-user:channel rate limit for word filter notifications (30s cooldown)
const SENT_FILTER_MESSAGE: Set<string> = new Set();
const MAX_FILTER_COOLDOWNS = 1000;

/**
 *
 * @param message
 * @returns true if ok, false if spam rule triggered
 */
async function antispam(message: Message): Promise<boolean> {
	try {
		let serverRules = await dbs.SERVERS.findOne({ id: message.channel!.serverId! });
		if (serverRules?.antispamEnabled === false || !serverRules?.automodSettings) return true;

		let ruleTriggered = false;

		for (const rule of serverRules.automodSettings.spam) {
			if (msgCountStore.get(rule.id) == null) {
				msgCountStore.set(rule.id, { users: {} });
			}

			if (message.author?.bot) break;
			if (!message.authorId) break;
			if (serverRules.whitelist?.users?.includes(message.authorId)) break;
			if (message.member?.roles?.filter((r) => serverRules!.whitelist?.roles?.includes(r)).length) break;
			if (serverRules.whitelist?.managers !== false && (await isModerator(message, false))) break;
			if (rule.channels?.length && (!message.channelId || rule.channels.indexOf(message.channelId) == -1)) continue;

			let store = msgCountStore.get(rule.id)!;
			if (!message.authorId) break;
			if (!store.users[message.authorId]) store.users[message.authorId] = {};
			let userStore = store.users[message.authorId];

			if (!userStore.count) userStore.count = 1;
			else userStore.count++;

			setTimeout(() => {
				userStore.count--;
				if (userStore.count <= 0) {
					delete store.users[message.authorId!];
					if (Object.keys(store.users).length === 0) {
						msgCountStore.delete(rule.id);
					}
				}
			}, rule.timeframe * 1000);

			if (userStore.count > rule.max_msg) {
				console.info(`Antispam rule triggered: ${rule.max_msg}/${rule.timeframe} -> ${ModerationAction[rule.action]}`);
				ruleTriggered = true;

				switch (Number(rule.action)) {
					case ModerationAction.Delete:
						message.delete().catch(() => console.warn("Antispam: Failed to delete message"));
						break;
					case ModerationAction.Message:
						if (!userStore.warnTriggered) {
							userStore.warnTriggered = true;
							setTimeout(() => (userStore.warnTriggered = false), 5000);
							message.channel?.sendMessage(getWarnMsg(rule, message)).catch(() => console.warn("Antispam: Failed to send message"));
						}
						break;
					case ModerationAction.Warn:
						if (!userStore.warnTriggered) {
							userStore.warnTriggered = true;
							setTimeout(() => (userStore.warnTriggered = false), 5000);

							let inf = {
								_id: ulid(),
								createdBy: null,
								date: Date.now(),
								reason: `Automatic moderation rule triggered: More than ${rule.max_msg} messages per ${rule.timeframe} seconds.`,
								server: message.channel?.serverId,
								type: InfractionType.Automatic,
								user: message.authorId,
							} as Infraction;

							message.channel?.sendMessage("## User has been warned.\n\u200b\n" + getWarnMsg(rule, message)).catch(() => console.warn("Antispam: Failed to send warn message"));

							await storeInfraction(inf);
						}
						break;
					case ModerationAction.Kick:
						message.reply("(Kick user)");
						break;
					case ModerationAction.Ban:
						message.reply("(Ban user)");
						break;
					default:
						console.warn(`Unknown Moderation Action: ${rule.action}`);
				}
			}
		}

		return !ruleTriggered;
	} catch (e) {
		console.error("" + e);
		return true;
	}
}

function getWarnMsg(rule: AntispamRule, message: Message) {
	if (rule.message != null && message.authorId) {
		return rule.message.replace(new RegExp("{{userid}}", "gi"), message.authorId);
	} else return `<@${message.authorId || "unknown"}>, please stop spamming.`;
}

/**
 * Run word filter check and act on message if required
 */
async function wordFilterCheck(message: Message, config: ServerConfig) {
	try {
		if (!message.content || !message.authorId) return;
		const match = checkMessageForFilteredWords(message.content, config);
		if (!match) return;

		if (await isModerator(message, false)) return;

		console.log("Message matched word filter!");

		switch (config.wordlistAction?.action) {
			case "WARN": {
				try {
					const infraction: Infraction = {
						_id: ulid(),
						createdBy: null,
						date: Date.now(),
						reason: "Word filter triggered",
						server: message.channel!.serverId!,
						type: InfractionType.Automatic,
						user: message.authorId,
					};

					await storeInfraction(infraction);

					if (config.dmOnWarn) {
						const embed = generateInfractionDMEmbed(message.channel!.server!, config, infraction, message);
						const dmChannel = await getDmChannel(message.author!);

						if (dmChannel.havePermission("SendMessage") && dmChannel.havePermission("SendEmbeds")) {
							await dmChannel.sendMessage({ embeds: [embed] });
						} else console.warn("Missing permission to DM user.");
					}
					break;
				} catch (e) {
					console.error(e);
					break;
				}
			}
			case "DELETE": {
				if (message.channel?.havePermission("ManageMessages")) {
					const key = `${message.authorId}:${message.channelId}`;
					await message.delete();

					if (!SENT_FILTER_MESSAGE.has(key)) {
						if (SENT_FILTER_MESSAGE.size < MAX_FILTER_COOLDOWNS) SENT_FILTER_MESSAGE.add(key);
						setTimeout(() => SENT_FILTER_MESSAGE.delete(key), 30_000);
						await message.channel.sendMessage((config.wordlistAction.message || WORDLIST_DEFAULT_MESSAGE).replaceAll("{{user_id}}", message.authorId));
					}
					break;
				}
				break;
			}
			case "LOG":
			default: {
				if (!config.logs?.modAction) break;
				await sendLogMessage(config.logs.modAction, {
					title: "Message triggered word filter",
					description:
						`**Author:** @${message.author?.username} (${message.authorId})\n` +
						`**Action:** ${config.wordlistAction?.action || "LOG"}\n` +
						`#### Content\n` +
						`>${sanitizeMessageContent(message.content.substring(0, 1000)).trim().replace(/\n/g, "\n>")}`,
					color: "#ff557f",
				});
				break;
			}
		}
	} catch (e) {
		console.error(e);
	}
}

function checkMessageForFilteredWords(message: string, config: ServerConfig): boolean {
	if (!config.wordlistEnabled || !config.wordlist?.length || !message) return false;

	const words = {
		soft: config.wordlist.filter((w) => w.strictness == "SOFT").map((w) => w.word),
		hard: config.wordlist.filter((w) => w.strictness == "HARD").map((w) => w.word),
		strict: config.wordlist.filter((w) => w.strictness == "STRICT").map((w) => w.word),
	};

	const softSegments = message
		.toLowerCase()
		.replace(/[^\w\s]/g, "")
		.split(/\s+/);
	for (const word of words.soft) {
		if (softSegments.includes(word.toLowerCase())) return true;
	}

	const loweredMsg = message.toLowerCase();
	for (const word of words.hard) {
		if (loweredMsg.includes(word.toLowerCase())) return true;
	}

	if (words.strict.length > 0) {
		const replacedMsg = replaceChars(loweredMsg.replace(/\s/g, ""));
		for (const word of words.strict) {
			if (replacedMsg.includes(replaceChars(word.toLowerCase()))) return true;
		}
	}

	return false;
}

const CHAR_REPLACE: Record<string, string> = {
	"0": "o",
	"1": "i",
	"4": "a",
	"3": "e",
	"5": "s",
	"6": "g",
	"7": "t",
	"8": "b",
	"9": "g",
	"@": "a",
	"^": "a",
	"Д": "a",
	"ß": "b",
	"¢": "c",
	"©": "c",
	"<": "c",
	"€": "e",
	"ƒ": "f",
	"ท": "n",
	"И": "n",
	"Ø": "o",
	"Я": "r",
	"®": "r",
	"$": "s",
	"§": "s",
	"†": "t",
	"บ": "u",
	"พ": "w",
	"₩": "w",
	"×": "x",
	"¥": "y",
};

const CHAR_REPLACE_REGEX = new RegExp(
	Object.keys(CHAR_REPLACE)
		.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
		.join("|"),
	"g",
);

function replaceChars(input: string): string {
	return `${input}`.replace(CHAR_REPLACE_REGEX, (char) => CHAR_REPLACE[char]);
}

export { antispam, wordFilterCheck, checkMessageForFilteredWords };
