import { MongoClient, Db, Collection } from "mongodb";
import { dbs } from "..";

let client: MongoClient;
let dbInstance: Db;

export default async (): Promise<Db> => {
	if (dbInstance) return dbInstance;

	const dburl = getDBUrl();
	client = new MongoClient(dburl);

	await client.connect();
	const dbName = dburl.split("/").pop()?.split("?")[0] || "automod";
	dbInstance = client.db(dbName);

	return dbInstance;
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
	// Ensure the DB is connected before running migrations
	if (!dbInstance) await module.exports.default();

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
}

export { databaseMigrations };
