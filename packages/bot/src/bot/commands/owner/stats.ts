import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import SimpleCommand from "../../../struct/commands/SimpleCommand";
import CommandCategory from "../../../struct/commands/CommandCategory";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import { commands, ownerIDs } from "../../modules/command_handler";
import { client, dbs } from "../../..";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const pjson = JSON.parse((await fs.promises.readFile(path.join(dirname, "..", "..", "..", "..", "package.json"))).toString());

const CONNECTION_STATE_LABELS: Record<number, string> = {
	0: "Idle",
	1: "Connecting",
	2: "Connected",
	3: "Disconnected",
};

export default {
	name: "stats",
	aliases: ["statistics", "status"],
	description: "Returns information about AutoMod.",
	documentation: "/owner/stats",
	restrict: "BOTOWNER",
	category: CommandCategory.Owner,
	run: async (message: MessageCommandContext) => {
		const now = Date.now();
		const uptime = process.uptime();

		const days = Math.floor(uptime / 86400);
		const hours = Math.floor((uptime % 86400) / 3600);
		const minutes = Math.floor((uptime % 3600) / 60);
		const seconds = Math.floor(uptime % 60);
		const uptimeStr = `${days}d ${hours}h ${minutes}m ${seconds}s`;

		const [infractionCount, tempbanCount, reactionRoleCount, serverConfigCount] = await Promise.all([
			dbs.INFRACTIONS.estimatedDocumentCount().catch(() => dbs.INFRACTIONS.countDocuments({}).catch(() => "?")),
			dbs.TEMPBANS.estimatedDocumentCount().catch(() => dbs.TEMPBANS.countDocuments({}).catch(() => "?")),
			dbs.REACTION_ROLES.estimatedDocumentCount().catch(() => dbs.REACTION_ROLES.countDocuments({}).catch(() => "?")),
			dbs.SERVERS.estimatedDocumentCount().catch(() => dbs.SERVERS.countDocuments({}).catch(() => "?")),
		]);

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

		// Build dependency string dynamically from package.json
		const deps = pjson.dependencies || {};
		const depEntries = Object.entries(deps)
			.filter(([name]) => name !== "automod-lib")
			.sort(([a], [b]) => a.localeCompare(b));
		const depStr = depEntries.map(([name, version]) => `${name}: \`${version}\``).join("\n");

		const wsState = CONNECTION_STATE_LABELS[client.events.state] ?? "Unknown";

		let msg =
			`## AutoMod Stats\n` +
			`### Bot\n` +
			`User: \`${client.user?.username || "Unknown"}\` (\`${client.user?.id || "?"}\`)\n` +
			`Version: \`${pjson.version || "?"}\`\n` +
			`Uptime: \`${uptimeStr}\`\n` +
			`Environment: \`${process.env["NODE_ENV"] || "testing"}\`\n` +
			`### Cache\n` +
			`Servers: \`${client.servers.size()}\`\n` +
			`Channels: \`${client.channels.size()}\`\n` +
			`Users: \`${client.users.size()}\`\n` +
			`Members: \`${client.serverMembers.size()}\`\n` +
			`Messages: \`${client.messages.size()}\`\n` +
			`### Database\n` +
			`Server configs: \`${serverConfigCount}\`\n` +
			`Infractions: \`${infractionCount}\`\n` +
			`Tempbans: \`${tempbanCount}\`\n` +
			`Reaction roles: \`${reactionRoleCount}\`\n` +
			`### Connection\n` +
			`API Endpoint: \`${client.options.baseURL}\`\n` +
			`WS State: \`${wsState}\`\n` +
			`WS Ping: \`${client.events.ping() ?? "--"}ms\`\n` +
			`Message: \`${Math.round(Date.now() - now)}ms\`\n` +
			`### Dependencies\n` +
			`${depStr}\n` +
			`### Miscellaneous\n` +
			`Command count: \`${commands.length}\`\n` +
			`Owners (${formattedOwnerIDs.length}): ${formattedOwnerIDs.join(", ")}`;

		await message.reply(msg, false);
	},
} as SimpleCommand;
