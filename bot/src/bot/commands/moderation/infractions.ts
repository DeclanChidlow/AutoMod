import SimpleCommand from "../../../struct/commands/SimpleCommand";
import { dbs } from "../../..";
import Infraction from "automod/dist/types/antispam/Infraction";
import InfractionType from "automod/dist/types/antispam/InfractionType";
import { isModerator, NO_MANAGER_MSG, parseUserOrId, uploadFile } from "../../util";
import Day from "dayjs";
import RelativeTime from "dayjs/plugin/relativeTime";
import Xlsx from "xlsx";
import { fetchUsername } from "../../modules/mod_logs";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import CommandCategory from "../../../struct/commands/CommandCategory";

Day.extend(RelativeTime);

const formatInfraction = async (inf: Infraction) => {
	return (
		`#${inf._id}: ${getInfEmoji(inf)} \`${inf.reason}\` (${inf.type === InfractionType.Manual ? await fetchUsername(inf.createdBy!) : "System"})\n` +
		`\u200b \u200b \u200b \u200b \u200b ↳ ${Day(inf.date).fromNow()} (Infraction ID: \`${inf._id}\`)\n`
	);
};

const createCSVData = async (userId: string, infs: Infraction[]) => {
	const csv_data = [[`Warns for ${await fetchUsername(userId)} (${userId}) - ${Day().toString()}`], [], ["Date", "Reason", "Created By", "Type", "Action Type", "ID"]];

	for (const inf of infs) {
		csv_data.push([
			Day(inf.date).toString(),
			inf.reason,
			inf.type === InfractionType.Manual ? `${await fetchUsername(inf.createdBy!)} (${inf.createdBy})` : "SYSTEM",
			inf.type === InfractionType.Automatic ? "Automatic" : "Manual",
			inf.actionType || "warn",
			inf._id,
		]);
	}

	return Xlsx.utils.sheet_to_csv(Xlsx.utils.aoa_to_sheet(csv_data));
};

const getInfractionMessage = async (userId: string, infs: Infraction[], args: string[]) => {
	let msg = `## ${infs.length} infractions stored for ${await fetchUsername(userId)}\n`;
	let attachSpreadsheet = false;

	for (const [i, inf] of infs.entries()) {
		const toAdd = await formatInfraction(inf);

		if ((msg + toAdd).length > 1900 || i > 5) {
			msg += `\u200b\n[${infs.length - i} more, check attached file]`;
			attachSpreadsheet = true;
			break;
		} else {
			msg += toAdd;
		}
	}

	if (args[1]?.toLowerCase() === "export-csv" || args[1]?.toLowerCase() === "csv" || args[1]?.toLowerCase() === "export") {
		attachSpreadsheet = true;
	}

	if (attachSpreadsheet) {
		try {
			const csv = await createCSVData(userId, infs);
			return { content: msg, attachments: [await uploadFile(csv, `${userId}.csv`)] };
		} catch (e) {
			console.error(e);
			return { content: msg };
		}
	} else {
		return { content: msg };
	}
};

const getTopInfractionsMessage = async (userInfractions: Map<string, Infraction[]>, serverName: string) => {
	const sortedUsers = Array.from(userInfractions.entries())
		.sort(([, a], [, b]) => b.length - a.length)
		.slice(0, 9);

	if (sortedUsers.length === 0) {
		return `### No infractions in ${serverName}\nNo users have infractions recorded.`;
	}

	let msg = `### Users with the most infractions in ${serverName}\n`;

	for (const [user, infs] of sortedUsers) {
		const sortedInfractions = infs.sort((a, b) => b.date - a.date);
		msg += `**${await fetchUsername(user)}** (${user}): **${sortedInfractions.length}** infractions\n`;
		msg +=
			`\u200b \u200b \u200b \u200b \u200b ↳ Most recent infraction: ${getInfEmoji(sortedInfractions[0])}\`${sortedInfractions[0].reason}\` ` +
			`${sortedInfractions[0].type === InfractionType.Manual ? `(${await fetchUsername(sortedInfractions[0].createdBy ?? "")})` : ""}\n`;
	}

	return msg.substring(0, 1999);
};

function getInfEmoji(inf: Infraction) {
	switch (inf.actionType) {
		case "kick":
			return ":mans_shoe: ";
		case "ban":
			return ":hammer: ";
		default:
			return "";
	}
}

export default {
	name: "infractions",
	aliases: ["warnings", "infractions"],
	description: "Shows a user's previous warns.",
	syntax: '/infractions; /infractions @username ["export-csv"]; /infractions rm [ID]',
	category: CommandCategory.Moderation,
	run: async (message: MessageCommandContext, args: string[]) => {
		const { id: serverId, name: serverName } = message.serverContext;
		const { id: authorId } = message;

		if (!(await isModerator(message)) && !args[0]) {
			return message.reply(NO_MANAGER_MSG);
		}

		const infractions: Array<Infraction> = await dbs.INFRACTIONS.find({ server: serverId });
		const userInfractions: Map<string, Infraction[]> = new Map();

		infractions.forEach((inf) => {
			if (!userInfractions.has(inf.user)) {
				userInfractions.set(inf.user, [inf]);
			} else {
				userInfractions.get(inf.user)!.push(inf);
			}
		});

		if (!args[0]) {
			const msg = await getTopInfractionsMessage(userInfractions, serverName);
			await message.reply(msg);
		} else {
			switch (args[0]?.toLowerCase()) {
				case "delete":
				case "remove":
				case "rm":
				case "del":
					if (!(await isModerator(message))) return message.reply(NO_MANAGER_MSG);

					const id = args[1];
					if (!id) return message.reply("No infraction ID provided.");

					const inf = await dbs.INFRACTIONS.findOneAndDelete({
						_id: { $eq: id.toUpperCase() },
						server: serverId,
					});

					if (!inf) return message.reply("I can't find that ID.");

					await message.reply(
						`### Infraction deleted\n` +
							`ID: \`${inf._id}\`\n` +
							`Reason: ${getInfEmoji(inf)}\`${inf.reason}\` ` +
							`(${inf.type === InfractionType.Manual ? await fetchUsername(inf.createdBy ?? "") : "System"})\n` +
							`Created ${Day(inf.date).fromNow()}`,
					);
					break;

				default:
					const user = await parseUserOrId(args[0]);
					if (!user?.id) return message.reply("I can't find this user.");

					if (user.id !== authorId && !(await isModerator(message))) return message.reply(NO_MANAGER_MSG);

					const infs = userInfractions.get(user.id);

					if (!infs) {
						await message.reply(`There are no infractions stored for \`${await fetchUsername(user.id)}\`.`, false);
					} else {
						const { content, attachments } = await getInfractionMessage(user.id, infs, args);
						await message.reply({ content, attachments }, false);
					}
					break;
			}
		}
	},
} as SimpleCommand;
