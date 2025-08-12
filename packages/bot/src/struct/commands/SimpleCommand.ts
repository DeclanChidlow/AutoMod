import CommandCategory from "./CommandCategory";
import MessageCommandContext from "../MessageCommandContext";
import ServerConfig from "automod-lib/dist/types/ServerConfig";

/**
 * A basic command, consisting of basic attributes
 * and a single run() function.
 */
class SimpleCommand {
	// Primary name of the command.
	name: string;

	// An array of alternative command names.
	aliases: string[] | null;

	// The description is shown in /help.
	description: string | null;

	// The documentation on the website shown in /help.
	documentation: string | null;

	// The syntax is shown in /help.
	syntax?: string | null;

	// Restrict the command to bot owners.
	restrict?: "BOTOWNER" | null;

	// Unless explicitly set to false, the command handler will
	// remove empty args (e.g. double spaces).
	removeEmptyArgs?: boolean | null;

	// This is executed whenever the command is ran.
	run: (message: MessageCommandContext, args: string[], serverConfig?: ServerConfig | null) => Promise<any>;

	// The category the command belongs to, used for /help.
	category: CommandCategory;
}

export default SimpleCommand;
