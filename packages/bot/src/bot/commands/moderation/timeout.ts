import SimpleCommand from "../../../struct/commands/SimpleCommand";
import CommandCategory from "../../../struct/commands/CommandCategory";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import { isModerator, NO_MANAGER_MSG, parseUser, parseDuration } from "../../util";
import { client } from "../../..";

export default {
	name: "timeout",
	aliases: ["mute", "silence"],
	description: "Sets a timeout on a user, making them unable to send messages for a given duration.",
	documentation: "/moderation/timeout",
	category: CommandCategory.Moderation,
	run: async (message: MessageCommandContext, args: string[]) => {
		try {
			if (!(await isModerator(message))) return await message.reply(NO_MANAGER_MSG);

			const target = await parseUser(args[0] ?? "");
			if (!target) return await message.reply("No user provided or provided user is not valid");

			const duration = parseDuration(args[1] ?? "");
			if (!duration) {
				await client.api.patch(
					`/servers/${message.serverContext.id}/members/${target.id}` as "/servers/{server}/members/{target}",
					{
						timeout: new Date(0).toISOString(),
					} as any,
				);
				await message.reply(`Timeout cleared on @${target.username}`);
			} else {
				await client.api.patch(
					`/servers/${message.serverContext.id}/members/${target.id}` as "/servers/{server}/members/{target}",
					{
						timeout: new Date(Date.now() + duration).toISOString(),
					} as any,
				);
				await message.reply(`Successfully timed out @${target.username}`);
			}
		} catch (e) {
			console.error("" + e);
			message.reply("Something went wrong: " + e);
		}
	},
} as SimpleCommand;
