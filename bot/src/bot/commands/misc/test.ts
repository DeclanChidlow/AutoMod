import CommandCategory from "../../../struct/commands/CommandCategory";
import SimpleCommand from "../../../struct/commands/SimpleCommand";
import MessageCommandContext from "../../../struct/MessageCommandContext";

export default {
	name: "test",
	aliases: ["testalias"],
	description: "Test command",
	category: CommandCategory.Miscellaneous,
	run: (message: MessageCommandContext, args: string[]) => {
		message.reply({
			content: "Beep boop.",
			embeds: [
				{
					colour: "#58A551",
					title: "Test Success!",
					description: "You've successfully tested the bot. It works.",
					url: "https://automod.vale.rocks",
					icon_url: "https://autumn.revolt.chat/avatars/pYjK-QyMv92hy8GUM-b4IK1DMzYILys9s114khzzKY",
				},
			],
		});
	},
} as SimpleCommand;
