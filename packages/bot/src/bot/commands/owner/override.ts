import SimpleCommand from "../../../struct/commands/SimpleCommand";
import CommandCategory from "../../../struct/commands/CommandCategory";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import { User } from "../../../stoat/index.js";

const sudoOverrides: { [key: string]: number | null } = {};

const isSudo = (user: User): boolean => {
	const entry = sudoOverrides[user.id];
	if (entry && entry > Date.now()) return true;
	if (entry !== undefined) delete sudoOverrides[user.id];
	return false;
};

const updateSudoTimeout = (user: User) => {
	sudoOverrides[user.id] = Date.now() + 1000 * 60 * 5;
};

export default {
	name: "override",
	aliases: ["sudo", "doas"],
	description: "Allows running any command regardless of the user's current permissions.",
	documentation: "/owner/override",
	restrict: "BOTOWNER",
	category: CommandCategory.Owner,
	run: async (message: MessageCommandContext, args: string[]) => {
		switch (args[0]?.toLowerCase()) {
			case "enable":
			case "on": {
				if (isSudo(message.author!)) return message.reply("You are already in override mode!");

				sudoOverrides[message.authorId!] = Date.now() + 1000 * 60 * 5;

				let msg =
					`## %emoji% Override enabled\n` +
					`You will now be able to run any command regardless of your server permissions.\n` +
					`This will automatically disable **5 minutes** after your last bot interaction. ` +
					`To disable now, run \`${message.prefix}override disable\`.`;

				const sentMsg = await message.reply(msg.replace("%emoji%", "🔒"), false);
				setTimeout(() => sentMsg?.edit({ content: msg.replace("%emoji%", "🔓") }).catch(() => {}), 200);

				break;
			}

			case "disable":
			case "off": {
				if (!isSudo(message.author!)) return message.reply("You currently not in sudo mode.");

				sudoOverrides[message.authorId!] = null;

				let msg = `## %emoji% Override disabled`;
				const sentMsg = await message.reply(msg.replace("%emoji%", "🔓"), false);
				setTimeout(() => sentMsg?.edit({ content: msg.replace("%emoji%", "🔒") }).catch(() => {}), 200);
				break;
			}

			case null:
			case undefined:
			case "": {
				let msg =
					`## Override mode\n` +
					`Override mode allows you to bypass all permission checks for a limited time. ` +
					`After activating, you will be able to run any command regardless of your server permissions.\n\n` +
					`To enable, run \`${message.prefix}override enable\`.\n` +
					`It will automatically be deactivated **5 minutes** after your last bot interaction.`;

				await message.reply(msg, false);
				break;
			}

			default:
				await message.reply("Override: Unknown subcommand");
		}
	},
} as SimpleCommand;

export { isSudo, updateSudoTimeout };
