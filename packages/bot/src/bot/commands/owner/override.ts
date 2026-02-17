import SimpleCommand from "../../../struct/commands/SimpleCommand";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import CommandCategory from "../../../struct/commands/CommandCategory";
import { User } from "stoat.js";
import { DEFAULT_PREFIX } from "../../modules/command_handler";

const sudoOverrides: { [key: string]: number | null } = {};

const isSudo = (user: User): boolean => {
	return !!(sudoOverrides[user.id] && sudoOverrides[user.id]! > Date.now());
};

const updateSudoTimeout = (user: User) => {
	sudoOverrides[user.id] = Date.now() + 1000 * 60 * 5;
};

export default {
	name: "override",
	aliases: ["sudo", "doas"],
	description: "Allows running any command regardless of the user’s current permissions.",
	documentation: "/docs/automod/commands/owner/override",
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
					`To disable now, run \`${DEFAULT_PREFIX}override disable\`.`;

				const sentMsg = await message.reply(msg.replace("%emoji%", ":lock:"), false);
				setTimeout(() => sentMsg?.edit({ content: msg.replace("%emoji%", ":unlock:") }).catch(() => {}), 200);

				break;
			}

			case "disable":
			case "off": {
				if (!isSudo(message.author!)) return message.reply("You currently not in sudo mode.");

				sudoOverrides[message.authorId!] = null;

				let msg = `## %emoji% Override disabled`;
				const sentMsg = await message.reply(msg.replace("%emoji%", ":unlock:"), false);
				setTimeout(() => sentMsg?.edit({ content: msg.replace("%emoji%", ":lock:") }).catch(() => {}), 200);
				break;
			}

			case null:
			case undefined:
			case "": {
				let msg =
					`## Override mode\n` +
					`Override mode allows you to bypass all permission checks for a limited time. ` +
					`After activating, you will be able to run any command regardless of your server permissions.\n\n` +
					`To enable, run \`${DEFAULT_PREFIX}override enable\`.\n` +
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
