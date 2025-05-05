import ServerConfig from "automod/dist/types/ServerConfig";
import axios from "axios";
import FormData from "form-data";
import { client, dbs } from "../../..";
import CommandCategory from "../../../struct/commands/CommandCategory";
import SimpleCommand from "../../../struct/commands/SimpleCommand";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import { checkMessageForFilteredWords } from "../../modules/antispam";
import { DEFAULT_PREFIX } from "../../modules/command_handler";
import { embed, EmbedColor, getDmChannel, isBotManager, NO_MANAGER_MSG, sanitizeMessageContent } from "../../util";

const WORDLIST_DEFAULT_MESSAGE = "<@{{user_id}}>, the message you sent contained a blocked word.";

export default {
	name: "filter",
	aliases: null,
	description: "Allows for messages to be checked against a word list and then action to be taken based on infractions.",
	documentation: "/docs/commands/configuration/filter",
	category: CommandCategory.Configuration,
	run: async (message: MessageCommandContext, args: string[]) => {
		if (!(await isBotManager(message))) return message.reply(NO_MANAGER_MSG);

		const config = await dbs.SERVERS.findOne({ id: message.channel!.serverId! });

		switch (args.shift()?.toLowerCase()) {
			case "enable": {
				await dbs.SERVERS.update({ id: message.channel!.serverId! }, { $set: { wordlistEnabled: true } }, { upsert: true });
				await message.reply(`Word filtering is now **enabled** in this server.\nThere are currently ${config?.wordlist?.length ?? 0} words on your list.`);
				break;
			}
			case "disable": {
				await dbs.SERVERS.update({ id: message.channel!.serverId! }, { $set: { wordlistEnabled: false } }, { upsert: true });
				await message.reply("Word filter is now **disabled** in this server.");
				break;
			}
			case "add": {
				let strictness: any = "HARD";
				if (["soft", "hard", "strict"].includes(args[0]?.toLowerCase())) {
					strictness = args.shift()!.toUpperCase() as any;
				}

				const word = args.join(" ").toLowerCase();
				if (!word) return message.reply("You didn't provide a word to add to the list!");
				if (config?.wordlist?.find((w) => w.word == word)) return await message.reply("That word is already on the list!");

				await dbs.SERVERS.update({ id: message.channel!.serverId! }, { $push: { wordlist: { strictness, word } } }, { upsert: true });
				await message.reply(`'${word}' added with strictness **${strictness}**.`);
				break;
			}
			case "remove": {
				const word = args.join(" ").toLowerCase();
				if (!word) return message.reply("You need to provide the word to remove from the list.");

				if (!config?.wordlist?.find((w) => w.word == word)) return await message.reply("That word is not on the list.");
				await dbs.SERVERS.update({ id: message.channel!.serverId! }, { $pull: { wordlist: { word } } }, { upsert: true });
				await message.reply(`Word removed successfully.`);
				break;
			}
			case "list": {
				if (!config?.wordlist || config.wordlist.length === 0) {
					return message.reply("Your word list is currently empty. Add words using the `filter add` command.");
				}

				// Format the wordlist as a plain text message for reliability
				const wordlistText = config.wordlist.map((w) => `${w.strictness}\t${w.word}`).join("\n");
				const formattedWordlist = `# Word List for ${message.channel?.server?.name}\n\n` + `Total words: ${config.wordlist.length}\n\n` + `STRICTNESS\tWORD\n` + `-----------\t----\n` + wordlistText;

				try {
					// Try to use the attachment service
					// TODO: Fix this mess lol
					const formData = new FormData();
					formData.append(`wordlist_${message.channel?.serverId}`, wordlistText, `wordlist_${message.channel?.serverId}.txt`);

					try {
						const channel = await getDmChannel(message.authorId!);
						const res = await axios.post(`${client.configuration?.features.autumn.url}/attachments`, formData, {
							headers: formData.getHeaders(),
							responseType: "json",
							timeout: 5000,
						});

						if (res.data && res.data.id) {
							await channel.sendMessage({
								embeds: [embed(`Here's the current word list for **${message.channel?.server?.name}**.`, "Word List", EmbedColor.Success)],
								attachments: [res.data.id],
							});
							await message.reply(`I have sent the current word list to your direct messages!`);
							return;
						} else {
							throw new Error("Invalid response from attachment service");
						}
					} catch (error) {
						// If the attachment upload fails, send the word list as a DM message directly
						console.log("Attachment upload failed, falling back to direct message:", error instanceof Error ? error.message : "Unknown error");

						const channel = await getDmChannel(message.authorId!);
						await channel.sendMessage({
							embeds: [embed(`Here's the current word list for **${message.channel?.server?.name}**.\n\n` + "```\n" + formattedWordlist + "\n```", "Word List", EmbedColor.Success)],
						});
						await message.reply(`I have sent the current word list to your direct messages!`);
					}
				} catch (error) {
					console.error("Failed to send word list:", error);
					const errorMessage = error instanceof Error ? error.message : "Unknown error";

					await message.reply(`Failed to send the word list. Error: ${errorMessage}. Please contact the bot administrator.`);
				}
				break;
			}
			case "message": {
				const msg = args.join(" ");
				if (!msg) {
					await message.reply(
						"This command lets you change the message the bot will send if a message is filtered.\n" +
							"Note that this message will not be sent if the configured action is to log events only.\n" +
							"The current message is:\n" +
							`>${sanitizeMessageContent(config?.wordlistAction?.message ?? WORDLIST_DEFAULT_MESSAGE)
								.trim()
								.replace(/\n/g, "\n>")}\n` +
							"`{{user_id}}` will be substituted for the target user's ID.",
					);
					return;
				}

				await dbs.SERVERS.update({ id: message.channel!.serverId! }, { $set: { wordlistAction: { action: config?.wordlistAction?.action ?? "LOG", message: msg } } }, { upsert: true });
				await message.reply("Filter message set!");
				break;
			}
			case "action": {
				let action: string;
				switch (args[0]?.toLowerCase()) {
					case "log":
					case "delete":
					case "warn":
						action = args[0].toUpperCase();
						break;
					default:
						await message.reply(
							"Please provide one of the following arguments:\n" +
								"- **log** (Log the message in mod action log channel)\n" +
								"- **delete** (Log and delete the message)\n" +
								"- **warn** (Log and delete message, warn user)\n\n" +
								`The currently configured action is **${config?.wordlistAction?.action ?? "LOG"}**.`,
						);
						return;
				}

				await dbs.SERVERS.update(
					{ id: message.channel!.serverId! },
					{
						$set: {
							wordlistAction: {
								action: action as any,
								message: config?.wordlistAction?.message ?? WORDLIST_DEFAULT_MESSAGE,
							},
						},
					},
					{ upsert: true },
				);
				await message.reply(`Filter action set to **${action}**. ` + `Please make sure you configured a logging channel using \`${DEFAULT_PREFIX}logs\`.`);
				break;
			}
			case "test": {
				const match = checkMessageForFilteredWords(args.join(" "), config as ServerConfig);
				await message.reply({
					embeds: [
						match
							? embed("Your word list matches this test phrase!", "Filter Test", EmbedColor.SoftError)
							: embed("Your word list does not match this test phrase!", "Filter Test", EmbedColor.Success),
					],
				});
				break;
			}
			default: {
				await message.reply(
					`### This command allows you to configure a manual word filter.\n` +
						`- **${DEFAULT_PREFIX}filter enable** - Enable the word filter.\n` +
						`- **${DEFAULT_PREFIX}filter disable** - Disable the word filter.\n` +
						`- **${DEFAULT_PREFIX}filter add [soft|hard|strict] [word]** - Add a word to the list. If omitted, defaults to 'hard'.\n` +
						`- **${DEFAULT_PREFIX}filter remove** - Remove a word from the list.\n` +
						`- **${DEFAULT_PREFIX}filter list** - Send the current filter list.\n` +
						`- **${DEFAULT_PREFIX}filter message [message]** - Set the message sent when a message is matched.\n` +
						`- **${DEFAULT_PREFIX}filter action [log|delete|warn]** - Configure the action taken on filtered messages.\n` +
						`- **${DEFAULT_PREFIX}filter test [phrase]** - Test whether a phrase matches your word list.\n`,
				);
				break;
			}
		}
	},
} as SimpleCommand;

export { WORDLIST_DEFAULT_MESSAGE };
