import { app } from "..";
import type { Request, Response } from "express";
import { botReq } from "./internal/ws";

let SERVER_COUNT = 0;
let BOT_NAME = "AutoMod";
let BOT_ID = "";
let USER_COUNT = 0;
let INFRACTION_COUNT = 0;
let BOT_UPTIME = 0;
let BOT_PING: number | null = null;

const fetchStats = async () => {
	try {
		const res = await botReq("stats");
		if (!res.success) return console.warn(`Failed to fetch bot stats: ${res.statusCode} / ${res.error}`);
		if (res["servers"]) SERVER_COUNT = Number(res["servers"]);
		if (res["botName"]) BOT_NAME = String(res["botName"]);
		if (res["botId"]) BOT_ID = String(res["botId"]);
		if (res["users"]) USER_COUNT = Number(res["users"]);
		if (res["infractions"]) INFRACTION_COUNT = Number(res["infractions"]);
		if (res["uptime"] !== undefined) BOT_UPTIME = Number(res["uptime"]);
		if (res["ping"] !== undefined) BOT_PING = res["ping"] as number | null;
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
		users: USER_COUNT,
		infractions: INFRACTION_COUNT,
		uptime: BOT_UPTIME,
		ping: BOT_PING,
	});
});
