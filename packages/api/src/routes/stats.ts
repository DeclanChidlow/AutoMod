import { app } from "..";
import type { Request, Response } from "express";
import { botReq } from "./internal/ws";

let SERVER_COUNT = 0;
let BOT_NAME = "AutoMod";
let BOT_ID = "";

const fetchStats = async () => {
	try {
		const res = await botReq("stats");
		if (!res.success) return console.warn(`Failed to fetch bot stats: ${res.statusCode} / ${res.error}`);
		if (res["servers"]) SERVER_COUNT = Number(res["servers"]);
		if (res["botName"]) BOT_NAME = String(res["botName"]);
		if (res["botId"]) BOT_ID = String(res["botId"]);
	} catch (e) {
		console.error(e);
	}
};

fetchStats();
setInterval(() => fetchStats(), 10000);

app.get("/stats", async (_req: Request, res: Response) => {
	res.send({
		servers: SERVER_COUNT,
		botName: BOT_NAME,
		botId: BOT_ID,
	});
});
