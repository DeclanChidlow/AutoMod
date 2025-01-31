import { ulid } from "ulid";
import { client } from "../../../index";
import Infraction from "automod/dist/types/antispam/Infraction";
import InfractionType from "automod/dist/types/antispam/InfractionType";
import SimpleCommand from "../../../struct/commands/SimpleCommand";
import { fetchUsername, logModAction } from "../../modules/mod_logs";
import { storeTempBan } from "../../modules/tempbans";
import {
	dedupeArray,
	embed,
	EmbedColor,
	generateInfractionDMEmbed,
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
import Day from "dayjs";
import RelativeTime from "dayjs/plugin/relativeTime";
import CommandCategory from "../../../struct/commands/CommandCategory";
import type { SendableEmbed } from "revolt-api";
import { User } from "revolt.js";

Day.extend(RelativeTime);

export default {
	name: "ban",
	aliases: ["eject"],
	description: "Bans a user from the server.",
	syntax: "/ban @username [10m|1h|...?] [reason?]",
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
						`Please specify one or more users by replying to their message while running this command or ` + `by specifying a comma-separated list of usernames.`,
						"No target user specified",
						EmbedColor.SoftError,
					),
				],
			});

		let banDuration = 0;
		let durationStr = args.shift();
		if (durationStr && /([0-9]{1,3}[smhdwy])+/g.test(durationStr)) {
			let pieces = durationStr.match(/([0-9]{1,3}[smhdwy])/g) ?? [];

			// Being able to specify the same letter multiple times
			// (e.g. 1s1s) and having their values stack is a feature
			for (const piece of pieces) {
				let [num, letter] = [Number(piece.slice(0, piece.length - 1)), piece.slice(piece.length - 1)];
				let multiplier = 0;

				switch (letter) {
					case "s":
						multiplier = 1000;
						break;
					case "m":
						multiplier = 1000 * 60;
						break;
					case "h":
						multiplier = 1000 * 60 * 60;
						break;
					case "d":
						multiplier = 1000 * 60 * 60 * 24;
						break;
					case "w":
						multiplier = 1000 * 60 * 60 * 24 * 7;
						break;
					case "y":
						multiplier = 1000 * 60 * 60 * 24 * 365;
						break;
				}

				banDuration += num * multiplier;
			}
		} else if (durationStr) args.unshift(durationStr);

		let reason = args.join(" ")?.replace(new RegExp("`", "g"), "'")?.replace(new RegExp("\n", "g"), " ");

		if (reason.length > 500)
			return message.reply({
				embeds: [embed("Ban reason may not be longer than 500 characters.", null, EmbedColor.SoftError)],
			});

		const embeds: SendableEmbed[] = [];
		const handledUsers: string[] = [];
		const targetUsers: User | { id: string }[] = [];

		const targetInput = dedupeArray(
			message.replyIds?.length
				? (await Promise.allSettled(message.replyIds.map((msg) => message.channel?.fetchMessage(msg)))).filter((m) => m.status == "fulfilled").map((m) => (m as any).value.author_id)
				: userInput!.split(","),
		);

		for (const userStr of targetInput) {
			try {
				let user = await parseUserOrId(userStr);
				if (!user) {
					embeds.push(embed(`I can't resolve \`${sanitizeMessageContent(userStr).trim()}\` to a user.`, null, EmbedColor.SoftError));
					continue;
				}

				// Silently ignore duplicates
				if (handledUsers.includes(user.id)) continue;
				handledUsers.push(user.id);

				if (user.id == message.authorId!) {
					embeds.push(embed("I recommend against banning yourself :yeahokayyy:", null, EmbedColor.Warning));
					continue;
				}

				if (user.id == client.user!.id) {
					embeds.push(embed("I'm not going to ban myself :flushee:", null, EmbedColor.Warning));
					continue;
				}

				targetUsers.push(user);
			} catch (e) {
				console.error(e);
				embeds.push(embed(`Failed to ban target \`${sanitizeMessageContent(userStr).trim()}\`: ${e}`, `Failed to ban: An error has occurred`, EmbedColor.Error));
			}
		}

		if (message.replyIds?.length && targetUsers.length) {
			let res = await yesNoMessage(
				message.channel!,
				message.authorId!,
				`This will ban the author${targetUsers.length > 1 ? "s" : ""} ` +
					`of the message${message.replyIds.length > 1 ? "s" : ""} you replied to.\n` +
					`The following user${targetUsers.length > 1 ? "s" : ""} will be affected: ` +
					`${targetUsers.map((u) => `<@${u.id}>`).join(", ")}.\n` +
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
						embeds.push(embed(`I don't have permission to ban \`${member?.user?.username || user.id}\`.`, null, EmbedColor.SoftError));
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

					await message.serverContext.banUser(user.id, {
						reason: reason + ` (by ${await fetchUsername(message.authorId!)} ${message.authorId})`,
					});

					await logModAction("ban", message.serverContext, message.member!, user.id, reason, infraction._id, `Ban duration: **Permanent**`);

					embeds.push({
						title: `User ${Math.random() > 0.8 ? "ejected" : "banned"}`,
						icon_url: user instanceof User ? user.avatarURL : undefined,
						colour: EmbedColor.Success,
						description:
							`This is ${userWarnCount == 1 ? "**the first infraction**" : `infraction number **${userWarnCount}**`}` +
							` for ${await fetchUsername(user.id)}.\n` +
							`**User ID:** \`${user.id}\`\n` +
							`**Infraction ID:** \`${infraction._id}\`\n` +
							`**Reason:** \`${infraction.reason}\``,
					});
				} else {
					const banUntil = Date.now() + banDuration;
					const banDurationFancy = Day(banUntil).fromNow(true);
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

					await message.serverContext.banUser(user.id, {
						reason: reason + ` (by ${await fetchUsername(message.authorId!)} ${message.authorId}) (${durationStr})`,
					});

					await Promise.all([
						storeTempBan({
							id: infId,
							bannedUser: user.id,
							server: message.serverContext.id,
							until: banUntil,
						}),
						logModAction("ban", message.serverContext, message.member!, user.id, reason, infraction._id, `Ban duration: **${banDurationFancy}**`),
					]);

					embeds.push({
						title: `User temporarily banned`,
						icon_url: user instanceof User ? user.avatarURL : undefined,
						colour: EmbedColor.Success,
						description:
							`This is ${userWarnCount == 1 ? "**the first infraction**" : `infraction number **${userWarnCount}**`}` +
							` for ${await fetchUsername(user.id)}.\n` +
							`**Ban duration:** ${banDurationFancy}\n` +
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
