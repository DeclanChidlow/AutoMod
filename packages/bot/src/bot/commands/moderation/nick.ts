import SimpleCommand from "../../../struct/commands/SimpleCommand";
import CommandCategory from "../../../struct/commands/CommandCategory";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import { canModerate, NO_MANAGER_MSG, parseUser, checkMemberAction, ULID_REGEX } from "../../util";

function getParseErrorMessage(targetStr: string): string {
	const isUserMention = targetStr.startsWith("<@") || targetStr.match(/^01[A-HJKMNP-TV-Z0-9]{24}$/);
	return isUserMention ? "Couldn't find the specified user." : "Couldn't find the specified user. Make sure to specify the user first, then the nickname.";
}

function getFetchErrorMessage(targetStr: string): string {
	const isUserMention = targetStr.startsWith("<@") || targetStr.match(/^01[A-HJKMNP-TV-Z0-9]{24}$/);
	return isUserMention ? "The target is not part of this server." : "Couldn't find the specified user. Make sure to specify the user first, then the nickname.";
}

function quickSelfCheck(targetStr: string, message: MessageCommandContext): boolean {
	if (targetStr.startsWith("<@")) {
		const mentionId = targetStr.replace(/<@|>/g, "").toUpperCase();
		if (mentionId === message.authorId) return true;
	} else if (ULID_REGEX.test(targetStr)) {
		if (targetStr.toUpperCase() === message.authorId) return true;
	} else {
		const lowered = targetStr.toLowerCase();
		if (lowered === message.author?.displayName?.toLowerCase() || lowered === message.author?.username?.toLowerCase()) return true;
	}
	return false;
}

export default {
	name: "nick",
	aliases: ["setnick"],
	description: "Manage a user's server-specific nickname.",
	documentation: "/moderation/nick",
	category: CommandCategory.Moderation,
	run: async (message: MessageCommandContext, args: string[]) => {
		try {
			if (!message.member) return;

			const targetStr = args[0];
			if (!targetStr) return message.reply("No target user specified.");

			const hasManageNicknames = await canModerate(message, "ManageNicknames");
			if (!hasManageNicknames && !quickSelfCheck(targetStr, message)) {
				return message.reply(NO_MANAGER_MSG("manage nicknames"));
			}

			if (!hasManageNicknames && !message.member.hasPermission(message.channel!, "ChangeNickname")) {
				return message.reply("You don't have permission to change your own nickname.");
			}

			args.shift();

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

			const isSelf = targetUser.id === message.authorId;

			if (!isSelf) {
				const hierarchyErr = await checkMemberAction(target, message, "change nickname", "ManageNicknames");
				if (hierarchyErr) return message.reply({ embeds: [hierarchyErr] });
			}

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
