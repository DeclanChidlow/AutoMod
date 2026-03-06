import SimpleCommand from "../../../struct/commands/SimpleCommand";
import { client } from "../../..";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import CommandCategory from "../../../struct/commands/CommandCategory";

export default {
	name: "ping",
	aliases: null,
	description: "Checks how long it takes AutoMod to respond.",
	documentation: "/miscellaneous/ping",
	category: CommandCategory.Miscellaneous,
	run: async (message: MessageCommandContext) => {
		const now = Date.now();
		const wsPing = client.events.ping();
		const wsDisplay = wsPing === null || wsPing < 0 ? "\`Reconnecting/Syncing…\`" : `\`${wsPing}ms\``;

		const uptime = process.uptime();
		const d = Math.floor(uptime / 86400);
		const h = Math.floor((uptime % 86400) / 3600);
		const m = Math.floor((uptime % 3600) / 60);
		const s = Math.floor(uptime % 60);

		let uptimeStr = "";
		if (d > 0) uptimeStr += `${d}d `;
		if (h > 0) uptimeStr += `${h}h `;
		if (m > 0) uptimeStr += `${m}m `;
		if (uptime < 300) uptimeStr += `${s}s`;

		message
			.reply(`⌛ Measuring...`)
			?.catch(console.error)
			.then((msg) => {
				if (msg) {
					msg.edit({
						content: ["## Ping Pong!", `WebSocket: ${wsDisplay}`, `Message: \`${Math.round(Date.now() - now)}ms\``, `Uptime: \`${uptimeStr.trim() || "0s"}\``].join("\n"),
					});
				}
			});
	},
} as SimpleCommand;
