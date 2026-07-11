import * as Stoat from "../stoat/index.js";
import { Db } from "mongodb";
import type { ClientOptions } from "../stoat/index.js";

class AutomodClient extends Stoat.Client {
	db: Db;

	constructor(options: Partial<ClientOptions> | undefined, db: Db) {
		super(options);
		this.db = db;
	}
}

const LOGIN_TIMEOUT = 180_000; // 3 minutes. Due to it's gargantuan size AutoMod needs time to receive and process the Read
y payload
const LOGIN_WARN_AFTER = 30_000; // Log a warning if login hasn't completed after 30s
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

				const warnTimeout = setTimeout(() => {
					console.warn(`Login still in progress after ${LOGIN_WARN_AFTER / 1000}s — ` + `this is normal for large bots with many servers/channels. Waiting up to ${LOGIN_TIMEOUT / 1000}s total.`);
				}, LOGIN_WARN_AFTER);

				const cleanup = () => {
					clearTimeout(timeout);
					clearTimeout(warnTimeout);
					client.removeListener("ready", onReady);
					client.removeListener("error", onError);
					client.removeListener("connecting", onConnecting);
					client.removeListener("disconnected", onDisconnected);
					client.removeListener("connected", onConnected);
				};

				const onReady = () => {
					cleanup();
					resolve();
				};

				const onError = (err: Error) => {
					cleanup();
					reject(err);
				};

				const onConnecting = () => {
					console.info("  WebSocket state: connecting");
				};

				const onDisconnected = () => {
					console.info("  WebSocket state: disconnected");
				};

				const onConnected = () => {
					console.info("  WebSocket state: connected");
				};

				client.once("ready", onReady);
				client.once("error", onError);
				client.on("connecting", onConnecting);
				client.on("disconnected", onDisconnected);
				client.on("connected", onConnected);

				// loginBot fetches config then connects to WebSocket.
				// The WS URL is built directly from the API base URL host.
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
