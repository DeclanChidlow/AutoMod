/**
 * This handles communication with the API server.
 */

import ws from "ws";
import crypto from "crypto";
import { client as bot, dbs } from "../..";
import { EventEmitter } from "events";
import { parseUser } from "../util";
import PendingLogin from "automod-lib/dist/types/PendingLogin";
import { ulid } from "ulid";

const wsEvents = new EventEmitter();
const { API_WS_URL, API_WS_TOKEN } = process.env;
const wsQueue: { [key: string]: string }[] = [];
let client: ws | undefined = undefined;
let retryCount = 0;
const MAX_RETRIES = 10;
const INITIAL_RETRY_DELAY = 3000;

type WSResponse = { success: false; error: string; statusCode?: number } | { success: true; [key: string]: any };

if (!API_WS_URL || !API_WS_TOKEN) {
	console.error("$API_WS_URL or $API_WS_TOKEN not found. Please set these environment variables.");
} else {
	console.info(`$API_WS_URL and $API_WS_TOKEN set; Connecting to ${API_WS_URL}`);
	connect();
}

function connect() {
	if (client && client.readyState == ws.OPEN) client.close();
	client = new ws(API_WS_URL!, { headers: { authorization: API_WS_TOKEN! } });

	client.once("open", () => {
		console.info("WebSocket connected successfully");
		retryCount = 0;
		if (wsQueue.length > 0) {
			console.debug(`Attempting to send ${wsQueue.length} queued WS messages`);

			while (wsQueue.length > 0) {
				if (client?.readyState != ws.OPEN) break;
				const data = JSON.stringify(wsQueue.shift());
				console.debug(`[WS] [FROM QUEUE] [>] ${data}`);
				client.send(data);
			}
		}
	});

	client.once("close", () => {
		client = undefined;
		retryConnection();
	});

	client.once("error", (err: Error) => {
		client = undefined;
		console.error(`WebSocket error: ${err.message}`);
		retryConnection();
	});

	client.on("message", (msg: ws.Data) => {
		console.debug(`[WS] [<] ${msg.toString("utf8")}`);
		try {
			const jsonMsg = JSON.parse(msg.toString("utf8"));
			wsEvents.emit("message", jsonMsg);
			if (jsonMsg["nonce"] && jsonMsg["type"]) {
				const hasListeners = wsEvents.emit(`req:${jsonMsg.type}`, jsonMsg.data, (res: { [key: string]: any }) => {
					wsSend({ nonce: jsonMsg.nonce, type: `response:${jsonMsg.nonce}`, data: res });
				});
				if (!hasListeners) {
					wsSend({
						nonce: jsonMsg.nonce,
						type: `response:${jsonMsg.nonce}`,
						data: {
							success: false,
							error: "No event listeners available for event",
						},
					});
				}
			}
		} catch (e) {
			console.error(e);
		}
	});
}

function wsSend(data: { [key: string]: any }) {
	if (client && client.readyState == client.OPEN) {
		console.debug(`[WS] [>] ${JSON.stringify(data)}`);
		client.send(JSON.stringify(data));
	} else {
		console.debug(`[WS] [QUEUED] [>] ${JSON.stringify(data)}`);
		wsQueue.push(data);
	}
}

function retryConnection() {
	if (retryCount >= MAX_RETRIES) {
		console.error(`Failed to connect after ${MAX_RETRIES} attempts. Please check your network and API_WS_URL.`);
		return;
	}

	const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
	retryCount++;

	console.warn(`WebSocket disconnected. Attempting to reconnect in ${delay / 1000} seconds (Attempt ${retryCount} of ${MAX_RETRIES})`);
	setTimeout(connect, delay);
}

wsEvents.on("req:test", (data: any, res: (data: any) => void) => {
	res({ received: data });
});

wsEvents.on("req:requestLogin", async (data: any, cb: (data: WSResponse) => void) => {
	try {
		const user = await parseUser(data.user);
		if (!user) return cb({ success: false, statusCode: 404, error: `The specified user could not be found` });

		let code: string | null = null;
		while (!code) {
			const c = crypto.randomBytes(8).toString("hex");
			const found = await dbs.PENDING_LOGINS.find({ code: c, user: user.id, confirmed: false }).toArray();
			if (found.length > 0) continue;
			code = c.substring(0, 8).toUpperCase();
		}

		console.info(`Attempted login for user ${user.id} with code ${code}`);

		const nonce = ulid();

		const [previousLogins, currentValidLogins] = await Promise.all([
			dbs.PENDING_LOGINS.find({ user: user.id, confirmed: true }).toArray(),
			dbs.PENDING_LOGINS.find({ user: user.id, confirmed: false, expires: { $gt: Date.now() } }).toArray(),
		]);

		if (currentValidLogins.length >= 5) return cb({ success: false, statusCode: 403, error: "Too many pending logins. Try again later." });

		await dbs.PENDING_LOGINS.insertOne({
			code,
			expires: Date.now() + 1000 * 60 * 15, // Expires in 15 minutes
			user: user.id,
			nonce: nonce,
			confirmed: false,
			requirePhishingConfirmation: previousLogins.length == 0,
			exchanged: false,
			invalid: false,
		} as PendingLogin);

		cb({ success: true, uid: user.id, nonce, code });
	} catch (e) {
		console.error(e);
		cb({ success: false, error: `${e}` });
	}
});

wsEvents.on("req:stats", async (_data: any, cb: (data: { servers: number }) => void) => {
	const servers = bot.servers.size();
	cb({ servers });
});

export { wsEvents, wsSend };
export type { WSResponse };

import("./api/servers");
import("./api/server_details");
import("./api/users");
