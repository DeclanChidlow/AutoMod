import { app, db } from "../..";
import type { Request, Response } from "express";
import { badRequest, forbidden, isAuthenticated, getPermissionLevel, requireAuth, unauthorized } from "../../utils";
import { botReq } from "../internal/ws";
import { ObjectId } from "mongodb";

async function resolveUserInfo(userIds: string[]): Promise<Record<string, { username: string } | null>> {
	const map: Record<string, { username: string } | null> = {};
	if (userIds.length === 0) return map;
	try {
		const userRes = await botReq("getUsers", { users: [...new Set(userIds)] });
		if (userRes.success && userRes.users) {
			Object.assign(map, userRes.users);
		}
	} catch {
		/* fallback: show IDs only */
	}
	return map;
}

async function resolveBannedUsers(server: string): Promise<Set<string>> {
	try {
		const banRes = await botReq("getBannedUserIds", { server });
		if (banRes.success && banRes.bannedIds) {
			return new Set(banRes.bannedIds);
		}
	} catch {
		/* fallback: no banned users shown */
	}
	return new Set<string>();
}

app.get("/dash/server/:server/infractions", requireAuth({ permission: 1 }), async (req: Request, res: Response) => {
	const user = await isAuthenticated(req, res, true);
	if (!user) return;

	const { server } = req.params;
	if (!server || typeof server !== "string") return badRequest(res);

	const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
	const actionParam = typeof req.query.action === "string" ? req.query.action : "";
	const actions = actionParam
		.split(",")
		.map((a) => a.trim())
		.filter(Boolean);
	const limit = Math.min(Math.max(parseInt(String(req.query.limit || "50")), 1), 200);
	const before = typeof req.query.before === "string" ? parseInt(req.query.before) : NaN;

	try {
		const dbInstance = await db;
		const infractionsColl = dbInstance.collection("infractions");

		const filter: Record<string, any> = { server };
		const andFilters: any[] = [];

		if (search) {
			andFilters.push({ $or: [{ user: search }, { createdBy: search }] });
		}

		if (actions.length > 0) {
			const actionFilters: any[] = [];
			for (const a of actions) {
				if (a === "warn") {
					actionFilters.push({ actionType: { $exists: false } });
				} else if (a === "kick" || a === "ban" || a === "timeout") {
					actionFilters.push({ actionType: a });
				}
			}
			if (actionFilters.length > 0) {
				andFilters.push({ $or: actionFilters });
			}
		}

		if (!isNaN(before)) {
			filter.date = { $lt: before };
		}

		if (andFilters.length > 0) {
			filter["$and"] = andFilters;
		}

		let total = 0;
		let warns = 0;
		let kicks = 0;
		let bans = 0;
		let timeouts = 0;

		if (isNaN(before)) {
			[total, warns, kicks, bans, timeouts] = await Promise.all([
				infractionsColl.countDocuments({ server }),
				infractionsColl.countDocuments({ server, actionType: { $exists: false } }),
				infractionsColl.countDocuments({ server, actionType: "kick" }),
				infractionsColl.countDocuments({ server, actionType: "ban" }),
				infractionsColl.countDocuments({ server, actionType: "timeout" }),
			]);
		}

		const results = await infractionsColl
			.find(filter)
			.sort({ date: -1 })
			.limit(limit + 1)
			.toArray();

		const hasMore = results.length > limit;
		const items = results.slice(0, limit).map((i: any) => {
			const rawId = i._id;
			let id: string;
			if (rawId && typeof rawId === "object" && typeof rawId.toHexString === "function") {
				id = rawId.toHexString();
			} else if (rawId && typeof rawId === "object" && rawId.$oid) {
				id = rawId.$oid;
			} else {
				id = String(rawId || "");
			}
			return {
				_id: id,
				user: i.user,
				createdBy: i.createdBy,
				actionType: i.actionType || "warn",
				reason: i.reason || "",
				date: i.date,
			};
		});

		const enriched = items.map((i) => ({
			...i,
			userName: null,
			createdByName: null,
			isBanned: false,
		}));

		res.send({ infractions: enriched, total, hasMore, stats: { total, warns, kicks, bans, timeouts } });
	} catch (e: any) {
		console.error(e);
		res.status(500).send({ error: e.message || "Internal server error" });
	}
});

