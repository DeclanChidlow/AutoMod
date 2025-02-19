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

export default {
	name: "info",
	aliases: ["debug"],
	description: "Provides information about a given UUID.",
	documentation: "/docs/commands/miscellaneous/info",
	category: CommandCategory.Miscellaneous,
	run: async (message: MessageCommandContext, args: string[]) => {
		const [input] = args;

		if (ULID_REGEX.test(input)) {
			const timestamp = decodeTime(input);
			const formattedTimestamp = formatTimestamp(timestamp);
			await message.reply(`ULID: \`${input}\`\n${formattedTimestamp}`);
		} else {
			await message.reply(formatServerInfo(message));
		}
	},
} as SimpleCommand;
