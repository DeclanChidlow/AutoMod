import CommandCategory from "../../../struct/commands/CommandCategory";
import SimpleCommand from "../../../struct/commands/SimpleCommand";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import { isModerator, NO_MANAGER_MSG, parseUser } from "../../util";
import { dbs } from "../../..";

export default {
	name: "role",
	aliases: ["roles"],
	description: "Add and remove roles from a member, or manage reaction roles.",
	documentation: "/moderation/role",
	category: CommandCategory.Moderation,
	run: async (message: MessageCommandContext, args: string[]) => {
		try {
			if (!message.member) return;
			if (!message.member.hasPermission(message.member.server!, "ManageRole") && !(await isModerator(message))) return message.reply(NO_MANAGER_MSG);

			const action = args.shift()?.toLowerCase();

			const normalizeEmoji = (emoji: string) => {
				return emoji.replace(/^:([A-Z0-9]+):$/i, "$1").replace(/[\uFE0F\uE0E2]/g, "");
			};

			if (action === "reaction") {
				const subAction = args.shift()?.toLowerCase();

				if (subAction === "add") {
					const messageId = args.shift()?.trim();
					const emojiRaw = args.shift()?.trim();
					const roleArg = args.shift()?.trim();

					if (!messageId || !emojiRaw || !roleArg) {
						return message.reply("Usage: `/role reaction add <message-id> <emoji> <role>`");
					}

					const roleIdMatch = roleArg.match(/^<%([A-Z0-9]+)>$/i);
					const roleId = roleIdMatch ? roleIdMatch[1] : roleArg;

					const server = message.channel?.server;
					if (!server || !server.roles || !server.roles.get(roleId)) {
						return message.reply(`Role "${roleArg}" does not exist in this server.`);
					}

					const emoji = normalizeEmoji(emojiRaw);

					const isCustomEmoji = /^[A-Z0-9]{26}$/i.test(emoji);
					const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
					const graphemeCount = [...segmenter.segment(emoji)].length;

					if (!isCustomEmoji && graphemeCount > 1) {
						return message.reply("Please provide exactly **one** valid emoji.");
					}

					const channel = message.channel;
					if (!channel) {
						return message.reply("This command must be used in a channel.");
					}

					try {
						const targetMsg = await channel.fetchMessage(messageId);
						await targetMsg.react(emoji);

						await dbs.REACTION_ROLES.insertOne({
							server: server.id,
							messageId: messageId,
							emoji: emoji,
							roleId: roleId,
						});

						const displayEmoji = isCustomEmoji ? `:${emoji}:` : emoji;
						return message.reply(`Reaction role added! Reacting to message \`${messageId}\` with ${displayEmoji} will now grant the role.`);
					} catch (e) {
						console.error("Could not add initial reaction:", e);
						return message.reply(`Failed to add reaction role. Ensure the message ID is correct and the emoji is valid.`);
					}
				}

				if (subAction === "rm" || subAction === "remove") {
					const messageId = args.shift()?.trim();
					const emojiRaw = args.shift()?.trim();

					if (!messageId || !emojiRaw) {
						return message.reply("Usage: `/role reaction rm <message-id> <emoji>`");
					}

					const emoji = normalizeEmoji(emojiRaw);

					const result = await dbs.REACTION_ROLES.deleteOne({ messageId, emoji });
					if (result.deletedCount === 0) {
						return message.reply("No reaction role found for that message and emoji combination.");
					}

					const channel = message.channel;
					if (channel) {
						try {
							const targetMsg = await channel.fetchMessage(messageId);
							await targetMsg.unreact(emoji);
						} catch (e) {
							console.error("Could not remove bot reaction:", e);
						}
					}

					return message.reply("Reaction role removed successfully.");
				}

				return message.reply("Invalid reaction action. Use `add` or `rm`.");
			}

			if (!action || (action !== "add" && action !== "rm" && action !== "remove")) {
				return message.reply("Invalid action. Use `/role add @user role`, `/role remove @user role`, or `/role reaction add/remove ...`.");
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

			const server = message.channel?.server;
			if (!server || !server.roles || !server.roles.get(roleId)) {
				return message.reply(`Role "${roleArg}" does not exist in this server.`);
			}

			const currentRoles = target.roles || [];

			if (action === "add") {
				if (currentRoles.includes(roleId)) {
					return message.reply(`User \`@${targetUser.username}\` already has the role \`${roleId}\`.`);
				}
				try {
					await target.edit({ roles: [...currentRoles, roleId] });
					await message.reply(`Role \`${roleId}\` has been added to \`@${targetUser.username}\`.`);
				} catch (error) {
					console.error("Role add error:", error);
					return message.reply(`Failed to add role: ${error}`);
				}
			} else {
				if (!currentRoles.includes(roleId)) {
					return message.reply(`User \`@${targetUser.username}\` doesn't have the role \`${roleId}\`.`);
				}
				try {
					await target.edit({ roles: currentRoles.filter((role) => role !== roleId) });
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
