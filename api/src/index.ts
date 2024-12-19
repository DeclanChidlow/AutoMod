import Express from "express";
import buildDBClient, { redis } from "./db";

const PORT = Number(process.env["API_PORT"] || 9000);
const SESSION_LIFETIME = 1000 * 60 * 60 * 24 * 7;

const db = buildDBClient();
const app = Express();

app.set("trust proxy", true);
app.use(Express.json());

export { app, db, PORT, SESSION_LIFETIME };

(async () => {
	await redis.connect();

	const promises = [
		import("./middlewares/log"),
		import("./middlewares/updateTokenExpiry"),
		import("./middlewares/cors"),
		import("./middlewares/ratelimit"),

		import("./routes/internal/ws"),
		import("./routes/root"),
		import("./routes/stats"),
		import("./routes/login"),
		import("./routes/dash/servers"),
		import("./routes/dash/server"),
		import("./routes/dash/server-automod"),
	];

	for (const p of promises) await p;

	console.log("All routes and middlewares loaded");
})();

import("./server");
