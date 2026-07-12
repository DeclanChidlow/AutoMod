import CommandCategory from "../../../struct/commands/CommandCategory";
import SimpleCommand from "../../../struct/commands/SimpleCommand";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import { dbs } from "../../..";
import { isBotManager, NO_MANAGER_MSG } from "../../util";

const SYNTAX = "{prefix}spam enable; {prefix}spam disable";

export default {
	name: "spam",
	aliases: ["antispam"],
	description: "Enable or disable anti-spam features.",
	documentation: "/configuration/spam",
	syntax: SYNTAX,
	category: CommandCategory.Configuration,
	run: async (message: MessageCommandContext, args: string[]) => {
		if (!(await isBotManager(message))) return message.reply(NO_MANAGER_MSG);

		const antispamEnabled = await dbs.SERVERS.findOne({ id: message.serverContext.id });

		switch (args.shift()?.toLowerCase()) {
			case "enable": {
				await dbs.SERVERS.updateOne({ id: message.serverContext.id }, { $set: { antispamEnabled: true } });
				await message.reply("Spam detection is now **enabled** in this server.\n" + "Please ensure AutoMod has permission to Manage Messages");
				break;
			}
			case "disable": {
				if (message.serverContext.discoverable) {
					return message.reply(
						"Your server is currently listed in Discover. As part of [Stoat's Discover Guidelines](<https://support.stoat.chat/kb/safety/discover-guidelines>), all servers on Discover are automatically enrolled into AutoMod's antispam features.",
					);
				}

				await dbs.SERVERS.updateOne({ id: message.serverContext.id }, { $set: { antispamEnabled: false } });
				await message.reply("Spam detection is now **disabled** in this server.");
				break;
			}
			default: {
				const status = antispamEnabled ? "enabled" : "disabled";
				await message.reply(`Spam detection is currently **${status}**. ` + `Use \`${message.prefix}spam ${antispamEnabled ? "disable" : "enable"}\` to toggle this setting.`);
				break;
			}
		}
	},
} as SimpleCommand;
