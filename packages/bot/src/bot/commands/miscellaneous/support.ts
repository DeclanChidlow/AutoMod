import CommandCategory from "../../../struct/commands/CommandCategory";
import SimpleCommand from "../../../struct/commands/SimpleCommand";
import MessageCommandContext from "../../../struct/MessageCommandContext";

export default {
	name: "support",
	aliases: ["donate", "tip"],
	description: "Provides details regarding how to financially support AutoMod’s development and hosting.",
	documentation: "/docs/commands/miscellaneous/support",
	category: CommandCategory.Miscellaneous,
	run: async (message: MessageCommandContext) => {
		message.reply({
			content: "AutoMod is hosted and developed free of charge, but your financial support is greatly appreciated. You can support me via https://vale.rocks/support. Thank you so very much!",
		});
	},
} as SimpleCommand;
