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

const LOGIN_TIMEOUT = 30_000; // 30 seconds per attempt
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_BACKOFF_BASE = 2000; // 2s base delay, doubles each attempt

async function login(client: Stoat.Client): Promise<void> {
	const token = process.env["BOT_TOKEN"];
	if (!token) {
		throw new Error("Environment variable 'BOT_TOKEN' not provided");
	}

	const apiUrl = client.options.baseURL || process.env["STOAT_API_URL"] || "https://stoat.chat/api";
	console.info(`Connecting to Stoat API at ${apiUrl}`);

	for (let attempt = 1; attempt <= LOGIN_MAX_ATTEMPTS; attempt++) {
		console.info(`Login attempt ${attempt}/${LOGIN_MAX_ATTEMPTS}`);

		try {
			await new Promise<void>((resolve, reject) => {
				const timeout = setTimeout(() => {
					reject(new Error(`Login timed out after ${LOGIN_TIMEOUT / 1000}s`));
				}, LOGIN_TIMEOUT);

				const cleanup = () => {
					clearTimeout(timeout);
					client.removeListener("ready", onReady);
					client.removeListener("error", onError);
				};

				const onReady = () => {
					cleanup();
					resolve();
				};

				const onError = (err: Error) => {
					cleanup();
					reject(err);
				};

				client.once("ready", onReady);
				client.once("error", onError);

				// loginBot fetches config then calls connect() — if the config fetch fails, loginBot rejects and we must catch that directly.
				client.loginBot(token).catch((err) => {
					cleanup();
					reject(err);
				});
			});

			console.log(`Bot logged in as ${client.user?.username}!`);
			return;
		} catch (err: any) {
			console.error(`Login attempt ${attempt} failed: ${err.message}`);

			if (attempt < LOGIN_MAX_ATTEMPTS) {
				const delay = LOGIN_BACKOFF_BASE * Math.pow(2, attempt - 1);
				console.info(`Retrying in ${delay / 1000}s...`);
				await new Promise((r) => setTimeout(r, delay));
			}
		}
	}

	throw new Error(`Login failed after ${LOGIN_MAX_ATTEMPTS} attempts`);
}

export default AutomodClient;
export { login };
