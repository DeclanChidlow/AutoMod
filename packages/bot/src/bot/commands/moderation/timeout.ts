import { client } from "../../..";
import CommandCategory from "../../../struct/commands/CommandCategory";
import SimpleCommand from "../../../struct/commands/SimpleCommand";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import { dedupeArray, embed, EmbedColor, isModerator, NO_MANAGER_MSG, parseUserOrId, sanitizeMessageContent, storeInfraction } from "../../util";
import Infraction from "automod-lib/dist/types/antispam/Infraction";
import InfractionType from "automod-lib/dist/types/antispam/InfractionType";
import { fetchUsername, logModAction } from "../../modules/mod_logs";
import { ulid } from "ulid";
import type { SendableEmbed } from "stoat-api";
import { User } from "stoat.js";

function parseTimeInput(input: string) {
    if (!/([0-9]{1,3}[smhdwy])+/g.test(input)) return null;

    let pieces = input.match(/([0-9]{1,3}[smhdwy])/g) ?? [];
    let res = 0;

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

        res += num * multiplier;
    }

    return res;
}

export default {
    name: "timeout",
    aliases: ["mute", "silence"],
    description: "Sets a timeout on a user, making them unable to send messages for a given duration.",
    documentation: "/moderation/timeout",
    category: CommandCategory.Moderation,
    run: async (message: MessageCommandContext, args: string[]) => {
        try {
            if (!(await isModerator(message))) return await message.reply(NO_MANAGER_MSG);

            // Multi Users
            const userInput = !message.replyIds?.length ? args.shift() || "" : undefined;
            if (!userInput && !message.replyIds?.length) {
                return message.reply({
                    embeds: [
                        embed(
                            `Please specify one or more users by replying to their messages or by providing a comma-separated list of usernames/IDs.`,
                            "No target user specified",
                            EmbedColor.SoftError,
                        ),
                    ],
                });
            }

            // Time
            let durationInput = args.shift();
            const duration = durationInput ? parseTimeInput(durationInput) : null;
            // Reason
            let reason = args.join(" ")?.replace(new RegExp("`", "g"), "'")?.replace(new RegExp("\n", "g"), " ") || "No reason provided";

            if (reason.length > 500)
                return message.reply({
                    embeds: [embed("Timeout reason may not exceed 500 characters.", null, EmbedColor.SoftError)],
                });

            const embeds: SendableEmbed[] = [];
            const handledUsers: string[] = [];
            const targetUsers: (User | { id: string })[] = [];

            // Build user lists
            const targetInput = dedupeArray(
                message.replyIds?.length
                    ? (await Promise.allSettled(message.replyIds.map((msg) => message.channel?.fetchMessage(msg))))
                          .filter((m) => m.status == "fulfilled")
                          .map((m) => (m as any).value.authorId)
                    : userInput!.split(","),
            );

            for (const userStr of targetInput) {
                try {
                    let user = await parseUserOrId(userStr);
                    if (!user) {
                        embeds.push(
                            embed(
                                `I can't resolve \`${sanitizeMessageContent(userStr).trim()}\` to a user.`,
                                null,
                                EmbedColor.SoftError,
                            ),
                        );
                        continue;
                    }

                    if (handledUsers.includes(user.id)) continue;
                    handledUsers.push(user.id);

                    // Check
                    if (user.id == message.authorId) {
                        embeds.push(embed("You cannot timeout yourself.", null, EmbedColor.Warning));
                        continue;
                    }
                    if (user.id == client.user!.id) {
                        embeds.push(embed("You cannot timeout the bot.", null, EmbedColor.Warning));
                        continue;
                    }

                    targetUsers.push(user);
                } catch (e) {
                    console.error(e);
                    embeds.push(
                        embed(
                            `Failed to resolve target \`${sanitizeMessageContent(userStr).trim()}\`: ${e}`,
                            "Failed to resolve user",
                            EmbedColor.Error,
                        ),
                    );
                }
			}

            if (targetUsers.length === 0) {
                if (embeds.length > 0) {
                    let firstMsg = true;
                    const embedsToSend = [...embeds];
                    while (embedsToSend.length > 0) {
                        const targetEmbeds = embedsToSend.splice(0, 10);
                        if (firstMsg) {
                            await message.reply({ embeds: targetEmbeds, content: "Operation completed with errors." }, false);
                        } else {
                            await message.channel?.sendMessage({ embeds: targetEmbeds });
                        }
                        firstMsg = false;
                    }
                    return;
                }
                return await message.reply({
                    embeds: [embed("No valid users were specified to timeout.", null, EmbedColor.SoftError)],
                });
            }

            // Timeout for each users
            for (const user of targetUsers) {
                try {
                    const infractionId = ulid();

                    if (duration === null) {
                        // Timeout Clear
                        await client.api.patch(
                            `/servers/${message.serverContext.id}/members/${user.id}` as "/servers/{server}/members/{target}",
                            {
                                timeout: new Date(0).toISOString(),
                            } as any,
                        );

                        // Log
                        await logModAction(
                            "timeout",
                            message.serverContext,
                            message.member!,
                            user.id,
                            reason,
                            infractionId,
                            "Timeout cleared."
                        );

                        embeds.push({
                            title: `Timeout cleared`,
                            colour: EmbedColor.Success,
                            description: `Timeout cleared for <@${user.id}> (\`${user.id}\`)`,
                        });
                    } else {
                        // Create Record
                        const infraction: Infraction = {
                            _id: infractionId,
                            createdBy: message.authorId!,
                            date: Date.now(),
                            reason: reason || "No reason provided",
                            server: message.serverContext.id,
                            type: InfractionType.Manual,
                            user: user.id,
                            actionType: "timeout", // Mark as timeout
                        };

                        // Store Record
                        const { userWarnCount } = await storeInfraction(infraction);

                        // Timeout Set
                        await client.api.patch(
                            `/servers/${message.serverContext.id}/members/${user.id}` as "/servers/{server}/members/{target}",
                            {
                                timeout: new Date(Date.now() + duration).toISOString(),
                            } as any,
                        );

                        // MS --> READABLE
                        const durationMs = duration;
                        const days = Math.floor(durationMs / (1000 * 60 * 60 * 24));
                        const hours = Math.floor((durationMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                        const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
                        const seconds = Math.floor((durationMs % (1000 * 60)) / 1000);
                        let durationStr = "";
                        if (days > 0) durationStr += `${days}d `;
                        if (hours > 0) durationStr += `${hours}h `;
                        if (minutes > 0) durationStr += `${minutes}m `;
                        if (seconds > 0 || durationStr === "") durationStr += `${seconds}s`;

                        // Log
                        await logModAction(
                            "timeout",
                            message.serverContext,
                            message.member!,
                            user.id,
                            reason + (durationInput ? ` (${durationInput})` : ""),
                            infractionId,
                            `Timeout duration: **${durationStr.trim()}**`
                        );

                        embeds.push({
                            title: `User timed out`,
                            colour: EmbedColor.Success,
                            description: 
                                `This is ${userWarnCount == 1 ? "**the first infraction**" : `infraction number **${userWarnCount}**`} for ${await fetchUsername(user.id)}.\n` +
                                `**Timeout duration:** ${durationStr.trim()}\n` +
                                `**User ID:** \`${user.id}\`\n` +
                                `**Infraction ID:** \`${infractionId}\`\n` +
                                `**Reason:** \`${infraction.reason}\``,
                        });
                    }
                } catch (e: any) {
                    console.error("" + e);
                    embeds.push(
                        embed(
                            `Failed to timeout <@${user.id}>: ${e.message || e}`,
                            "Failed to timeout user",
                            EmbedColor.Error,
                        ),
                    );
                }
            }

            // Send all results
            let firstMsg = true;
            const embedsToSend = [...embeds];
            while (embedsToSend.length > 0) {
                const targetEmbeds = embedsToSend.splice(0, 10);
                if (firstMsg) {
                    await message.reply(
                        {
                            embeds: targetEmbeds,
                            content: `Operation completed. ${duration === null ? "Timeouts cleared." : "Timeouts set."}`,
                        },
                        false,
                    );
                } else {
                    await message.channel?.sendMessage({ embeds: targetEmbeds });
                }
                firstMsg = false;
            }
        } catch (e) {
            console.error("" + e);
            message.reply({
                embeds: [embed("Something went wrong: " + e, "Command Error", EmbedColor.Error)],
            });
        }
    },
} as SimpleCommand;
