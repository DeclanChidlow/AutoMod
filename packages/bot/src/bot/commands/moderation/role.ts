import CommandCategory from "../../../struct/commands/CommandCategory";
import SimpleCommand from "../../../struct/commands/SimpleCommand";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import { isModerator, NO_MANAGER_MSG, parseUser } from "../../util";

export default {
	name: "role",
	aliases: ["roles"],
	description: "Add or remove roles from a user.",
	documentation: "/docs/commands/moderation/role",
	category: CommandCategory.Moderation,
	run: async (message: MessageCommandContext, args: string[]) => {
		try {
			if (!message.member) return;
			if (!message.member.hasPermission(message.member.server!, "ManageRole") && !(await isModerator(message))) return message.reply(NO_MANAGER_MSG);

			const action = args.shift()?.toLowerCase();
			if (!action || (action !== "add" && action !== "rm" && action !== "remove")) {
				return message.reply("Invalid action. Use `/role add @user role-id` or `/role rm @user role-id`.");
			}

			const targetStr = args.shift();
			if (!targetStr) return message.reply("No target user specified.");
			const targetUser = await parseUser(targetStr);
			if (!targetUser) return message.reply("Couldn't find the specified user.");
			const target = await message.channel?.server?.fetchMember(targetUser);
			if (!target) return message.reply("The target is not part of this server.");

			const roleArg = args.shift();
			if (!roleArg) return message.reply("No role specified.");

			const roleIdMatch = roleArg.match(/^<%([A-Z0-9]+)>$/i);
			const roleId = roleIdMatch ? roleIdMatch[1] : roleArg;

			// Check if the role exists in the server
			const server = message.channel?.server;
			if (!server || !server.roles || !server.roles.get(roleId)) {
				return message.reply(`Role "${roleArg}" does not exist in this server.`);
			}

			const currentRoles = target.roles || [];

			if (action === "add") {
				// Only add if not already present
				if (currentRoles.includes(roleId)) {
					return message.reply(`User \`@${targetUser.username}\` already has the role \`${roleId}\`.`);
				}

				// Add role
				try {
					await target.edit({
						roles: [...currentRoles, roleId],
					});
					await message.reply(`Role \`${roleId}\` has been added to \`@${targetUser.username}\`.`);
				} catch (error) {
					console.error("Role add error:", error);
					return message.reply(`Failed to add role: ${error}`);
				}
			} else {
				// Check if user has the role
				if (!currentRoles.includes(roleId)) {
					return message.reply(`User \`@${targetUser.username}\` doesn't have the role \`${roleId}\`.`);
				}

				// Remove role
				try {
					await target.edit({
						roles: currentRoles.filter((role) => role !== roleId),
					});
					await message.reply(`Role \`${roleId}\` has been removed from \`@${targetUser.username}\`.`);
				} catch (error) {
					console.error("Role remove error:", error);
					return message.reply(`Failed to remove role: ${error}`);
				}
			}
		} catch (e) {
			console.error("" + e);
			message.reply("Something went wrong: " + e);
		}
	},
} as SimpleCommand;
