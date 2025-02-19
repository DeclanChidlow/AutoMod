import SimpleCommand from "../../../struct/commands/SimpleCommand";
import { parseUser } from "../../util";
import { client, dbs } from "../../..";
import { User } from "revolt.js";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import CommandCategory from "../../../struct/commands/CommandCategory";

const SYNTAX = "/admin add @user; /admin remove @user; /admin list";

export default {
	name: "admin",
	aliases: ["admins", "manager", "managers"],
	description: "Allows managing which users have permissions to modify AutoMod's configuration.",
	documentation: "/docs/commands/configuration/managers",
	syntax: SYNTAX,
	category: CommandCategory.Configuration,
	run: async (message: MessageCommandContext, args: string[]) => {
		if (!message.member?.hasPermission(message.member.server!, "ManageServer")) return message.reply("You need **ManageServer** permission to use this command.");

		let config = await dbs.SERVERS.findOne({ id: message.serverContext.id });
		let admins = config?.botManagers ?? [];
		let user: User | null;

		switch (args[0]?.toLowerCase()) {
			case "add":
			case "new":
				if (!args[1]) return message.reply("No user specified.");
				user = await parseUser(args[1]);
				if (!user) return message.reply("I can't find that user.");

				if (admins.indexOf(user.id) > -1) return message.reply("This user is already added as bot admin.");

				admins.push(user.id);
				await dbs.SERVERS.update({ id: message.serverContext.id }, { $set: { botManagers: admins } });

				message.reply(`✅ Added [@${user.username}](/@${user.id}) to bot admins.`);
				break;
			case "remove":
			case "delete":
			case "rm":
			case "del":
				if (!args[1]) return message.reply("No user specified.");
				user = await parseUser(args[1]);
				if (!user) return message.reply("I can't find that user.");

				if (admins.indexOf(user.id) == -1) return message.reply("This user is not added as bot admin.");

				admins = admins.filter((a) => a != user?.id);
				await dbs.SERVERS.update({ id: message.serverContext.id }, { $set: { botManagers: admins } });

				message.reply(`✅ Removed [@${user.username}](/@${user.id}) from bot admins.`);
				break;
			case "list":
			case "ls":
			case "show":
				message
					.reply(
						`# Bot admins\n` +
							`Users with **ManageServer** permission can add or remove admins.\n\n` +
							`${admins.map((a) => `* [@${client.users.get(a)?.username ?? a}](/@${a})`).join("\n")}\n\n` +
							`${admins.length} user${admins.length == 1 ? "" : "s"}.`,
					)
					?.catch((e) => message.reply(e));
				break;
			default:
				message.reply(`Available subcommands: ${SYNTAX}`);
		}
	},
} as SimpleCommand;
