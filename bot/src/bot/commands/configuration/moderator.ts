import SimpleCommand from "../../../struct/commands/SimpleCommand";
import { isBotManager, NO_MANAGER_MSG, parseUser } from "../../util";
import { client, dbs } from "../../..";
import { User } from "revolt.js";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import CommandCategory from "../../../struct/commands/CommandCategory";

const SYNTAX = "/mod add @user; /mod remove @user; /mod list";

// yes this is bot_manager.ts copypasted

export default {
	name: "moderator",
	aliases: ["moderators", "mod", "mods"],
	description: "Allow users to moderate other users.",
	syntax: SYNTAX,
	category: CommandCategory.Configuration,
	run: async (message: MessageCommandContext, args: string[]) => {
		if (!(await isBotManager(message))) return message.reply(NO_MANAGER_MSG);

		let config = await dbs.SERVERS.findOne({ id: message.serverContext.id });
		let mods = config?.moderators ?? [];
		let user: User | null;

		switch (args[0]?.toLowerCase()) {
			case "add":
			case "new":
				if (!args[1]) return message.reply("No user specified.");
				user = await parseUser(args[1]);
				if (!user) return message.reply("I can't find that user.");

				if (mods.indexOf(user.id) > -1) return message.reply("This user is already added as moderator.");

				mods.push(user.id);
				await dbs.SERVERS.update({ id: message.serverContext.id }, { $set: { moderators: mods } });

				message.reply(`✅ Added [@${user.username}](/@${user.id}) to moderators.`);
				break;
			case "remove":
			case "delete":
			case "rm":
			case "del":
				if (!args[1]) return message.reply("No user specified.");
				user = await parseUser(args[1]);
				if (!user) return message.reply("I can't find that user.");

				if (mods.indexOf(user.id) == -1) return message.reply("This user is not added as moderator.");

				mods = mods.filter((a) => a != user?.id);
				await dbs.SERVERS.update({ id: message.serverContext.id }, { $set: { moderators: mods } });

				message.reply(`✅ Removed [@${user.username}](/@${user.id}) from moderators.`);
				break;
			case "list":
			case "ls":
			case "show":
				message
					.reply(
						`# Moderators\n` +
							`Bot admins can add or remove moderators.\n\n` +
							`${mods.map((a) => `* [${client.users.get(a)?.username ?? a}](/@${a})`).join("\n")}\n\n` +
							`${mods.length} user${mods.length == 1 ? "" : "s"}.`,
					)
					?.catch((e) => message.reply(e));
				break;
			default:
				message.reply(`Available subcommands: ${SYNTAX}`);
		}
	},
} as SimpleCommand;
