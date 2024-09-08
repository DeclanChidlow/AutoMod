import SimpleCommand from "../../../struct/commands/SimpleCommand";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import CommandCategory from "../../../struct/commands/CommandCategory";
import { client } from "../../..";
import { commands, ownerIDs } from "../../modules/command_handler";
import fs from "fs";
import path from "path";

const pjson = JSON.parse((await fs.promises.readFile(path.join(process.cwd(), "package.json"))).toString());
const now = Date.now();

const formattedOwnerIDs = await Promise.all(
	ownerIDs.map(async (id) => {
		const user = await client.users.fetch(id);
		return user ? `${user.username}#${user.discriminator} (\`${id}\`)` : `Unknown (\`${id}\`)`;
	}),
);

export default {
	name: "stats",
	aliases: ["statistics"],
	description: "Provides current AutoMod statistics.",
	category: CommandCategory.Owner,
	run: async (message: MessageCommandContext) => {
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
			`Owners (${formattedOwnerIDs.length}):  ${formattedOwnerIDs.join(", ")}`;
		await message.reply(msg, false);
	},
} as SimpleCommand;
