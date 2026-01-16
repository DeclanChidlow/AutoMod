import AutomodClient, { login } from "./struct/AutomodClient";
import MongoDB, { databaseMigrations } from "./bot/db";
import DbUser from "automod-lib/dist/types/DbUser";
import ServerConfig from "automod-lib/dist/types/ServerConfig";
import Infraction from "automod-lib/dist/types/antispam/Infraction";
import PendingLogin from "automod-lib/dist/types/PendingLogin";
import TempBan from "automod-lib/dist/types/TempBan";

console.info("Initialising client");

process.on("uncaughtException", (err) => {
  if (
    err instanceof TypeError &&
    err.message.includes("policy_changes")
  ) {
    console.warn("Ignored Stoat policy_changes crash");
    return;
  }
  throw err;
});

let db = MongoDB();
let client = new AutomodClient(
	{
		autoReconnect: true,
		baseURL: process.env["STOAT_API_URL"] || "https://api.stoat.chat/0.8",
	},
	db,
);
login(client);

const dbs = {
	SERVERS: db.get<ServerConfig>("servers"),
	USERS: db.get<DbUser>("users"),
	INFRACTIONS: db.get<Infraction>("infractions"),
	PENDING_LOGINS: db.get<PendingLogin>("pending_logins"),
	SESSIONS: db.get("sessions"),
	TEMPBANS: db.get<TempBan>("tempbans"),
};

export { client, dbs };

console.info(`\
    _          _         __  __           _ 
   / \\   _   _| |_  ___ |  \\/  | ___   __| |
  / _ \\ | | | | __|/ _ \\| |\\/| |/ _ \\ / _\` |
 / ___ \\| |_| | |_| (_) | |  | | (_) | (_| |
/_/   \\_\\\\__,_|\\__|\\___/|_|  |_|\\___/ \\__,_|
`);

(async () => {
	// Wait for a database query to succeed before loading the rest
	console.info("Connecting to database...");
	await db.get("servers").findOne({});
	console.log("DB ready!");

	console.info("Running database migrations...");
	await databaseMigrations();

	// Load modules
	import("./bot/modules/command_handler");
	import("./bot/modules/mod_logs");
	import("./bot/modules/event_handler");
	import("./bot/modules/tempbans");
	import("./bot/modules/api_communication");
	import("./bot/modules/metrics");
	import("./bot/modules/bot_status");
	import("./bot/modules/fetch_all");
	import("./bot/modules/raid_detection");
})();
