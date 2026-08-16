import CommandCategory from "../../../struct/commands/CommandCategory";
import SimpleCommand from "../../../struct/commands/SimpleCommand";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import { client, dbs } from "../../..";
import { isBotManager, NO_MANAGER_MSG } from "../../util";

const SYNTAX = "{prefix}logs [category] [#channel] | {prefix}logs remove [category]";

export default {
	name: "logs",
	aliases: [],
	description: "Configure log collection.",
	documentation: "/configuration/logs",
	syntax: SYNTAX,
	category: CommandCategory.Configuration,
	run: async (message: MessageCommandContext, args: string[]) => {
		if (!(await isBotManager(message))) return message.reply(NO_MANAGER_MSG("manage logging"));

		if (["remove", "off", "disable"].includes(args[0]?.toLowerCase())) {
			const category = args[1]?.toLowerCase();

			switch (category) {
				case "messageupdate": {
					const config = await dbs.SERVERS.findOne({ id: message.channel!.serverId! });
					if (!config?.logs?.messageUpdate) return await message.reply("Message update logs are not configured for this server.");
					await dbs.SERVERS.updateOne({ id: message.channel!.serverId! }, { $unset: { "logs.messageUpdate": "" } });
					return await message.reply("Removed message update logs from this server.");
				}

				case "modaction": {
					const config = await dbs.SERVERS.findOne({ id: message.channel!.serverId! });
					if (!config?.logs?.modAction) return await message.reply("Moderation logs are not configured for this server.");
					await dbs.SERVERS.updateOne({ id: message.channel!.serverId! }, { $unset: { "logs.modAction": "" } });
					return await message.reply("Removed moderation logs from this server.");
				}

				default: {
					return await message.reply(`Usage: \`${message.prefix}logs remove [category]\`\nCategories: \`messageupdate\`, \`modaction\``);
				}
			}
		}

		if (!args[0]) {
			return await message.reply(`No category specified. Syntax: \`${SYNTAX.replace(/{prefix}/g, message.prefix)}\`\n` + `Categories: \`messageupdate\`, \`modaction\``);
		}

		if (!args[1]) {
			return await message.reply("No target channel specified.");
		}

		let channelInput = args[1];
		if (channelInput.startsWith("<#") && channelInput.endsWith(">")) {
			channelInput = channelInput.substring(2, channelInput.length - 1);
		}

		const channel = client.channels.get(channelInput);
		if (!channel) return message.reply("I can't find that channel.");
		if (channel.serverId != message.channel?.serverId) return message.reply("That channel is not part of this server!");
		if (!channel.havePermission("SendMessage")) return message.reply("I don't have permission to **send messages** in that channel.");
		if (!channel.havePermission("SendEmbeds")) return message.reply("I don't have permission to **send embeds** in that channel.");

		switch (args[0]?.toLowerCase()) {
			case "messageupdate": {
				await dbs.SERVERS.updateOne(
					{ id: message.channel!.serverId! },
					{
						$set: {
							"logs.messageUpdate.stoat": {
								channel: channel.id,
								type: "EMBED",
							},
						},
						$setOnInsert: {
							id: message.channel!.serverId!,
						},
					},
					{ upsert: true },
				);
				await message.reply(`Bound message update logs to <#${channel.id}>!`);
				break;
			}

			case "modaction": {
				await dbs.SERVERS.updateOne(
					{ id: message.channel!.serverId! },
					{
						$set: {
							"logs.modAction.stoat": {
								channel: channel.id,
								type: "EMBED",
							},
						},
						$setOnInsert: {
							id: message.channel!.serverId!,
						},
					},
					{ upsert: true },
				);
				await message.reply(`Bound moderation logs to <#${channel.id}>!`);
				break;
			}

			default: {
				return await message.reply("Unknown log category");
			}
		}
	},
} as SimpleCommand;
