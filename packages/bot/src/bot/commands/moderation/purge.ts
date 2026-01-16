import SimpleCommand from "../../../struct/commands/SimpleCommand";
import { Message } from "stoat.js";
import { decodeTime } from "ulid";
import { isModerator, parseUserOrId } from "../../util";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import CommandCategory from "../../../struct/commands/CommandCategory";

const SYNTAX = "/purge [number] [user[,user...]]";
const MAX_PURGE_AMOUNT = 100;
const MAX_FETCH_LIMIT = 1000;
const REPLY_DELETE_DELAY = 5000;

const NUMBER_PATTERN = /^[0-9]+$/;
const ULID_PATTERN = /^[0-9A-HJ-KM-NP-TV-Z]{26}$/;
const ULID_RANGE_PATTERN = /^[0-9A-HJ-KM-NP-TV-Z]{26}-[0-9A-HJ-KM-NP-TV-Z]{26}$/;

interface PurgeOptions {
	amount?: number;
	startId?: string;
	endId?: string;
	singleId?: string;
	userFilter?: string[];
}

class PurgeHandler {
	private message: MessageCommandContext;

	constructor(message: MessageCommandContext) {
		this.message = message;
	}

	async execute(args: string[]): Promise<void> {
		if (!this.message.member || !(await isModerator(this.message))) {
			await this.message.reply(":lock: You lack permission to use this command.");
			return;
		}

		const options = this.parseArguments(args);
		if (!options) {
			await this.message.reply(`That message range cannot be parsed.\nSyntax: \`${SYNTAX}\``);
			return;
		}

		const users = await this.parseUsers(options.userFilter);
		if (!users) return; // Error already sent

		const messages = await this.fetchMessages(options, users);
		if (!messages) return; // Error already sent

		await this.deleteMessagesAndCleanup(messages);
	}

	private parseArguments(args: string[]): PurgeOptions | null {
		if (!args[0]) return null;

		const userFilter = args[1] ? args[1].split(",") : undefined;

		// Handle numeric amount
		if (NUMBER_PATTERN.test(args[0])) {
			const amount = Number(args[0]);
			if (isNaN(amount)) {
				this.message.reply("You have supplied an invalid number of messages.");
				return null;
			}
			if (amount > MAX_PURGE_AMOUNT) {
				this.message.reply(`Your request exceeds ${MAX_PURGE_AMOUNT} messages, which is the most that AutoMod can delete at once.`);
				return null;
			}
			return { amount, userFilter };
		}

		// Handle ULID range
		if (ULID_RANGE_PATTERN.test(args[0])) {
			const [startId, endId] = args[0].split("-");
			return { startId, endId, userFilter };
		}

		// Handle single ULID
		if (ULID_PATTERN.test(args[0])) {
			return { singleId: args[0] };
		}

		return null;
	}

	private async parseUsers(userFilter?: string[]): Promise<any[] | null> {
		if (!userFilter) return [];

		const userPromises = userFilter.map((u) => parseUserOrId(u));
		const users = await Promise.all(userPromises);

		if (users.some((u) => !u)) {
			await this.message.reply("One or more of the supplied users could not be found.");
			return null;
		}

		return users;
	}

	private async fetchMessages(options: PurgeOptions, users: any[]): Promise<Message[] | null> {
		try {
			if (options.amount !== undefined) {
				return await this.fetchByAmount(options.amount, users);
			}

			if (options.startId && options.endId) {
				return await this.fetchByRange(options.startId, options.endId, users);
			}

			if (options.singleId) {
				return [await this.message.channel!.fetchMessage(options.singleId)];
			}
		} catch (error) {
			await this.message.channel?.sendMessage("Failed to fetch messages for deletion.");
			return null;
		}

		return [];
	}

	private async fetchByAmount(amount: number, users: any[]): Promise<Message[]> {
		// If no user filter, fetch recent messages directly
		if (users.length === 0) {
			return await this.message.channel!.fetchMessages({
				limit: amount,
				before: this.message.id,
			});
		}

		// Fetch messages by specific users
		return await this.fetchMessagesByUsers(amount, users);
	}

	private async fetchMessagesByUsers(targetAmount: number, users: any[]): Promise<Message[]> {
		const foundMessages: Message[] = [];
		let lastMessageId = this.message.id;
		let totalFetched = 0;

		while (foundMessages.length < targetAmount && totalFetched < MAX_FETCH_LIMIT) {
			const batchSize = Math.min(100, MAX_FETCH_LIMIT - totalFetched);
			const batch = await this.message.channel!.fetchMessages({
				limit: batchSize,
				before: lastMessageId,
			});

			if (batch.length === 0) break;

			totalFetched += batch.length;
			lastMessageId = batch[batch.length - 1].id;

			const userMessages = batch.filter((m) => users.some((u) => u?.id === m.authorId));
			foundMessages.push(...userMessages);

			if (foundMessages.length >= targetAmount) {
				return foundMessages.slice(0, targetAmount);
			}
		}

		return foundMessages;
	}

	private async fetchByRange(startId: string, endId: string, users: any[]): Promise<Message[]> {
		// Fetch the boundary messages to ensure correct order
		const [msg1, msg2] = await Promise.all([this.message.channel!.fetchMessage(startId), this.message.channel!.fetchMessage(endId)]);

		// Ensure correct chronological order (older message first)
		const [olderMsg, newerMsg] = decodeTime(msg1.id) < decodeTime(msg2.id) ? [msg1, msg2] : [msg2, msg1];

		// Fetch messages in the range
		let messages = await this.message.channel!.fetchMessages({
			before: newerMsg.id,
			after: olderMsg.id,
			limit: MAX_PURGE_AMOUNT,
			sort: "Latest",
		});

		// Ensure boundary messages are included
		if (!messages.find((m) => m.id === olderMsg.id)) {
			messages = [olderMsg, ...messages];
		}
		if (!messages.find((m) => m.id === newerMsg.id)) {
			messages = [...messages, newerMsg];
		}

		// Filter to exact range (stoat sometimes returns extra messages)
		messages = messages.filter((m) => {
			const messageTime = decodeTime(m.id);
			return messageTime >= decodeTime(olderMsg.id) && messageTime <= decodeTime(newerMsg.id);
		});

		// Apply user filter if specified
		if (users.length > 0) {
			messages = messages.filter((m) => users.some((u) => u?.id === m.authorId));
		}

		return messages;
	}

	private async deleteMessagesAndCleanup(messages: Message[]): Promise<void> {
		if (messages.length === 0) {
			await this.message.reply("No messages found to delete.");
			return;
		}

		try {
			await this.message.channel?.deleteMessages(messages.map((m) => m.id));

			const replyMsg = await this.message.channel?.sendMessage({
				content: `${messages.length} messages have been deleted.`,
			});

			if (replyMsg) {
				setTimeout(async () => {
					try {
						await this.message.channel?.deleteMessages([replyMsg.id, this.message.id]);
					} catch (error) {
						console.error("Failed to cleanup messages:", error);
					}
				}, REPLY_DELETE_DELAY);
			}
		} catch (error) {
			await this.message.channel?.sendMessage("Failed to delete some or all messages.");
		}
	}
}

export default {
	name: "purge",
	aliases: ["clear"],
	description: "Allows for bulk deleting messages.",
	documentation: "/docs/commands/moderation/purge",
	syntax: SYNTAX,
	category: CommandCategory.Moderation,
	run: async (message: MessageCommandContext, args: string[]) => {
		const handler = new PurgeHandler(message);
		await handler.execute(args);
	},
} as SimpleCommand;
