import SimpleCommand from "../../../struct/commands/SimpleCommand";
import { client } from "../../..";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import CommandCategory from "../../../struct/commands/CommandCategory";

export default {
	name: "ping",
	aliases: null,
	description: "Checks response times.",
	category: CommandCategory.Miscellaneous,
	run: async (message: MessageCommandContext) => {
		let now = Date.now();
		message
			.reply(`Measuring...`)
			?.catch(console.error)
			.then((msg) => {
				if (msg) msg.edit({ content: `## Ping Pong!\n` + `WebSocket: \`${client.events.ping() ?? "--"}ms\`\n` + `Message: \`${Math.round(Date.now() - now)}ms\`` });
			});
	},
} as SimpleCommand;
