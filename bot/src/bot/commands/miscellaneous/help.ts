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
		description: "Commands for enforcing server rules.",
		aliases: ["moderation", "mod"],
	},
	[CommandCategory.Configuration]: {
		friendlyName: "Configuration",
		description: "Commands for setting up and customizing settings.",
		aliases: ["configuration", "config", "conf"],
	},
	[CommandCategory.Owner]: {
		friendlyName: "Owner",
		description: "Exclusive commands for the bot owner to manage and control AutoMod.",
		aliases: ["owner"],
	},
	[CommandCategory.Miscellaneous]: {
		friendlyName: "Miscellaneous",
		description: "Additional commands not covered by other categories.",
		aliases: ["miscellaneous", "misc"],
	},
	[CommandCategory.None]: {
		friendlyName: "Uncategorized",
		description: "Commands that haven't been assigned to a specific category.",
		aliases: [],
	},
};

export default {
	name: "help",
	aliases: null,
	description: "Displays instructions for using the bot’s commands.",
	documentation: "/docs/commands/miscellaneous/help",
	removeEmptyArgs: true,
	category: CommandCategory.Miscellaneous,
	run: async (message: MessageCommandContext, args: string[]) => {
		const isBotOwner = ownerIDs.includes(message.authorId!);
		const prefix = DEFAULT_PREFIX; // TODO: fetch prefix from server config

		let searchInput = args.shift()?.toLowerCase();
		if (!searchInput) {
			let msg =
				`## AutoMod Help\n` +
				`Type \`${prefix}help [category]\` to view commands within a category, or \`${prefix}help [command]\` to learn more about a specific command. Visit [the documentation](<https://automod.vale.rocks/docs>) for usage information and [the AutoMod server](https://rvlt.gg/automod) for help.\n\n`;

			let total = 0;

			for (const categoryName in CommandCategory) {
				let cmdCount = commands.filter((cmd) => cmd.category == categoryName && (cmd.restrict == "BOTOWNER" ? isBotOwner : true)).length;

				if (cmdCount > 0) {
					total++;
					const category = (categories as any)[categoryName];
					msg += `**${category.friendlyName}**\n` + ` \u200b \u200b ↳ ${category.description} \u200b $\\big |$ \u200b **${cmdCount}** command${cmdCount == 1 ? "" : "s"}\n`;
				}
			}

			msg += `\n##### Categories: ${total}\n\n` + `[Open Server Settings]` + `(<${process.env["WEB_UI_URL"] || "https://automod.vale.rocks"}/dashboard/${message.channel?.serverId}>)`;

			await message.reply(msg);
		} else {
			let [categoryName, category] =
				Object.entries(categories).find((c) => c[1].friendlyName.toLowerCase() == searchInput || c[0].toLowerCase() == searchInput) ||
				Object.entries(categories).find((c) => c[1].aliases.find((k) => k.toLowerCase() == searchInput)) ||
				[];
			if (category && !searchInput.startsWith(prefix)) {
				let msg = `## AutoMod Help - ${category.friendlyName}\n` + `${category.description}\n\n` + `Type \`${prefix}help [command]\` to learn more about a specific command.\n\n`;

				let cmdList = commands.filter((c) => (c.category || "uncategorized") == categoryName);
				if (cmdList.length > 0) {
					for (const cmd of cmdList) {
						msg += `**${prefix}${cmd.name}** - ${cmd.description}`;
						msg += "\n";
					}

					msg += `##### ${category.friendlyName} Commands: ${cmdList.length}`;
				} else msg += `### This category is empty.`;

				await message.reply(msg);
			} else {
				if (searchInput.startsWith(prefix)) searchInput = searchInput.substring(prefix.length);
				let cmd = commands.find((c) => c.name.toLowerCase() === searchInput) || commands.find((c) => Array.isArray(c.aliases) && c.aliases.find((k) => k.toLowerCase() === searchInput));

				if (!cmd) {
					return message.reply(`I can't find any command or category matching \`${searchInput}\`.`);
				} else {
					let msg = `## AutoMod Help - ${cmd.name}\n` + `${cmd.description}\n\n` + `Documentation: <https://automod.vale.rocks${cmd.documentation}>\n\n`;

					if (cmd.syntax) msg += `Syntax: \`${cmd.syntax}\`\n`;
					msg += "Aliases: " + (Array.isArray(cmd.aliases) && cmd.aliases.length > 0 ? `\`${cmd.aliases.join(`\`, \``)}\`` : "None") + "\n";

					message.reply(msg);
				}
			}
		}
	},
} as Command;
