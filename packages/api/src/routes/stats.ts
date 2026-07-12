import { app } from "..";
import type { Response } from "express";
import { botReq } from "./internal/ws";

let SERVER_COUNT = 0;

const fetchStats = async () => {
	try {
		const res = await botReq("stats");
		if (!res.success) return console.warn(`Failed to fetch bot stats: ${res.statusCode} / ${res.error}`);
		if (res["servers"]) SERVER_COUNT = Number(res["servers"]);
	} catch (e) {
		console.error(e);
	}
};

fetchStats();
setInterval(() => fetchStats(), 10000);

app.get("/stats", async (res: Response) => {
	res.send({
		servers: SERVER_COUNT,
	});
});
