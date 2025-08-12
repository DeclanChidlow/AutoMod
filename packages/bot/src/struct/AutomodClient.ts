import * as Revolt from "revolt.js";
import { IMonkManager } from "monk";
import type { ClientOptions } from "revolt.js";

class AutomodClient extends Revolt.Client {
	db: IMonkManager;

	constructor(options: Partial<ClientOptions> | undefined, monk: IMonkManager) {
		super(options);

		this.db = monk;
	}
}

let login = (client: Revolt.Client): Promise<void> =>
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
