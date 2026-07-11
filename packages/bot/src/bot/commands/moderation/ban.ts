import { ulid } from "ulid";
import Infraction from "automod-lib/dist/types/antispam/Infraction";
import InfractionType from "automod-lib/dist/types/antispam/InfractionType";
import SimpleCommand from "../../../struct/commands/SimpleCommand";
import CommandCategory from "../../../struct/commands/CommandCategory";
import type { SendableEmbed } from "../../../stoat/index.js";
import { User } from "../../../stoat/index.js";
import { fetchUsername, logModAction } from "../../modules/mod_logs";
import { storeTempBan } from "../../modules/tempbans";
import {
	dedupeArray,
	embed,
	EmbedColor,
	formatRelativeTime,
	generateInfractionDMEmbed,
	parseDuration,
	getDmChannel,
	getMembers,
	isModerator,
	memberRanking,
	NO_MANAGER_MSG,
	parseUserOrId,
	sanitizeMessageContent,
	storeInfraction,
	yesNoMessage,
} from "../../util";
import { client } from "../../..";

const SYNTAX = "/ban @username [duration] [p|purge <purge_duration>] [reason?]";

export default {
	name: "ban",
	aliases: ["eject"],
	description: "Removes a user from the server and prevents them from rejoining.",
	documentation: "/moderation/ban",
	syntax: SYNTAX,
	removeEmptyArgs: true,
	category: CommandCategory.Moderation,
	run: async (message, args, serverConfig) => {
		if (!(await isModerator(message))) return message.reply(NO_MANAGER_MSG);
		if (!message.serverContext.havePermission("BanMembers")) {
			return await message.reply({
				embeds: [embed(`Sorry, I do not have \`BanMembers\` permission.`, "", EmbedColor.SoftError)],
			});
		}

		const userInput = !message.replyIds?.length ? args.shift() || "" : undefined;
		if (!userInput && !message.replyIds?.length)
			return message.reply({
				embeds: [
					embed(
						`Please specify one or more users by replying to their message while running this command or by specifying a comma-separated list of usernames.`,
						"No target user specified",
						EmbedColor.SoftError,
					),
				],
			});

		let banDuration = 0;
		let purgeSeconds = 0;
		let durationStr: string | undefined;

		// Check for purge duration (prefixed with "p" or "purge") and/or ban duration.
		// The purge prefix can be part of the duration token ("p7d", "purge7d") or a separate token followed by the duration ("p 7d", "purge 7d").
		for (let i = 0; i < 3; i++) {
			let arg = args.shift();
			if (!arg) break;

			// Handle separate prefix token ("p" or "purge" followed by a duration)
			const isPrefixToken = arg.toLowerCase() === "p" || arg.toLowerCase() === "purge";
			if (isPrefixToken) {
				const next = args.shift();
				if (next) {
					const parsed = parseDuration(next);
					if (parsed > 0) {
						purgeSeconds = Math.floor(parsed / 1000);
						continue;
					}
					args.unshift(next);
				}
				args.unshift(arg);
				break;
			}

			// Handle inline prefix ("p7d", "purge7d")
			const lower = arg.toLowerCase();
			const purgeMatch = lower.match(/^(p|purge)([0-9])/);
			if (purgeMatch) {
				const parsed = parseDuration(arg.slice(purgeMatch[1].length));
				if (parsed > 0) {
					purgeSeconds = Math.floor(parsed / 1000);
					continue;
				}
			}

			// Regular ban duration
			const parsed = parseDuration(arg);
			if (parsed > 0) {
				banDuration = parsed;
				durationStr = arg;
				continue;
			}

			args.unshift(arg);
			break;
		}

		let reason = args.join(" ")?.replace(new RegExp("`", "g"), "'")?.replace(new RegExp("\n", "g"), " ");

		if (reason.length > 500)
			return message.reply({
				embeds: [embed("Ban reason may not exceed 500 characters.", null, EmbedColor.SoftError)],
			});

		const embeds: SendableEmbed[] = [];
		const handledUsers: string[] = [];
		const targetUsers: User | { id: string }[] = [];

		const targetInput = dedupeArray(
			message.replyIds?.length
				? (await Promise.allSettled(message.replyIds.map((msg) => message.channel?.fetchMessage(msg)))).filter((m) => m.status == "fulfilled").map((m) => (m as any).value.authorId)
				: userInput!.split(","),
		);

		for (const userStr of targetInput) {
			try {
				let user = await parseUserOrId(userStr);
				if (!user) {
					embeds.push(embed(`AutoMod can not resolve \`${sanitizeMessageContent(userStr).trim()}\` to a user.`, null, EmbedColor.SoftError));
					continue;
				}

				// Silently ignore duplicates
				if (handledUsers.includes(user.id)) continue;
				handledUsers.push(user.id);

				if (user.id == message.authorId!) {
					embeds.push(embed("Banning yourself is inadvisable.", null, EmbedColor.Warning));
					continue;
				}

				if (user.id == client.user!.id) {
					embeds.push(embed("Try as you might, you cannot use the AutoMod to ban the AutoMod.", null, EmbedColor.Warning));
					continue;
				}

				targetUsers.push(user);
			} catch (e) {
				console.error(e);
				embeds.push(embed(`Failed to ban target \`${sanitizeMessageContent(userStr).trim()}\`: ${e}`, `Failed to ban: An error has occurred`, EmbedColor.Error));
			}
		}

		if (message.replyIds?.length && targetUsers.length) {
			let purgeInfo = purgeSeconds > 0 ? `\nMessages from the last **${formatRelativeTime(Date.now() - purgeSeconds * 1000, true)}** will be purged.` : "";
			let res = await yesNoMessage(
				message.channel!,
				message.authorId!,
				`This will ban the author${targetUsers.length > 1 ? "s" : ""} of the message${message.replyIds.length > 1 ? "s" : ""} you replied to.\n` +
					`The following user${targetUsers.length > 1 ? "s" : ""} will be affected: ${targetUsers.map((u) => `<@${u.id}>`).join(", ")}.${purgeInfo}\n` +
					`Are you sure?`,
				"Confirm action",
			);
			if (!res) return;
		}

		const members = getMembers(message.serverContext.id);

		for (const user of targetUsers) {
			try {
				if (banDuration == 0) {
					const infId = ulid();
					const infraction: Infraction = {
						_id: infId,
						createdBy: message.authorId!,
						date: Date.now(),
						reason: reason || "No reason provided",
						server: message.serverContext.id,
						type: InfractionType.Manual,
						user: user.id,
						actionType: "ban",
						expires: Infinity,
					};
					const { userWarnCount } = await storeInfraction(infraction);

					const member = members.find((m) => m.id.user == user.id);

					if (member && message.member && !member.inferiorTo(message.member)) {
						embeds.push(embed(`\`${member.user?.username}\` has an equally or higher ranked role than you; refusing to ban.`, "Missing permission", EmbedColor.SoftError));
						continue;
					}

					if (member && !memberRanking(member).bannable) {
						embeds.push(embed(`AutoMod lacks permission to ban \`${member?.user?.username || user.id}\`.`, null, EmbedColor.SoftError));
						continue;
					}

					if (serverConfig?.dmOnKick) {
						try {
							const embed = generateInfractionDMEmbed(message.serverContext, serverConfig, infraction, message);
							const dmChannel = await getDmChannel(user);

							if (dmChannel.havePermission("SendMessage") || dmChannel.havePermission("SendEmbeds")) {
								await dmChannel.sendMessage({
									embeds: [embed],
								});
							} else console.warn("Missing permission to DM user.");
						} catch (e) {
							console.error(e);
						}
					}

					const banOptions: Record<string, any> = {
						reason: reason + ` (by ${await fetchUsername(message.authorId!)} ${message.authorId})`,
					};
					if (purgeSeconds > 0) banOptions["delete_message_seconds"] = purgeSeconds;

					await message.serverContext.banUser(user.id, banOptions);

					await logModAction(
						"ban",
						message.serverContext,
						message.member!,
						user.id,
						reason,
						infraction._id,
						`Ban duration: **Permanent**${purgeSeconds > 0 ? ` | Purged messages from the last **${formatRelativeTime(Date.now() - purgeSeconds * 1000, true)}**` : ""}`,
					);

					embeds.push({
						title: `User banned`,
						icon_url: user instanceof User ? user.avatarURL : undefined,
						colour: EmbedColor.Success,
						description:
							`This is ${userWarnCount == 1 ? "**the first infraction**" : `infraction number **${userWarnCount}**`} for ${await fetchUsername(user.id)}.\n` +
							`**User ID:** \`${user.id}\`\n` +
							`**Infraction ID:** \`${infraction._id}\`\n` +
							(purgeSeconds > 0 ? `**Messages purged:** last ${formatRelativeTime(Date.now() - purgeSeconds * 1000, true)}\n` : "") +
							`**Reason:** \`${infraction.reason}\``,
					});
				} else {
					const banUntil = Date.now() + banDuration;
					const banDurationFancy = formatRelativeTime(banUntil, true);
					const infId = ulid();
					const infraction: Infraction = {
						_id: infId,
						createdBy: message.authorId!,
						date: Date.now(),
						reason: (reason || "No reason provided") + ` (${durationStr})`,
						server: message.serverContext.id,
						type: InfractionType.Manual,
						user: user.id,
						actionType: "ban",
						expires: banUntil,
					};
					const { userWarnCount } = await storeInfraction(infraction);

					if (serverConfig?.dmOnKick) {
						try {
							const embed = generateInfractionDMEmbed(message.serverContext, serverConfig, infraction, message);
							const dmChannel = await getDmChannel(user);

							if (dmChannel.havePermission("SendMessage") || dmChannel.havePermission("SendEmbeds")) {
								await dmChannel.sendMessage({
									embeds: [embed],
								});
							} else console.warn("Missing permission to DM user.");
						} catch (e) {
							console.error(e);
						}
					}

					const banOptions: Record<string, any> = {
						reason: reason + ` (by ${await fetchUsername(message.authorId!)} ${message.authorId}) (${durationStr})`,
					};
					if (purgeSeconds > 0) banOptions["delete_message_seconds"] = purgeSeconds;

					await message.serverContext.banUser(user.id, banOptions);

					await Promise.all([
						storeTempBan({
							id: infId,
							bannedUser: user.id,
							server: message.serverContext.id,
							until: banUntil,
						}),
						logModAction(
							"ban",
							message.serverContext,
							message.member!,
							user.id,
							reason,
							infraction._id,
							`Ban duration: **${banDurationFancy}**${purgeSeconds > 0 ? ` | Purged messages from the last **${formatRelativeTime(Date.now() - purgeSeconds * 1000, true)}**` : ""}`,
						),
					]);

					embeds.push({
						title: `User temporarily banned`,
						icon_url: user instanceof User ? user.avatarURL : undefined,
						colour: EmbedColor.Success,
						description:
							`This is ${userWarnCount == 1 ? "**the first infraction**" : `infraction number **${userWarnCount}**`} for ${await fetchUsername(user.id)}.\n` +
							`**Ban duration:** ${banDurationFancy}\n` +
							(purgeSeconds > 0 ? `**Messages purged:** last ${formatRelativeTime(Date.now() - purgeSeconds * 1000, true)}\n` : "") +
							`**User ID:** \`${user.id}\`\n` +
							`**Infraction ID:** \`${infraction._id}\`\n` +
							`**Reason:** \`${infraction.reason}\``,
					});
				}
			} catch (e) {
				console.error(e);
				embeds.push(embed(`Failed to ban target \`${await fetchUsername(user.id, user.id)}\`: ${e}`, "Failed to ban: An error has occurred", EmbedColor.Error));
			}
		}

		let firstMsg = true;
		while (embeds.length > 0) {
			const targetEmbeds = embeds.splice(0, 10);

			if (firstMsg) {
				await message.reply({ embeds: targetEmbeds, content: "Operation completed." }, false);
			} else {
				await message.channel?.sendMessage({ embeds: targetEmbeds });
			}
			firstMsg = false;
		}
	},
} as SimpleCommand;
