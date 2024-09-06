import SimpleCommand from "../../../struct/commands/SimpleCommand";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import CommandCategory from "../../../struct/commands/CommandCategory";
import { client } from "../../..";
import child_process from "child_process";
import { commands, ownerIDs } from "../../modules/command_handler";
import fs from "fs";
import path from "path";

const getCommitHash = (): Promise<string | null> =>
	new Promise((resolve) => {
		child_process.exec("git rev-parse HEAD", (err, stdout) => {
			if (err?.code) resolve(null);
			else resolve(stdout);
		});
	});

export default {
	name: "stats",
	aliases: ["statistics"],
	description: "Provides current AutoMod statistics.",
	category: CommandCategory.Owner,
	run: async (message: MessageCommandContext) => {
		const pjson = JSON.parse((await fs.promises.readFile(path.join(process.cwd(), "package.json"))).toString());
		const now = Date.now();
		const formattedOwnerIDs = ownerIDs.map((id) => `<@${id}>`);
		let msg =
			`## AutoMod Stats\n` +
			`### Cache\n` +
			`Servers: \`${client.servers.size()}\`\n` +
			`Channels: \`${client.channels.size()}\`\n` +
			`Users: \`${client.users.size()}\`\n` +
			`### Connection\n` +
			`API Endpoint: \`${client.options.baseURL}\`\n` +
			`WebSocket: \`${client.events.ping() ?? "--"}ms\`\n` +
			`Message: \`${Math.round(Date.now() - now)}ms\`\n` +
			`### Dependencies\n` +
			`revolt.js: \`${pjson.dependencies["revolt.js"]}\`\n` +
			`revolt-api: \`${pjson.dependencies["revolt-api"]}\`\n` +
			`axios: \`${pjson.dependencies["axios"]}\`\n` +
			`typescript: \`${pjson.devDependencies["typescript"]}\`\n` +
			`### Miscellaneous\n` +
			`Command count: \`${commands.length}\`\n` +
			`Environment: \`${process.env["NODE_ENV"] || "testing"}\`\n` +
			`Commit hash: \`${(await getCommitHash()) || "Unknown"}\`\n` +
			`Owners: \`${formattedOwnerIDs.length}\` (${formattedOwnerIDs.join(", ")})\n`;

		await message.reply(msg, false);
	},
} as SimpleCommand;
