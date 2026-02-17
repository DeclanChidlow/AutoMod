import SimpleCommand from "../../../struct/commands/SimpleCommand";
import { dbs } from "../../..";
import Infraction from "automod-lib/dist/types/antispam/Infraction";
import InfractionType from "automod-lib/dist/types/antispam/InfractionType";
import { isModerator, NO_MANAGER_MSG, parseUserOrId, getDmChannel, embed, EmbedColor } from "../../util";
import Day from "dayjs";
import RelativeTime from "dayjs/plugin/relativeTime";
import Xlsx from "xlsx";
import { fetchUsername } from "../../modules/mod_logs";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import CommandCategory from "../../../struct/commands/CommandCategory";
import axios from "axios";
import FormData from "form-data";
import { client } from "../../..";

Day.extend(RelativeTime);

const formatInfraction = async (inf: Infraction) => {
	const timestamp = Math.floor(inf.date / 1000);
	return `- ${getInfEmoji(inf)} ID: \`${inf._id}\` — ${inf.reason} (<t:${timestamp}:f> by ${inf.type === InfractionType.Manual ? await fetchUsername(inf.createdBy!) : "System"})\n`;
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

const uploadCsvFile = async (csvData: string, filename: string) => {
	try {
		const formData = new FormData();
		const fileBuffer = Buffer.from(csvData, "utf-8");
		formData.append("file", fileBuffer, {
			filename: filename,
			contentType: "text/csv",
		});

		const uploadResponse = await axios.post(`${client.configuration?.features.autumn.url}/attachments`, formData, {
			headers: {
				...formData.getHeaders(),
				"x-bot-token": process.env["BOT_TOKEN"]!,
			},
			timeout: 10000,
		});

		if (uploadResponse.data && uploadResponse.data.id) {
			return uploadResponse.data.id;
		} else {
			throw new Error("Invalid response from attachment service");
		}
	} catch (error) {
		console.error("Failed to upload CSV file:", error);
		throw error;
	}
};

const sendCsvFallback = async (authorId: string, csvData: string, username: string, serverName: string) => {
	try {
		const channel = await getDmChannel(authorId);

		if (csvData.length > 1900) {
			const chunks = [];
			const lines = csvData.split("\n");
			let currentChunk = "";

			for (const line of lines) {
				if ((currentChunk + line + "\n").length > 1900) {
					if (currentChunk) chunks.push(currentChunk);
					currentChunk = line + "\n";
				} else {
					currentChunk += line + "\n";
				}
			}
			if (currentChunk) chunks.push(currentChunk);

			await channel.sendMessage({
				embeds: [embed(`Here are the infractions for **${username}** from **${serverName}** (sent as multiple messages due to length):`, "Infractions Export", EmbedColor.Success)],
			});

			for (let i = 0; i < chunks.length; i++) {
				await channel.sendMessage({
					content: `**Part ${i + 1}/${chunks.length}:**\n\`\`\`csv\n${chunks[i]}\n\`\`\``,
				});
			}
		} else {
			await channel.sendMessage({
				embeds: [embed(`Here are the infractions for **${username}** from **${serverName}**:\n\n\`\`\`csv\n${csvData}\n\`\`\``, "Infractions Export", EmbedColor.Success)],
			});
		}
	} catch (dmError) {
		console.error("Failed to send fallback DM:", dmError);
		throw dmError;
	}
};

const getInfractionMessage = async (userId: string, infs: Infraction[], args: string[], message: MessageCommandContext) => {
	const username = await fetchUsername(userId);
	let msg = `### Infractions for ${username} (${infs.length} total):\n`;
	let attachSpreadsheet = false;

	for (let i = infs.length - 1; i >= 0; i--) {
		const inf = infs[i];
		const toAdd = await formatInfraction(inf);

		if ((msg + toAdd).length > 1900) {
			msg += `[${i + 1} more infractions. Consult the attached file]`;
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
			const filename = `infractions_${userId}_${Date.now()}.csv`;

			try {
				const attachmentId = await uploadCsvFile(csv, filename);
				return { content: msg, attachments: [attachmentId] };
			} catch (uploadError) {
				try {
					await sendCsvFallback(message.authorId!, csv, username, message.channel?.server?.name || "Unknown Server");
					return {
						content: msg + `\n\n*File upload failed, but I've sent the infractions data to your direct messages.*`,
					};
				} catch (dmError) {
					console.error("Both upload and DM fallback failed:", dmError);
					return {
						content: msg + `\n\n*Failed to attach CSV file. Unable to upload file or send DM. Please check that DMs are enabled and try again later.*`,
					};
				}
			}
		} catch (e) {
			console.error("Failed to create CSV data:", e);
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

	let index = 1;
	for (const [user, infs] of sortedUsers) {
		const sortedInfractions = infs.sort((a, b) => b.date - a.date);
		const count = sortedInfractions.length;
		msg += `${index++}. **${await fetchUsername(user)}** (\`${user}\`) — **${count}** infraction${count !== 1 ? "s" : ""}\n`;
	}

	return msg.substring(0, 1999);
};

function getInfEmoji(inf: Infraction) {
	switch (inf.actionType) {
		case "kick":
			return "🥾 ";
		case "ban":
			return "🔨 ";
		default:
			return "⚠️ ";
	}
}

export default {
	name: "infractions",
	aliases: ["warns", "warnings"],
	description: "Shows a user's infractions.",
	documentation: "/docs/automod/commands/moderation/infractions",
	syntax: '/infractions; /infractions @username ["export-csv"]; /infractions rm [ID]',
	category: CommandCategory.Moderation,
	run: async (message: MessageCommandContext, args: string[]) => {
		const { id: serverId, name: serverName } = message.serverContext;
		const { id: authorId } = message;

		if (!(await isModerator(message)) && !args[0]) {
			return message.reply(NO_MANAGER_MSG);
		}

		const infractions: Array<Infraction> = await dbs.INFRACTIONS.find({ server: serverId }).toArray();
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
				case "undo":
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
						const { content, attachments } = await getInfractionMessage(user.id, infs, args, message);
						await message.reply({ content, attachments }, false);
					}
					break;
			}
		}
	},
} as SimpleCommand;
