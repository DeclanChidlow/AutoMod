import { app } from "../..";
import type { Request, Response } from "express";
import { isAuthenticated, requireAuth } from "../../utils";
import { botReq } from "../internal/ws";
import { redis } from "../../db";

type Server = {
	id: string;
	perms: 0 | 1 | 2 | 3;
	name: string;
	iconURL?: string;
	bannerURL?: string;
	channelCount: number;
	ownerName?: string;
	createdAt: number;
	roleCount: number;
};

const CACHE_TTL_SECONDS = 15;

app.get("/dash/servers", requireAuth({ requireLogin: true }), async (req: Request, res: Response) => {
	const user = await isAuthenticated(req, res, true);
	if (!user) return;

	const cacheKey = `dash:servers:${user}`;

	const cached = await redis.get(cacheKey);
	if (cached) {
		return res.send(JSON.parse(cached));
	}

	const response = await botReq("getUserServers", { user });
	if (!response.success) {
		return res.status(response.statusCode ?? 500).send({ error: response.error });
	}

	if (!response["servers"]) return res.status(404).send({ error: "Not found" });

	const servers: Server[] = response["servers"];
	const body = { servers };

	redis.set(cacheKey, JSON.stringify(body), { EX: CACHE_TTL_SECONDS }).catch(() => {});

	res.send(body);
});
