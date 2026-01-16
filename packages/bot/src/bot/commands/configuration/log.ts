import { client, dbs } from "../../..";
import CommandCategory from "../../../struct/commands/CommandCategory";
import SimpleCommand from "../../../struct/commands/SimpleCommand";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import { DEFAULT_PREFIX } from "../../modules/command_handler";
import { isBotManager, NO_MANAGER_MSG } from "../../util";

export default {
	name: "logs",
	aliases: null,
	description: "Configure log collection.",
	documentation: "/docs/commands/configuration/logs",
	category: CommandCategory.Configuration,
	run: async (message: MessageCommandContext, args: string[]) => {
		if (!(await isBotManager(message))) return message.reply(NO_MANAGER_MSG);

		if (!args[0]) {
			return await message.reply(`No category specified. Syntax: \`${DEFAULT_PREFIX}logs [category] [#channel]\`\n` + `Categories: \`messageupdate\`, \`modaction\``);
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
				await dbs.SERVERS.update(
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
				await dbs.SERVERS.update(
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
