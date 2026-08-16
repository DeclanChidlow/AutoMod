import SimpleCommand from "../../../struct/commands/SimpleCommand";
import CommandCategory from "../../../struct/commands/CommandCategory";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import { parseUser, parseUserOrReply } from "../../util";

const SYNTAX = "{prefix}pronouns [@user]";
const SET_HINT = "Stoat only allows users to change their own pronouns, so AutoMod cannot set them. You can manage yours in your Stoat profile settings.";

const escapeBackticks = (text: string) => text.replace(/`/g, "\\`");

export default {
	name: "pronouns",
	aliases: ["pronoun"],
	description: "View a user's global and server pronouns.",
	documentation: "/moderation/pronouns",
	syntax: SYNTAX,
	category: CommandCategory.Moderation,
	run: async (message: MessageCommandContext, args: string[]) => {
		try {
			const server = message.channel?.server;
			if (!server) return;

			const targetStr = args.shift() ?? "";
			const replyTarget = !targetStr && message.replyIds?.length ? await parseUserOrReply(message) : null;

			let targetUser;
			if (targetStr) {
				try {
					targetUser = await parseUser(targetStr);
				} catch (e) {
					return message.reply(`Couldn't find the specified user. ${SET_HINT}`);
				}

				if (!targetUser) return message.reply(`Couldn't find the specified user. ${SET_HINT}`);
			} else {
				targetUser = replyTarget ?? message.author;
			}

			if (!targetUser) return message.reply("Couldn't find the specified user.");

			let target;
			try {
				target = await server.fetchMember(targetUser);
			} catch (e) {
				return message.reply("The target is not part of this server.");
			}

			if (!target) return message.reply("The target is not part of this server.");

			const globalPronouns = targetUser.pronouns;
			const serverPronouns = target.pronouns;

			return message.reply(
				`### \`@${escapeBackticks(targetUser.username)}\`'s pronouns\n` +
					(globalPronouns ? `Global: \`${escapeBackticks(globalPronouns)}\`` : "No global pronouns") +
					"\n" +
					(serverPronouns ? `Server: \`${escapeBackticks(serverPronouns)}\`` : "No server pronouns"),
			);
		} catch (e) {
			console.error("" + e);
			message.reply("Something went wrong: " + e);
		}
	},
} as SimpleCommand;
