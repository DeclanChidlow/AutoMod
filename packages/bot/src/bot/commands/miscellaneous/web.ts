import { dbs } from "../../..";
import CommandCategory from "../../../struct/commands/CommandCategory";
import SimpleCommand from "../../../struct/commands/SimpleCommand";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import PendingLogin from "automod-lib/dist/types/PendingLogin";
import { DEFAULT_PREFIX } from "../../modules/command_handler";
import { WithId } from "mongodb";

export default {
	name: "web",
	aliases: null,
	description: "Allows you to log in and out of the web dashboard.",
	documentation: "/docs/commands/miscellaneous/web",
	category: CommandCategory.Miscellaneous,
	run: async (message: MessageCommandContext, args: string[]) => {
		const subcommand = args.shift()?.toLowerCase();

		if (!subcommand || (subcommand !== "login" && subcommand !== "logout")) {
			return message.reply(`Usage: \`${DEFAULT_PREFIX}web login [Code]\` or \`${DEFAULT_PREFIX}web logout [Code/ALL]\``);
		}

		if (subcommand === "login") {
			await handleLogin(message, args);
		} else if (subcommand === "logout") {
			await handleLogout(message, args);
		}
	},
} as SimpleCommand;

async function handleLogin(message: MessageCommandContext, args: string[]) {
	try {
		const code = args.shift();
		if (!code) {
			return message.reply(
				`If you're trying to log in, you can access the dashboard ` +
					`[here](${process.env["WEB_UI_URL"] || "https://automod.vale.rocks"}).\n\n` +
					`If you already have a code, you can use \`${DEFAULT_PREFIX}web login [Code]\`.`,
			);
		}

		const login: WithId<PendingLogin> | null = await dbs.PENDING_LOGINS.findOne({
			code,
			user: message.authorId,
			confirmed: false,
			exchanged: false,
			invalid: false,
			expires: {
				$gt: Date.now(),
			},
		});

		if (!login) return message.reply(`Unknown code. Make sure you're logged into the correct account.`);

		if (login.requirePhishingConfirmation) {
			console.info(`Showing phishing warning to ${message.authorId}`);
			await Promise.all([
				message.reply(
					`# If someone told you to run this, stop!\n` +
						`This could give an attacker access to all servers you're using AutoMod in.\n` +
						`If someone else told you to run this command, **block them and ignore this.**\n\n` +
						`Otherwise, if this was you trying to log in from <${process.env["WEB_UI_URL"] || "https://automod.vale.rocks"}>, \n` +
						`you can run this command again to continue.\n` +
						`##### You're seeing this because this is the first time you're trying to log in. Stay safe!`,
				),
				dbs.PENDING_LOGINS.updateOne({ _id: login._id }, { $set: { requirePhishingConfirmation: false } }),
			]);
			return;
		}

		await Promise.all([
			message.reply(`Successfully logged in.\n\n` + `If this wasn't you, run \`${DEFAULT_PREFIX}web logout ${code}\` immediately.`),
			dbs.PENDING_LOGINS.updateOne({ _id: login._id }, { $set: { confirmed: true } }),
		]);
	} catch (e) {
		console.error(e);
		message.reply(`An error occurred: ${e}`);
	}
}

async function handleLogout(message: MessageCommandContext, args: string[]) {
	try {
		const code = args.shift();
		if (!code) {
			return message.reply(
				`### No code provided.\n` + `You can invalidate a session by using \`${DEFAULT_PREFIX}web logout [Code]\`, ` + `or log out everywhere with \`${DEFAULT_PREFIX}web logout ALL\``,
			);
		}

		if (code.toLowerCase() === "all") {
			const [resA, resB] = await Promise.all([
				dbs.PENDING_LOGINS.updateMany({ user: message.authorId, invalid: false }, { $set: { invalid: true } }),
				dbs.SESSIONS.updateMany({ user: message.authorId, invalid: false }, { $set: { invalid: true } }),
			]);

			if (resA.modifiedCount === 0 && resB.modifiedCount === 0) return message.reply("There are no sessions to invalidate.");

			message.reply(`Successfully invalidated ${resA.modifiedCount} codes and ${resB.modifiedCount} sessions.`);
		} else {
			const loginAttempt = await dbs.PENDING_LOGINS.findOne({
				code: code.toUpperCase(),
				user: message.authorId,
			});

			if (!loginAttempt || loginAttempt.invalid) {
				return message.reply("That code doesn't seem to exist.");
			}

			await dbs.PENDING_LOGINS.updateOne({ _id: loginAttempt._id }, { $set: { invalid: true } });

			if (loginAttempt.exchanged) {
				const session = await dbs.SESSIONS.findOne({ nonce: (loginAttempt as any).nonce });
				if (session) {
					await dbs.SESSIONS.updateOne({ _id: session._id }, { $set: { invalid: true } });
					return message.reply(`Successfully invalidated code and terminated associated session.`);
				}
			}
			message.reply(`Successfully invalidated code.`);
		}
	} catch (e) {
		console.error(e);
		message.reply(`An error occurred: ${e}`);
	}
}
