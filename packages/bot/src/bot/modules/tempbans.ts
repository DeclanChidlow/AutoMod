import { client, dbs } from "../..";
import TempBan from "automod-lib/dist/types/TempBan";

// Ban IDs currently scheduled for processing (prevents double-scheduling)
let dontProcess: Set<string> = new Set();
let expired: Set<string> = new Set();
const MAX_TRACKED = 10_000;

// Periodically prune tracking sets to prevent unbounded growth
setInterval(() => {
	if (dontProcess.size > MAX_TRACKED) {
		const entries = [...dontProcess];
		dontProcess = new Set(entries.slice(entries.length - MAX_TRACKED));
	}
	if (expired.size > MAX_TRACKED) {
		const entries = [...expired];
		expired = new Set(entries.slice(entries.length - MAX_TRACKED));
	}
}, 600_000);

async function tick() {
	let found = await dbs.TEMPBANS.find({ until: { $lt: Date.now() + 60000 } }).toArray();

	for (const ban of found) {
		if (!dontProcess.has(ban.id)) {
			const delay = Math.max(0, ban.until - Date.now());
			setTimeout(() => processUnban(ban), delay);

			if (dontProcess.size < MAX_TRACKED) dontProcess.add(ban.id);
		}
	}
}

new Promise((r: (value: void) => void) => {
	if (client.user) r();
	else client.once("ready", r);
}).then(() => {
	tick();
	setInterval(tick, 60000);
});

async function processUnban(ban: TempBan) {
	try {
		if (expired.has(ban.id)) return;

		let server = client.servers.get(ban.server) || (await client.servers.fetch(ban.server));
		if (!server.havePermission("BanMembers")) return console.debug(`No permission to process unbans in ${server.id}, skipping`);
		let serverBans = await server.fetchBans();

		if (serverBans.find((b) => b.id.user == ban.bannedUser)) {
			console.debug(`Unbanning user ${ban.bannedUser} from ${server.id}`);

			let promises = [server.unbanUser(ban.bannedUser), dbs.TEMPBANS.deleteOne({ id: ban.id })];

			await Promise.allSettled(promises);
		} else dbs.TEMPBANS.deleteOne({ id: ban.id });
		dontProcess.delete(ban.id);
	} catch (e) {
		console.error(e);
	}
}

async function storeTempBan(ban: TempBan): Promise<void> {
	if (Date.now() >= ban.until - 60000) {
		if (dontProcess.size < MAX_TRACKED) dontProcess.add(ban.id);
		const delay = Math.max(0, ban.until - Date.now());
		setTimeout(() => {
			processUnban(ban);
			dontProcess.delete(ban.id);
		}, delay);
	}

	await dbs.TEMPBANS.insertOne(ban);
}

async function removeTempBan(banID: string): Promise<TempBan> {
	let ban = await dbs.TEMPBANS.findOneAndDelete({ id: banID });
	if (!ban) throw `Ban ${banID} does not exist; cannot delete`;
	if (Date.now() >= ban.until - 120000) {
		if (expired.size < MAX_TRACKED) expired.add(ban.id);
	}
	return ban;
}

export { storeTempBan, removeTempBan };
