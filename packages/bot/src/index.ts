import AutomodClient, { login } from "./struct/AutomodClient";
import MongoDB, { databaseMigrations } from "./bot/db";
import DbUser from "automod-lib/dist/types/DbUser";
import ServerConfig from "automod-lib/dist/types/ServerConfig";
import Infraction from "automod-lib/dist/types/antispam/Infraction";
import PendingLogin from "automod-lib/dist/types/PendingLogin";
import TempBan from "automod-lib/dist/types/TempBan";
import ReactionRoles from "automod-lib/dist/types/ReactionRoles";
import { Collection } from "mongodb";

process.on("unhandledRejection", (reason, _promise) => {
	console.error("Unhandled promise rejection:", reason);
	// Let the process exit so Docker restarts it — an unhandled rejection leaves
	// the process in an undefined state. Node 15+ exits anyway; be explicit.
	process.exitCode = 1;
});

process.on("uncaughtException", (error) => {
	console.error("Uncaught exception:", error);
	process.exit(1);
});

console.info("Initialising client");

let client: AutomodClient;
let dbs: {
	SERVERS: Collection<ServerConfig>;
	USERS: Collection<DbUser>;
	INFRACTIONS: Collection<Infraction>;
	PENDING_LOGINS: Collection<PendingLogin>;
	SESSIONS: Collection<any>;
	TEMPBANS: Collection<TempBan>;
	REACTION_ROLES: Collection<ReactionRoles>;
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
			REACTION_ROLES: db.collection<ReactionRoles>("reaction_roles"),
		};

		const clientOptions: Partial<import("./stoat/index.js").ClientOptions> = {
			autoReconnect: true,
		};

		const apiUrl = process.env["STOAT_API_URL"];
		if (apiUrl) {
			clientOptions.baseURL = apiUrl;
		}

		client = new AutomodClient(clientOptions, db);

		console.info("Running database migrations...");
		await databaseMigrations();

		await login(client);

		await Promise.all([
			import("./bot/modules/command_handler"),
			import("./bot/modules/mod_logs"),
			import("./bot/modules/event_handler"),
			import("./bot/modules/tempbans"),
			import("./bot/modules/reaction_roles"),
			import("./bot/modules/api_communication"),
			import("./bot/modules/metrics"),
			import("./bot/modules/bot_status"),
			import("./bot/modules/fetch_all"),
			import("./bot/modules/raid_detection"),
		]);
	} catch (error) {
		console.error("Failed to start application:", error);
		process.exit(1);
	}
})();
