import { MongoClient, Db, Collection } from "mongodb";
import { dbs } from "..";

let client: MongoClient;
let dbInstance: Db;

const MAX_RETRIES = 5;
const RETRY_BASE_MS = 2000;

export default async (): Promise<Db> => {
	if (dbInstance) return dbInstance;

	process.env["MONGODB_LOG_ALL"] ??= "off";

	const dburl = getDBUrl();

	for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
		try {
			client = new MongoClient(dburl, {
				maxPoolSize: 20,
				minPoolSize: 2,
				connectTimeoutMS: 10_000,
				serverSelectionTimeoutMS: 10_000,
			});
			await client.connect();

			const dbName = dburl.split("/").pop()?.split("?")[0] || "automod";
			dbInstance = client.db(dbName);
			return dbInstance;
		} catch (err) {
			console.error(`DB connection attempt ${attempt}/${MAX_RETRIES} failed: ${err}`);
			if (attempt < MAX_RETRIES) {
				const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1);
				await new Promise((r) => setTimeout(r, delay));
			}
		}
	}

	throw new Error(`Failed to connect to database after ${MAX_RETRIES} attempts`);
};

function getDBUrl() {
	let env = process.env;
	if (env["DB_URL"]) return env["DB_URL"];

	if (!env["DB_HOST"]) {
		console.error(`Environment variable 'DB_HOST' not set, unable to connect to database`);
		console.error(`Specify either 'DB_URL' or 'DB_HOST', 'DB_USERNAME', 'DB_PASS' and 'DB_NAME'`);
		throw "Missing environment variables";
	}

	let dburl = "mongodb://";
	if (env["DB_USERNAME"]) dburl += env["DB_USERNAME"];
	if (env["DB_PASS"]) dburl += `:${env["DB_PASS"]}`;
	dburl += `${process.env["DB_USERNAME"] ? "@" : ""}${env["DB_HOST"]}`;
	dburl += `/${env["DB_NAME"] ?? "automod"}`;

	return dburl;
}

async function databaseMigrations() {
	async function setIndexes(collection: Collection<any>, toIndex: string[]) {
		try {
			if (!collection) return;
			for (const index of toIndex) {
				console.info(`Ensuring index ${index} on ${collection.collectionName}`);
				await collection.createIndex({ [index]: 1 });
			}
		} catch (e) {
			console.warn(`Failed to run migrations: ${e}`);
		}
	}

	await setIndexes(dbs.INFRACTIONS, ["createdBy", "user", "server"]);
	await setIndexes(dbs.PENDING_LOGINS, ["code", "user"]);
	await setIndexes(dbs.SERVERS, ["id"]);
	await setIndexes(dbs.SESSIONS, ["user", "token"]);
	await setIndexes(dbs.TEMPBANS, ["id", "until"]);
	await setIndexes(dbs.USERS, ["id"]);
	await setIndexes(dbs.REACTION_ROLES, ["server", "messageId"]);
}

export { databaseMigrations };
