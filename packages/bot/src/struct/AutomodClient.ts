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

let login = (client: Stoat.Client): Promise<void> =>
	new Promise((resolve, reject) => {
		console.info("Bot logging in...");
		let env = process.env;

		if (!env["BOT_TOKEN"]) {
			console.error("Environment variable 'BOT_TOKEN' not provided");
			return reject("No bot token provided");
		}

		client.loginBot(env["BOT_TOKEN"]);

		client.once("ready", () => {
			console.log(`Bot logged in as ${client.user?.username}!`);
			resolve();
		});
	});

export default AutomodClient;
export { login };
