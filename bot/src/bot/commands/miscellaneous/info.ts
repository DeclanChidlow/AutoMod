import SimpleCommand from "../../../struct/commands/SimpleCommand";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import CommandCategory from "../../../struct/commands/CommandCategory";
import { ULID_REGEX } from "../../util";
import { decodeTime } from "ulid";

const formatTimestamp = (timestamp: number): string => {
	const timestampInSeconds = Math.round(timestamp / 1000);
	return `Timestamp: \`${timestamp}\` (<t:${timestampInSeconds}:F> / <t:${timestampInSeconds}:R>)`;
};

const formatServerInfo = (context: MessageCommandContext): string => {
	const serverId = context.channel?.serverId || "None";
	return [`Server ID: \`${serverId}\``, `Server Context: \`${context.serverContext.id}\``, `Channel ID: \`${context.channelId}\``, `User ID: \`${context.authorId}\``].join("\n");
};

const extractIdFromMention = (input: string): string => {
	const userMentionMatch = input.match(/^<@([a-zA-Z0-9]+)>$/);
	if (userMentionMatch) {
		return userMentionMatch[1];
	}

	const channelMentionMatch = input.match(/^<#([a-zA-Z0-9]+)>$/);
	if (channelMentionMatch) {
		return channelMentionMatch[1];
	}

	return input;
};

export default {
	name: "info",
	aliases: ["debug"],
	description: "Provides information about a given ULID.",
	documentation: "/docs/commands/miscellaneous/info",
	category: CommandCategory.Miscellaneous,
	run: async (message: MessageCommandContext, args: string[]) => {
		const [input] = args;

		if (!input) {
			await message.reply(formatServerInfo(message));
			return;
		}

		const extractedId = extractIdFromMention(input);

		if (ULID_REGEX.test(extractedId)) {
			const timestamp = decodeTime(extractedId);
			const formattedTimestamp = formatTimestamp(timestamp);
			await message.reply(`ULID: \`${extractedId}\`\n${formattedTimestamp}`);
		} else {
			await message.reply(`\`${input}\` is not a valid input. Please mention a user, role, or channel, or provide a ULID.`);
		}
	},
} as SimpleCommand;
