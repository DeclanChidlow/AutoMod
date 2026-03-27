import CommandCategory from "../../../struct/commands/CommandCategory";
import SimpleCommand from "../../../struct/commands/SimpleCommand";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import { dedupeArray, embed, EmbedColor, isModerator, NO_MANAGER_MSG, parseUserOrId, sanitizeMessageContent } from "../../util";
import { dbs } from "../../..";
import type { SendableEmbed } from "stoat-api";
import { client } from "../../.."; 

const normalizeEmoji = (emoji: string) => {
    return emoji.replace(/^:([A-Z0-9]+):$/i, "$1").replace(/[\uFE0F\uE0E2]/g, "");
};

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

            // Reaction Subcommand
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

            // Add/Remove
            if (!action || (action !== "add" && action !== "rm" && action !== "remove")) {
                return message.reply("Invalid action. Use `/role add @user role`, `/role remove @user role`, or `/role reaction add/remove ...`.");
            }

            // Support for multi users
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

            const roleArg = args.shift();
            if (!roleArg) return message.reply("No role specified.");
            const roleIdMatch = roleArg.match(/^<%([A-Z0-9]+)>$/i);
            const roleId = roleIdMatch ? roleIdMatch[1] : roleArg;
            const server = message.channel?.server;
            if (!server || !server.roles || !server.roles.get(roleId)) {
                return message.reply(`Role "${roleArg}" does not exist in this server.`);
            }

            const embeds: SendableEmbed[] = [];
            const handledUsers: string[] = [];
            const targetMembers: Array<{ id: string; currentRoles: string[] }> = [];

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

                    const target = await server.fetchMember(user.id);
                    if (!target) {
                        embeds.push(embed(`<@${user.id}> is not a member of this server.`, null, EmbedColor.SoftError));
                        continue;
                    }
                    targetMembers.push({ id: user.id, currentRoles: target.roles || [] });
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

            if (targetMembers.length === 0) {
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
                    embeds: [embed("No valid server members were specified to manage roles for.", null, EmbedColor.SoftError)],
                });
            }

            // Add/Remove for each users
            for (const member of targetMembers) {
                try {
                    const currentRoles = member.currentRoles;
                    if (action === "add") {
                        if (currentRoles.includes(roleId)) {
                            embeds.push(embed(`<@${member.id}> already has the role <@&${roleId}>.`, null, EmbedColor.Warning));
                            continue;
                        }
                        const newRoles = [...currentRoles, roleId];
                        await client.api.patch(
                            `/servers/${server.id}/members/${member.id}` as "/servers/{server}/members/{target}",
                            { roles: newRoles } as any
                        );
                        embeds.push({
                            title: `Role added`,
                            colour: EmbedColor.Success,
                            description: `Role <@&${roleId}> has been added to <@${member.id}>.`,
                        });
                    } else { // action === "rm" or "remove"
                        if (!currentRoles.includes(roleId)) {
                            embeds.push(embed(`<@${member.id}> does not have the role <@&${roleId}>.`, null, EmbedColor.Warning));
                            continue;
                        }
                        const newRoles = currentRoles.filter((role) => role !== roleId);
                        await client.api.patch(
                            `/servers/${server.id}/members/${member.id}` as "/servers/{server}/members/{target}",
                            { roles: newRoles } as any
                        );
                        embeds.push({
                            title: `Role removed`,
                            colour: EmbedColor.Success,
                            description: `Role <@&${roleId}> has been removed from <@${member.id}>.`,
                        });
                    }
                } catch (error: any) {
                    console.error("Role operation error for user", member.id, error);
                    embeds.push(
                        embed(
                            `Failed to ${action} role <@&${roleId}> for <@${member.id}>: ${error.message || error}`,
                            "Operation failed",
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
                            content: `Operation completed.`,
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
