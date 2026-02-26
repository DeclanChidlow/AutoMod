import SimpleCommand from "../../../struct/commands/SimpleCommand";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import CommandCategory from "../../../struct/commands/CommandCategory";
import { client, dbs } from "../../..";
import { commands, ownerIDs } from "../../modules/command_handler";
import fs from "fs";
import path from "path";

const pjson = JSON.parse((await fs.promises.readFile(path.join(process.cwd(), "package.json"))).toString());

export default {
	name: "stats",
	aliases: ["statistics", "status"],
	description: "Returns information about AutoMod.",
	documentation: "/owner/stats",
	restrict: "BOTOWNER",
	category: CommandCategory.Owner,
	run: async (message: MessageCommandContext) => {
		const now = Date.now();

		const formattedOwnerIDs = await Promise.all(
			ownerIDs.map(async (id) => {
				try {
					const user = await client.users.fetch(id);
					return user ? `${user.username}#${user.discriminator} (\`${id}\`)` : `Unknown (\`${id}\`)`;
				} catch (error) {
					return `Unknown (\`${id}\`)`;
				}
			}),
		);

		let msg =
			`## AutoMod Stats\n` +
			`### Cache\n` +
			`Servers: \`${client.servers.size()}\`\n` +
			`Channels: \`${client.channels.size()}\`\n` +
			`Users: \`${client.users.size()}\`\n` +
			`Infractions: \`${await dbs.INFRACTIONS.countDocuments({})}\`\n` +
			`### Connection\n` +
			`API Endpoint: \`${client.options.baseURL}\`\n` +
			`WebSocket: \`${client.events.ping() ?? "--"}ms\`\n` +
			`Message: \`${Math.round(Date.now() - now)}ms\`\n` +
			`### Dependencies\n` +
			`stoat.js: \`${pjson.dependencies["stoat.js"]}\`\n` +
			`stoat-api: \`${pjson.dependencies["stoat-api"]}\`\n` +
			`axios: \`${pjson.dependencies["axios"]}\`\n` +
			`mongodb: \`${pjson.dependencies?.["mongodb"]}\`\n` +
			`ulid: \`${pjson.dependencies?.["ulid"]}\`\n` +
			`### Miscellaneous\n` +
			`Command count: \`${commands.length}\`\n` +
			`Environment: \`${process.env["NODE_ENV"] || "testing"}\`\n` +
			`Owners (${formattedOwnerIDs.length}):  ${formattedOwnerIDs.join(", ")}`;
		await message.reply(msg, false);
	},
} as SimpleCommand;
