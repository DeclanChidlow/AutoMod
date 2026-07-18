import { app, db } from "../..";
import type { Request, Response } from "express";
import { badRequest, isAuthenticated, requireAuth } from "../../utils";
import { redis } from "../../db";

app.put("/dash/server/:server/logs", requireAuth({ permission: 2 }), async (req: Request, res: Response) => {
	const user = await isAuthenticated(req, res, true);
	if (!user) return;

	const { server } = req.params;
	if (!server || typeof server !== "string") return badRequest(res);

	const { messageUpdate, modAction } = req.body;

	try {
		const dbInstance = await db;
		const servers = dbInstance.collection("servers");

		const setFields: Record<string, any> = {};

		if (messageUpdate !== undefined) {
			if (messageUpdate === null) {
				setFields["logs.messageUpdate"] = null;
			} else if (typeof messageUpdate === "object") {
				const mu: any = {};
				if (typeof messageUpdate.channel === "string") mu.channel = messageUpdate.channel;
				if (messageUpdate.type === "EMBED" || messageUpdate.type === "QUOTEBLOCK" || messageUpdate.type === "PLAIN") mu.type = messageUpdate.type;
				setFields["logs.messageUpdate.stoat"] = mu;
			}
		}

		if (modAction !== undefined) {
			if (modAction === null) {
				setFields["logs.modAction"] = null;
			} else if (typeof modAction === "object") {
				const ma: any = {};
				if (typeof modAction.channel === "string") ma.channel = modAction.channel;
				if (modAction.type === "EMBED" || modAction.type === "QUOTEBLOCK" || modAction.type === "PLAIN") ma.type = modAction.type;
				setFields["logs.modAction.stoat"] = ma;
			}
		}

		if (Object.keys(setFields).length === 0) return res.send({ success: true });

		await servers.updateOne({ id: server }, { $set: setFields });

		// Invalidate the server dashboard cache
		const cacheKey = `dash:server:${server}:${user}`;
		redis.del(cacheKey).catch(() => {});

		res.send({ success: true });
	} catch (e: any) {
		console.error(e);
		res.status(500).send({ error: e.message || "Internal server error" });
	}
});
