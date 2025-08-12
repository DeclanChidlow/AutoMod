import SimpleCommand from "../../../struct/commands/SimpleCommand";
import { client } from "../../..";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import CommandCategory from "../../../struct/commands/CommandCategory";

export default {
	name: "ping",
	aliases: null,
	description: "Checks how long it takes AutoMod to respond.",
	documentation: "/docs/commands/miscellaneous/ping",
	category: CommandCategory.Miscellaneous,
	run: async (message: MessageCommandContext) => {
		const now = Date.now();
		message
			.reply(`Measuring...`)
			?.catch(console.error)
			.then((msg) => {
				if (msg) msg.edit({ content: ["## Ping Pong!", `WebSocket: \`${client.events.ping() ?? "--"}ms\``, `Message: \`${Math.round(Date.now() - now)}ms\``].join("\n") });
			});
	},
} as SimpleCommand;
