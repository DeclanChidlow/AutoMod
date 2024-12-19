import Monk, { ICollection, IMonkManager } from "monk";
import { dbs } from "..";

export default (): IMonkManager => {
	let dburl = getDBUrl();
	let db = Monk(dburl);
	return db;
};

// Checks if all required env vars were supplied, and returns the mongo db URL
function getDBUrl() {
	let env = process.env;
	if (env["DB_URL"]) return env["DB_URL"];

	if (!env["DB_HOST"]) {
		console.error(`Environment variable 'DB_HOST' not set, unable to connect to database`);
		console.error(`Specify either 'DB_URL' or 'DB_HOST', 'DB_USERNAME', 'DB_PASS' and 'DB_NAME'`);
		throw "Missing environment variables";
	}

	// mongodb://username:password@hostname:port/dbname
	let dburl = "mongodb://";
	if (env["DB_USERNAME"]) dburl += env["DB_USERNAME"];
	if (env["DB_PASS"]) dburl += `:${env["DB_PASS"]}`;
	dburl += `${process.env["DB_USERNAME"] ? "@" : ""}${env["DB_HOST"]}`; // DB_HOST is assumed to contain the port
	dburl += `/${env["DB_NAME"] ?? "automod"}`;

	return dburl;
}

async function databaseMigrations() {
	// prettier-ignore
	async function setIndexes(collection: ICollection, toIndex: string[]) {
        try {
            const indexes = await collection.indexes();
            for (const index of toIndex) {
                if (!Object.values(indexes).find(v => v[0][0] == index)) {
                    console.info(`Creating index ${index} on ${collection.name}`);
                    await collection.createIndex(index);
                }
            }
        } catch(e) {
            console.warn(`Failed to run migrations for ${collection.name}: ${e}`);
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