app.post("/dash/server/:server/infractions/resolve", requireAuth({ permission: 1 }), async (req: Request, res: Response) => {
	const user = await isAuthenticated(req, res, true);
	if (!user) return;

	const { server } = req.params;
	if (!server || typeof server !== "string") return badRequest(res);

	const { userIds } = req.body;
	if (!Array.isArray(userIds) || !userIds.every((id: any) => typeof id === "string")) {
		return badRequest(res, "userIds must be an array of strings");
	}

	try {
		const [userMap, bannedSet] = await Promise.all([
			resolveUserInfo(userIds),
			resolveBannedUsers(server),
		]);

		const users: Record<string, { username: string } | null> = {};
		for (const id of userIds) {
			users[id] = userMap[id] || null;
		}

		res.send({ users, bannedIds: [...bannedSet] });
	} catch (e: any) {
		console.error(e);
		res.status(500).send({ error: e.message || "Internal server error" });
	}
});

app.delete("/dash/server/:server/infractions/:id", async (req: Request, res: Response) => {
	const user = await isAuthenticated(req, res, true);
	if (!user) return unauthorized(res);

	const { server, id } = req.params;
	if (!server || !id || typeof server !== "string" || typeof id !== "string") return badRequest(res);

	const permRes = await getPermissionLevel(user, server);
	if (!permRes.success) return res.status(permRes.statusCode || 500).send({ error: permRes.error });
	if ((permRes as any).level < 2) return forbidden(res, "You need Manager permissions to delete infractions.");

	try {
		const dbInstance = await db;
		const infractionsColl = dbInstance.collection("infractions");

		let lookupId: any;
		try {
			lookupId = new ObjectId(id);
		} catch {
			lookupId = id;
		}
		const result = await infractionsColl.deleteOne({ _id: lookupId, server });
		if (result.deletedCount === 0) {
			return res.status(404).send({ error: "Infraction not found" });
		}

		res.send({ success: true });
	} catch (e: any) {
		console.error(e);
		res.status(500).send({ error: e.message || "Internal server error" });
	}
});

app.post("/dash/server/:server/infractions/bulk-delete", async (req: Request, res: Response) => {
	const user = await isAuthenticated(req, res, true);
	if (!user) return unauthorized(res);

	const { server } = req.params;
	const { ids } = req.body;
	if (!server || typeof server !== "string") return badRequest(res);
	if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === "string")) return badRequest(res);

	const permRes = await getPermissionLevel(user, server);
	if (!permRes.success) return res.status(permRes.statusCode || 500).send({ error: permRes.error });
	if ((permRes as any).level < 2) return forbidden(res, "You need Manager permissions to delete infractions.");

	try {
		const dbInstance = await db;
		const infractionsColl = dbInstance.collection("infractions");

		const lookupIds = ids.map((id) => {
			try {
				return new ObjectId(id);
			} catch {
				return id;
			}
		});

		const result = await infractionsColl.deleteMany({ _id: { $in: lookupIds }, server });

		res.send({ success: true, deletedCount: result.deletedCount });
	} catch (e: any) {
		console.error(e);
		res.status(500).send({ error: e.message || "Internal server error" });
	}
});

app.post("/dash/server/:server/unban", async (req: Request, res: Response) => {
	const user = await isAuthenticated(req, res, true);
	if (!user) return unauthorized(res);

	const { server } = req.params;
	const { target } = req.body;
	if (!server || typeof server !== "string") return badRequest(res);
	if (!target || typeof target !== "string") return badRequest(res);

	const permRes = await getPermissionLevel(user, server);
	if (!permRes.success) return res.status(permRes.statusCode || 500).send({ error: permRes.error });
	if ((permRes as any).level < 2) return forbidden(res, "You need Manager permissions to unban users.");

	try {
		const response = await botReq("unbanUser", { user: target, server });
		if (!response.success) {
			return res.status(response.statusCode || 500).send({ error: response.error });
		}

		res.send({ success: true });
	} catch (e: any) {
		console.error(e);
		res.status(500).send({ error: e.message || "Internal server error" });
	}
});
