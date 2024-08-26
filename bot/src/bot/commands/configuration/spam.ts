import { dbs } from "../../..";
import { DEFAULT_PREFIX } from "../../modules/command_handler";
import CommandCategory from "../../../struct/commands/CommandCategory";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import { isBotManager, NO_MANAGER_MSG } from "../../util";

export default {
	name: "spam",
	aliases: "antispam",
	description: "Manage antispam features.",
	category: CommandCategory.Configuration,
	run: async (message: MessageCommandContext, args: string[]) => {
		if (!(await isBotManager(message))) return message.reply(NO_MANAGER_MSG);

		const antispamEnabled = await dbs.SERVERS.findOne({ id: message.serverContext.id });

		switch (args.shift()?.toLowerCase()) {
			case "enable": {
				await dbs.SERVERS.update({ id: message.serverContext.id }, { $set: { antispamEnabled: true } });
				await message.reply("Spam detection is now **enabled** in this server.\n" + "Please ensure AutoMod has permission to Manage Messages");
				break;
			}
			case "disable": {
				if (message.serverContext.discoverable) {
					return message.reply(
						"Your server is currently listed in Discover. As part of [Revolt's Discover Guidelines](<https://support.revolt.chat/kb/safety/discover-guidelines>), all servers on Discover are automatically enrolled into AutoMod's antispam features.",
					);
				}

				await dbs.SERVERS.update({ id: message.serverContext.id }, { $set: { antispamEnabled: false } });
				await message.reply("Spam detection is now **disabled** in this server.");
				break;
			}
			default: {
				const status = antispamEnabled ? "enabled" : "disabled";
				await message.reply(`Spam detection is currently **${status}**. ` + `Use \`${DEFAULT_PREFIX}spam ${antispamEnabled ? "disable" : "enable"}\` to toggle this setting.`);
				break;
			}
		}
	},
};
