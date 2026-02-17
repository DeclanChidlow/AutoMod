import CommandCategory from "../../../struct/commands/CommandCategory";
import SimpleCommand from "../../../struct/commands/SimpleCommand";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import { isModerator, NO_MANAGER_MSG, parseUser } from "../../util";

function getParseErrorMessage(targetStr: string): string {
	const isUserMention = targetStr.startsWith("<@") || targetStr.match(/^01[A-HJKMNP-TV-Z0-9]{24}$/);
	return isUserMention ? "Couldn't find the specified user." : "Couldn't find the specified user. Make sure to specify the user first, then the nickname.";
}

function getFetchErrorMessage(targetStr: string): string {
	const isUserMention = targetStr.startsWith("<@") || targetStr.match(/^01[A-HJKMNP-TV-Z0-9]{24}$/);
	return isUserMention ? "The target is not part of this server." : "Couldn't find the specified user. Make sure to specify the user first, then the nickname.";
}

export default {
	name: "nick",
	aliases: ["setnick"],
	description: "Manage a user's server-specific nickname.",
	documentation: "/docs/automod/commands/moderation/nick",
	category: CommandCategory.Moderation,
	run: async (message: MessageCommandContext, args: string[]) => {
		try {
			if (!message.member) return;
			if (!message.member.hasPermission(message.member.server!, "ManageNicknames") && !(await isModerator(message))) {
				return message.reply(NO_MANAGER_MSG);
			}

			const targetStr = args.shift();
			if (!targetStr) return message.reply("No target user specified.");

			let targetUser;
			try {
				targetUser = await parseUser(targetStr);
			} catch (parseError) {
				return message.reply(getParseErrorMessage(targetStr));
			}

			if (!targetUser) {
				return message.reply(getParseErrorMessage(targetStr));
			}

			let target;
			try {
				target = await message.channel?.server?.fetchMember(targetUser);
			} catch (fetchError) {
				return message.reply(getFetchErrorMessage(targetStr));
			}

			if (!target) return message.reply("The target is not part of this server.");

			const newName = args.join(" ");

			if (!newName) {
				await target.edit({
					nickname: null,
					remove: ["Nickname"],
				});
				return message.reply(`\`@${targetUser.username}\`'s server nickname has been cleared.`);
			}

			if (newName.length > 32) {
				return message.reply(`That nickname is too long. Nicknames must be 32 characters or fewer, but the provided nickname is ${newName.length} characters long.`);
			}

			await target.edit({ nickname: newName });
			await message.reply(`\`@${targetUser.username}\`'s server nickname has been changed to '${newName.replace(/`/g, "\\`")}'.`);
		} catch (e) {
			console.error("" + e);
			message.reply("Something went wrong: " + e);
		}
	},
} as SimpleCommand;
