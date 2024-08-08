import Command from "../../../struct/commands/SimpleCommand";
import { commands, DEFAULT_PREFIX, ownerIDs } from "../../modules/command_handler";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import CommandCategory from "../../../struct/commands/CommandCategory";

const categories: {
	[key in CommandCategory]: {
		friendlyName: string;
		description: string;
		aliases: string[];
	};
} = {
	[CommandCategory.Moderation]: {
		friendlyName: "Moderation",
		description: "Moderation-focused commands",
		aliases: ["moderation", "mod"],
	},
	[CommandCategory.Config]: {
		friendlyName: "Configuration",
		description: "Configure AutoMod",
		aliases: ["configuration", "config", "conf"],
	},
	[CommandCategory.Owner]: {
		friendlyName: "Owner",
		description: "Owner-only commands for managing AutoMod",
		aliases: ["owner"],
	},
	[CommandCategory.Miscellaneous]: {
		friendlyName: "Miscellaneous",
		description: "Assorted extras",
		aliases: ["miscellaneous", "misc"],
	},
	[CommandCategory.None]: {
		friendlyName: "Uncategorized",
		description: "Uncategorized commands",
		aliases: [],
	},
};

export default {
	name: "help",
	aliases: null,
	description: "Help command.",
	removeEmptyArgs: true,
	category: CommandCategory.Miscellaneous,
	run: async (message: MessageCommandContext, args: string[]) => {
		const isBotOwner = ownerIDs.includes(message.authorId!);
		const prefix = DEFAULT_PREFIX; // TODO: fetch prefix from server config

		let searchInput = args.shift()?.toLowerCase();
		if (!searchInput) {
			let msg =
				`## AutoMod Help\n` +
				`Type **${prefix}help [category]** to view see all commands or **${prefix}help [command]** to learn more about a command.\n\n` +
				`### [Open Server Settings]` +
				`(<${process.env['WEB_UI_URL'] || "https://automod.vale.rocks"}/dashboard/${message.channel?.serverId}>)\n\n`;

			let total = 0;

			for (const categoryName in CommandCategory) {
				let cmdCount = commands.filter((cmd) => cmd.category == categoryName && (cmd.restrict == "BOTOWNER" ? isBotOwner : true)).length;

				if (cmdCount > 0) {
					total++;
					const category = (categories as any)[categoryName];
					msg += `**${category.friendlyName}**\n` + ` \u200b \u200b ↳ ${category.description} \u200b $\\big |$ \u200b **${cmdCount}** command${cmdCount == 1 ? "" : "s"}\n`;
				}
			}

			msg += `\n##### Categories: ${total}`;

			await message.reply(msg);
		} else {
			let [categoryName, category] =
				Object.entries(categories).find((c) => c[1].friendlyName.toLowerCase() == searchInput || c[0].toLowerCase() == searchInput) ||
				Object.entries(categories).find((c) => c[1].aliases.find((k) => k.toLowerCase() == searchInput)) ||
				[];
			if (category && !searchInput.startsWith(prefix)) {
				let msg = `**AutoMod Help** - Category: ${category.friendlyName}\n` + `${category.description}\n\n` + `Type **${prefix}help [command]** to learn more about a command.\n\n`;

				let cmdList = commands.filter((c) => (c.category || "uncategorized") == categoryName);
				if (cmdList.length > 0) {
					for (const cmd of cmdList) {
						msg += `**${prefix}${cmd.name}** \u200b $\\big |$ \u200b ${cmd.description}\n`;

						msg += "\n";
					}

					msg += `##### Total: ${cmdList.length}`;
				} else msg += `### This category is empty.`;

				await message.reply(msg);
			} else {
				if (searchInput.startsWith(prefix)) searchInput = searchInput.substring(prefix.length);
				let cmd = commands.find((c) => c.name.toLowerCase() == searchInput) || commands.find((c) => c.aliases && c.aliases.find((k) => k.toLowerCase() == searchInput));

				if (!cmd) {
					return message.reply(`I can't find any command or category matching \`${searchInput}\`.`);
				} else {
					let msg = `**AutoMod Help** - Command: ${cmd.name}\n` + `${cmd.description}\n\n`;

					if (cmd.syntax) msg += `Syntax: \`${cmd.syntax}\`\n`;
					msg += "Aliases: " + (cmd.aliases ? `\`${cmd.aliases.join(`\`, \``)}\`` : "None") + "\n";

					message.reply(msg);
				}
			}
		}
	},
} as Command;
