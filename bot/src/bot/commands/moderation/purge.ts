import SimpleCommand from "../../../struct/commands/SimpleCommand";
import { Message } from "revolt.js";
import { decodeTime } from 'ulid';
import { isModerator, parseUserOrId } from "../../util";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import CommandCategory from "../../../struct/commands/CommandCategory";

const SYNTAX = "/purge [number] [user[,user...]]";
const MAX_PURGE_AMOUNT = 100;

export default {
    name: "purge",
    aliases: ["clear"],
    description: "Delete messages in bulk.",
    syntax: SYNTAX,
    category: CommandCategory.Moderation,
    run: async (message: MessageCommandContext, args: string[]) => {
        try {
            if (!message.member || !(await isModerator(message)))
                return message.reply("🔒 Access denied");

            let messages: Array<Message> = [];
            // X amount of messages from bottom
            if (/^[0-9]+$/g.test(args[0])) {
                let amount = Number(args[0]);
                if (isNaN(amount)) return message.reply("Invalid number");
                if (amount > MAX_PURGE_AMOUNT)
                    return message.reply(
                        `Message count exceeds the limit of ${MAX_PURGE_AMOUNT}.`
                    );

                messages = await message.channel!.fetchMessages({
                    limit: amount,
                    before: message.id,
                });
            }
            // delete messages between [id] and [id]
            // [0-9A-HJ-KM-NP-TV-Z]{26} -> matches ULIDs
            else if (
                /^[0-9A-HJ-KM-NP-TV-Z]{26}-[0-9A-HJ-KM-NP-TV-Z]{26}$/g.test(
                    args[0]
                )
            ) {
                let [id1, id2] = args[0].split("-");

                let [msg1, msg2] = await Promise.all([
                    message.channel!.fetchMessage(id1),
                    message.channel!.fetchMessage(id2),
                ]);

                // Make sure the msg1 and msg2 are in the correct order
                if (decodeTime(msg1.id) < decodeTime(msg2.id)) {
                    [msg1, msg2] = [msg2, msg1];
                }

                messages = await message.channel!.fetchMessages({
                    before: id2,
                    after: id1,
                    limit: MAX_PURGE_AMOUNT,
                    sort: "Latest",
                });

                if (!messages.find((m) => m.id == msg1.id))
                    messages = [msg1, ...messages];
                if (!messages.find((m) => m.id == msg2.id))
                    messages = [...messages, msg2];

                // Discard messages that are not in the selected range,
                // because Revolt returns more messages than expected for some reason
                messages = messages.filter(
                    (m) =>
                        decodeTime(m.id) <= decodeTime(id2) &&
                        decodeTime(m.id) >= decodeTime(id1)
                );
            }
            // allow single messages too, because why not?
            else if (/^[0-9A-HJ-KM-NP-TV-Z]{26}$/g.test(args[0])) {
                messages = [await message.channel!.fetchMessage(args[0])];
            } else {
                return message.reply(
                    `I can't parse that message range.\nSyntax: \`${SYNTAX}\``
                );
            }

            if (args[1]) {
                let p = args[1].split(",").map((u) => parseUserOrId(u));
                let users = await Promise.all(p);

                if (users.filter((u) => !u).length > 0)
                    return message.reply(
                        "At least one of the supplied users could not be found."
                    );

                messages = messages.filter((m) =>
                    users.find((u) => u?.id == m.authorId)
                );
            }

            await message.channel?.deleteMessages(messages.map((m) => m.id));

            const replyMsg = await message.channel
                ?.sendMessage({
                    content: `Deleted ${messages.length} messages.`,
                })
                .catch(console.error);

            setTimeout(async () => {
                try {
                    await message.channel?.deleteMessages([
                        replyMsg!.id,
                        message.id,
                    ]);
                } catch (e) {
                    console.error(e);
                }
            }, 6000);
        } catch (e) {
            console.error(e);
            message.channel?.sendMessage(`An error has occurred: ${e}`);
        }
    },
} as SimpleCommand;
