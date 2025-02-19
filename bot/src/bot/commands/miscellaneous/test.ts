import CommandCategory from "../../../struct/commands/CommandCategory";
import SimpleCommand from "../../../struct/commands/SimpleCommand";
import MessageCommandContext from "../../../struct/MessageCommandContext";

export default {
	name: "test",
	aliases: null,
	description: "Checks that the bot works.",
	documentation: "/docs/commands/miscellaneous/test",
	category: CommandCategory.Miscellaneous,
	run: async (message: MessageCommandContext) => {
		message.reply({
			content: "Beep boop.",
			embeds: [
				{
					colour: "#9ee09c",
					title: "Test Success!",
					description: "You've successfully tested the bot. It works.",
					url: "https://automod.vale.rocks",
					icon_url: "https://automod.vale.rocks/assets/favicons/favicon.svg",
				},
			],
		});
	},
} as SimpleCommand;
