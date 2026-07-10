import * as Stoat from "stoat.js";
import { Db } from "mongodb";
import type { ClientOptions } from "stoat.js";

class AutomodClient extends Stoat.Client {
	db: Db;

	constructor(options: Partial<ClientOptions> | undefined, db: Db) {
		super(options);
		this.db = db;
	}
}

const LOGIN_TIMEOUT = 30_000; // 30 seconds

let login = (client: Stoat.Client): Promise<void> =>
	new Promise((resolve, reject) => {
		console.info("Bot logging in...");
		let env = process.env;

		if (!env["BOT_TOKEN"]) {
			console.error("Environment variable 'BOT_TOKEN' not provided");
			return reject("No bot token provided");
		}

		const apiUrl = env["STOAT_API_URL"] || "https://api.stoat.chat/0.8";
		console.info(`Connecting to Stoat API at ${apiUrl}`);

		const timeout = setTimeout(() => {
			reject(`Login timed out after ${LOGIN_TIMEOUT / 1000}s — could not reach Stoat API at ${apiUrl}`);
		}, LOGIN_TIMEOUT);

		const onReady = () => {
			clearTimeout(timeout);
			client.removeListener("error", onError);
			console.log(`Bot logged in as ${client.user?.username}!`);
			resolve();
		};

		const onError = (err: Error) => {
			clearTimeout(timeout);
			client.removeListener("ready", onReady);
			console.error(`Login failed: ${err.message}`);
			reject(err);
		};

		client.once("ready", onReady);
		client.once("error", onError);

		client.loginBot(env["BOT_TOKEN"]);
	});

export default AutomodClient;
export { login };
