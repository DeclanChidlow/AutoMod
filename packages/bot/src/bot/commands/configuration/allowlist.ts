import { dbs } from "../../..";
import CommandCategory from "../../../struct/commands/CommandCategory";
import SimpleCommand from "../../../struct/commands/SimpleCommand";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import ServerConfig from "automod-lib/dist/types/ServerConfig";
import { isBotManager, NO_MANAGER_MSG, parseUser } from "../../util";

const SYNTAX = "/allowlist add <user|role>; /allowlist remove <user|role>; /allowlist list";

export default {
	name: "allowlist",
	aliases: ["whitelist", "safelist"],
	description: "Permit users or roles to bypass moderation rules.",
	documentation: "/configuration/allowlist",
	syntax: SYNTAX,
	category: CommandCategory.Configuration,
	run: async (message: MessageCommandContext, args: string[]) => {
		let config: ServerConfig | null = await dbs.SERVERS.findOne({ id: message.serverContext.id });
		if (!config) config = { id: message.channel!.serverId! };
		if (!config.whitelist) config.whitelist = { users: [], roles: [], managers: true };

		if (!(await isBotManager(message))) return message.reply(NO_MANAGER_MSG);

		const action = args[0]?.toLowerCase();

		if (["l", "ls", "list", "show"].includes(action)) {
			let str = `@silent ## Allowlist\n ### Users\n`;

			if (config.whitelist.users?.length) {
				config.whitelist.users.forEach((u, index) => {
					if (index < 15) str += `* <@${u}>\n`;
					if (index === 15) str += `**${config!.whitelist!.users!.length - 15} more user${config!.whitelist!.users!.length === 16 ? "" : "s"}**\n`;
				});
			} else str += `**No users in the allowlist**\n`;

			str += `### Roles\n`;

			if (config.whitelist.roles?.length) {
				config.whitelist.roles.forEach((r, index) => {
					if (index < 15) str += `* <%${r}>\n`;
					if (index === 15) str += `**${config!.whitelist!.roles!.length - 15} more role${config!.whitelist!.roles!.length === 16 ? "" : "s"}**\n`;
				});
			} else str += `**No roles in the allowlist**\n`;

			str += `\nModerators are${config.whitelist.managers === false ? " not" : ""} allowlisted.`;

			try {
				return await message.reply(str);
			} catch (e) {
				return await message.reply(String(e));
			}
		}

		if (["add", "set", "rm", "del", "remove", "delete"].includes(action)) {
			if (!args[1]) return message.reply("You need to specify a user or role name.");

			const isAdd = ["add", "set"].includes(action);

			const targetQuery = args.slice(1).join(" ");
			const roleQuery = targetQuery.replace(/^<%|>$/g, "");

			let roleId: string | undefined;
			if (message.serverContext.roles) {
				roleId = Array.from(message.serverContext.roles.entries()).find(([id, r]) => r.name?.toLowerCase() === roleQuery.toLowerCase() || id === roleQuery.toUpperCase())?.[0];
			}

			if (roleId) {
				const hasRole = config.whitelist!.roles!.includes(roleId);

				if (isAdd) {
					if (hasRole) return message.reply("That role is already in the allowlist.");
					config.whitelist!.roles!.unshift(roleId);
				} else {
					if (!hasRole) return message.reply("That role is not in the allowlist.");
					config.whitelist!.roles = config.whitelist!.roles!.filter((r) => r !== roleId);
				}

				await dbs.SERVERS.updateOne({ id: message.serverContext.id }, { $set: { whitelist: config.whitelist } });
				return message.reply(`✅ Successfully ${isAdd ? "added role to" : "removed role from"} the allowlist!`);
			}

			const user = await parseUser(targetQuery);
			if (!user) return message.reply("I can't find that user or role.");

			if (isAdd && user.bot) return message.reply("Bots cannot be added to the allowlist.");

			const hasUser = config.whitelist!.users!.includes(user.id);

			if (isAdd) {
				if (hasUser) return message.reply("That user is already in the allowlist.");
				config.whitelist!.users!.unshift(user.id);
			} else {
				if (!hasUser) return message.reply("That user is not in the allowlist.");
				config.whitelist!.users = config.whitelist!.users!.filter((u) => u !== user.id);
			}

			await dbs.SERVERS.updateOne({ id: message.serverContext.id }, { $set: { whitelist: config.whitelist } });
			return message.reply(`✅ Successfully ${isAdd ? "added user to" : "removed user from"} the allowlist!`);
		}

		return message.reply(`Command syntax: \`${SYNTAX}\``);
	},
} as SimpleCommand;
