import SimpleCommand from "../../../struct/commands/SimpleCommand";
import { dbs } from "../../..";
import { DEFAULT_PREFIX } from "../../modules/command_handler";
import { isBotManager, NO_MANAGER_MSG } from "../../util";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import CommandCategory from "../../../struct/commands/CommandCategory";

const SYNTAX = "/prefix set [new prefix]; /prefix get; prefix clear";
const MENTION_TEXT = "You can also @mention me instead of using the prefix.";

export default {
	name: "prefix",
	aliases: null,
	description: "Change AutoMod's prefix",
	syntax: SYNTAX,
	category: CommandCategory.Configuration,
	run: async (message: MessageCommandContext, args: string[]) => {
		let config = await dbs.SERVERS.findOne({ id: message.channel!.serverId! });

		switch (args[0]?.toLowerCase()) {
			case "set":
				if (!(await isBotManager(message))) return message.reply(NO_MANAGER_MSG);

				args.shift();
				if (args.length == 0) return message.reply("You need to specify a prefix.");
				let newPrefix = args.join(" ").trim();
				let oldPrefix = config?.prefix ?? DEFAULT_PREFIX;

				let val = validatePrefix(newPrefix);
				if (typeof val != "boolean") {
					return message.reply(val);
				}

				await dbs.SERVERS.update({ id: message.channel!.serverId! }, { $set: { prefix: newPrefix } });

				message.reply(`✅ Prefix has been changed from \`${oldPrefix}\` to \`${newPrefix}\`.\n${MENTION_TEXT}`);
				break;
			case "get":
			case undefined:
				if (config?.prefix) message.reply(`This server's prefix is \`${config.prefix}\`.\n${MENTION_TEXT}`);
				else message.reply(`This server uses the default prefix \`${DEFAULT_PREFIX}\`.\n${MENTION_TEXT}`);
				break;
			case "clear":
			case "reset":
				if (!(await isBotManager(message))) return message.reply(NO_MANAGER_MSG);

				if (config?.prefix != null) {
					await dbs.SERVERS.update({ id: message.channel!.serverId! }, { $set: { prefix: undefined } });
				}

				message.reply(`✅ Prefix has been reset to the default: \`${DEFAULT_PREFIX}\`.`);
				break;
			default:
				message.reply(`Unknown action. Correct syntax: \`${SYNTAX}\``);
		}
	},
} as SimpleCommand;

function validatePrefix(prefix: string): string | true {
	// Check length
	if (prefix.length > 32) return "Prefix may not be longer than 32 characters";

	// Check for forbidden characters
	let matched = [];
	for (const char of ["`", "\n", "#"]) {
		if (prefix.indexOf(char) > -1) matched.push(char);
	}

	if (matched.length > 0)
		return (
			`Prefix may not contain the following characters: ` +
			`${matched
				.map((char) => char)
				.join(", ")
				.replace(new RegExp("\n", "g"), "\\n")}`
		);

	return true;
}
