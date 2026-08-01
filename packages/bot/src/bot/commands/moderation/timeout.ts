import { ulid } from "ulid";
import Infraction from "automod-lib/dist/types/antispam/Infraction";
import InfractionType from "automod-lib/dist/types/antispam/InfractionType";
import SimpleCommand from "../../../struct/commands/SimpleCommand";
import CommandCategory from "../../../struct/commands/CommandCategory";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import { canModerate, NO_MANAGER_MSG, parseUser, parseDuration, storeInfraction, checkMemberAction, embed, EmbedColor } from "../../util";
import { client } from "../../..";
import { handleVoteCommand } from "../../modules/votekick";
import { fetchUsername, logModAction } from "../../modules/mod_logs";

const SYNTAX = "{prefix}timeout @username [duration]\n{prefix}timeout vote @username";

export default {
	name: "timeout",
	aliases: ["mute", "silence"],
	description: "Sets a timeout on a user, making them unable to send messages for a given duration.",
	documentation: "/moderation/timeout",
	syntax: SYNTAX,
	category: CommandCategory.Moderation,
	run: async (message: MessageCommandContext, args: string[], serverConfig?) => {
		if (args[0]?.toLowerCase() === "vote") {
			args.shift();
			const timeoutMinutes = serverConfig?.votekick?.timeoutDuration || 60;
			const durationMs = timeoutMinutes * 60 * 1000;
			const isMod = await canModerate(message, "TimeoutMembers");
			const originator = await fetchUsername(message.authorId!);
			return await handleVoteCommand(message, args, serverConfig, {
				type: "timeout",
				isModerator: isMod,
				onPass: async (target) => {
					const infId = ulid();
					await client.api.patch(`/servers/${message.serverContext.id}/members/${target.id}` as "/servers/{server}/members/{target}", { timeout: new Date(Date.now() + durationMs).toISOString() } as any);
					await Promise.all([
						storeInfraction({
							_id: infId,
							createdBy: client.user!.id,
							date: Date.now(),
							reason: `Vote timeout passed (${timeoutMinutes} minutes). Started by ${originator}`,
							server: message.serverContext.id,
							type: InfractionType.Manual,
							user: target.id,
							actionType: "timeout",
						} as Infraction),
						logModAction("timeout", message.serverContext, message.member!, target.id, `Vote timeout passed (${timeoutMinutes} minutes)`, infId),
					]);
				},
				logActionType: "timeout",
				logActionReason: `Vote timeout passed (${timeoutMinutes} minutes)`,
				passMessage: (target, votesCount, votesRequired) => `**${votesCount}/${votesRequired}** votes reached. **@${target.username}** has been timed out for ${timeoutMinutes} minutes.`,
			});
		}

		try {
			if (!(await canModerate(message, "TimeoutMembers"))) return await message.reply(NO_MANAGER_MSG);
			if (!message.serverContext.havePermission("TimeoutMembers")) {
				return await message.reply({ embeds: [embed("Sorry, I do not have `TimeoutMembers` permission.", "", EmbedColor.SoftError)] });
			}

			const target = await parseUser(args[0] ?? "");
			if (!target) return await message.reply("No user provided or provided user is not valid");

			if (target.id == message.authorId!) return await message.reply("You cannot timeout yourself.");
			if (target.id == client.user!.id) return await message.reply("You cannot timeout the AutoMod.");
			if (target.id == message.serverContext.ownerId) return await message.reply("You cannot timeout the server owner.");

			const member = await message.channel?.server?.fetchMember(target);
			if (!member) return await message.reply("That user is not a member of this server.");

			const hierarchyErr = await checkMemberAction(member, message, "timeout", "TimeoutMembers");
			if (hierarchyErr) return await message.reply({ embeds: [hierarchyErr] });

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

				const infId = ulid();
				const reason = (args.slice(2).join(" ") || "No reason provided").replace(new RegExp("`", "g"), "'").replace(new RegExp("\n", "g"), " ").substring(0, 500);
				await Promise.all([
					storeInfraction({
						_id: infId,
						createdBy: message.authorId!,
						date: Date.now(),
						reason,
						server: message.serverContext.id,
						type: InfractionType.Manual,
						user: target.id,
						actionType: "timeout",
					} as Infraction),
					logModAction("timeout", message.serverContext, message.member!, target.id, reason, infId),
				]);

				await message.reply(`Successfully timed out @${target.username}`);
			}
		} catch (e) {
			console.error("" + e);
			message.reply("Something went wrong: " + e);
		}
	},
} as SimpleCommand;
