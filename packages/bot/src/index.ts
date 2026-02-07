import AutomodClient, { login } from "./struct/AutomodClient";
import MongoDB, { databaseMigrations } from "./bot/db";
import DbUser from "automod-lib/dist/types/DbUser";
import ServerConfig from "automod-lib/dist/types/ServerConfig";
import Infraction from "automod-lib/dist/types/antispam/Infraction";
import PendingLogin from "automod-lib/dist/types/PendingLogin";
import TempBan from "automod-lib/dist/types/TempBan";
import { Collection } from "mongodb";

console.info("Initialising client");

let client: AutomodClient;
let dbs: {
	SERVERS: Collection<ServerConfig>;
	USERS: Collection<DbUser>;
	INFRACTIONS: Collection<Infraction>;
	PENDING_LOGINS: Collection<PendingLogin>;
	SESSIONS: Collection<any>;
	TEMPBANS: Collection<TempBan>;
};

export { client, dbs };

console.info(`\
    _          _          __  __           _
   / \\   _   _| |_  ___ |  \\/  | ___   __| |
  / _ \\ | | | | __|/ _ \\| |\\/| |/ _ \\ / _\` |
 / ___ \\| |_| | |_| (_) | |  | | (_) | (_| |
/_/   \\_\\\\__,_|\\__|\\___/|_|  |_|\\___/ \\__,_|
`);

(async () => {
	try {
		console.info("Connecting to database...");
		const db = await MongoDB();
		console.log("DB ready!");

		dbs = {
			SERVERS: db.collection<ServerConfig>("servers"),
			USERS: db.collection<DbUser>("users"),
			INFRACTIONS: db.collection<Infraction>("infractions"),
			PENDING_LOGINS: db.collection<PendingLogin>("pending_logins"),
			SESSIONS: db.collection("sessions"),
			TEMPBANS: db.collection<TempBan>("tempbans"),
		};

		client = new AutomodClient(
			{
				autoReconnect: true,
				baseURL: process.env["STOAT_API_URL"] || "https://api.stoat.chat/0.8",
				heartbeatInterval: 60000,
			},
			db,
		);

		console.info("Running database migrations...");
		await databaseMigrations();

		await login(client);

		await import("./bot/modules/command_handler");
		await import("./bot/modules/mod_logs");
		await import("./bot/modules/event_handler");
		await import("./bot/modules/tempbans");
		await import("./bot/modules/api_communication");
		await import("./bot/modules/metrics");
		await import("./bot/modules/bot_status");
		await import("./bot/modules/fetch_all");
		await import("./bot/modules/raid_detection");
	} catch (error) {
		console.error("Failed to start application:", error);
		process.exit(1);
	}
})();
