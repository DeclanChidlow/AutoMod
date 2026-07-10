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

const LOGIN_TIMEOUT = 15_000; // 15 seconds per attempt
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_BACKOFF_BASE = 2000; // 2s base delay, doubles each attempt

async function login(client: Stoat.Client): Promise<void> {
	const token = process.env["BOT_TOKEN"];
	if (!token) {
		throw new Error("Environment variable 'BOT_TOKEN' not provided");
	}

	const apiUrl = process.env["STOAT_API_URL"] || "https://api.stoat.chat/0.8";

	for (let attempt = 1; attempt <= LOGIN_MAX_ATTEMPTS; attempt++) {
		console.info(`Login attempt ${attempt}/${LOGIN_MAX_ATTEMPTS} — connecting to ${apiUrl}`);

		let onReady: () => void;
		let onError: (err: Error) => void;
		let timeout: ReturnType<typeof setTimeout>;

		try {
			await new Promise<void>((resolve, reject) => {
				timeout = setTimeout(() => {
					reject(new Error(`Login timed out after ${LOGIN_TIMEOUT / 1000}s`));
				}, LOGIN_TIMEOUT);

				onReady = () => {
					clearTimeout(timeout);
					client.removeListener("error", onError);
					resolve();
				};

				onError = (err: Error) => {
					clearTimeout(timeout);
					client.removeListener("ready", onReady);
					reject(err);
				};

				client.once("ready", onReady);
				client.once("error", onError);

				client.loginBot(token);
			});

			console.log(`Bot logged in as ${client.user?.username}!`);
			return;
		} catch (err: any) {
			clearTimeout(timeout!);
			client.removeListener("ready", onReady!);
			client.removeListener("error", onError!);

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
