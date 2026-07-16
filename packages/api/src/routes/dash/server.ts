import { app, db } from "../..";
import type { Request, Response } from "express";
import { badRequest, getPermissionLevel, isAuthenticated, requireAuth, unauthorized } from "../../utils";
import { botReq } from "../internal/ws";
import { redis } from "../../db";

type User = { id: string; username?: string; avatarURL?: string };
type Channel = { id: string; name: string; icon?: string; type: "VOICE" | "TEXT"; nsfw: boolean };

type ServerDetails = {
	id: string;
	perms: 0 | 1 | 2 | 3;
	name: string;
	description?: string;
	iconURL?: string;
	bannerURL?: string;
	serverConfig: any;
	users: User[];
	channels: Channel[];
	channelCount: number;
	ownerName?: string;
	createdAt: number;
	roleCount: number;
	dmOnKick?: boolean;
	dmOnWarn?: boolean;
	botName?: string;
	botId?: string;
};

app.get("/dash/server/:server", requireAuth({ permission: 0 }), async (req: Request, res: Response) => {
	const user = await isAuthenticated(req, res, true);
	if (!user) return;

	const { server } = req.params;
	if (!server || typeof server != "string") return badRequest(res);

	const cacheKey = `dash:server:${server}:${user}`;

	const cached = await redis.get(cacheKey);
	if (cached) {
		return res.send(JSON.parse(cached));
	}

	const response = await botReq("getUserServerDetails", { user, server });
	if (!response.success) {
		return res.status(response.statusCode ?? 500).send({ error: response.error });
	}

	if (!response["server"]) return res.status(404).send({ error: "Not found" });

	const s: ServerDetails = response["server"];
	const body = { server: s };

	redis.set(cacheKey, JSON.stringify(body), { EX: 15 }).catch(() => {});

	res.send(body);
});

app.put("/dash/server/:server/:option", async (req: Request, res: Response) => {
	try {
		const user = await isAuthenticated(req, res, true);
		if (!user) return;

		const { server } = req.params;
		const { item } = req.body;
		if (!server || typeof server != "string") return badRequest(res);

		const permissionLevelRes = await getPermissionLevel(user, server);
		if (!permissionLevelRes.success) return res.status(permissionLevelRes.statusCode || 500).send({ error: permissionLevelRes.error });

		const dbInstance = await db;
		const servers = dbInstance.collection("servers");
		const permissionLevel: 0 | 1 | 2 | 3 = permissionLevelRes["level"];
		const settings = await servers.findOne({ id: server });

		switch (req.params["option"]) {
			case "managers": {
				if (!item || typeof item != "string") return badRequest(res);
				if (permissionLevel < 3) return res.status(403).send({ error: "You are not allowed to add other bot managers." });

				const userRes = await botReq("getUser", { user: item });
				if (!userRes.success) {
					return res.status(404).send({ error: "User could not be found" });
				}

				if (settings?.["botManagers"]?.includes(userRes["user"]["id"]) === true) {
					return res.status(400).send({ error: "This user is already manager" });
				}

				const newManagers = [...(settings?.["botManagers"] ?? []), userRes["user"]["id"]];
				await servers.updateOne({ id: server }, { $set: { botManagers: newManagers } });
				res.send({
					success: true,
					managers: newManagers,
					users: [userRes["user"]],
				});
				return;
			}

			case "mods": {
				if (!item || typeof item != "string") return badRequest(res);
				if (permissionLevel < 2) return res.status(403).send({ error: "You are not allowed to add other moderators." });

				const userRes = await botReq("getUser", { user: item });
				if (!userRes.success) {
					return res.status(404).send({ error: "User could not be found" });
				}

				if (settings?.["moderators"]?.includes(userRes["user"]["id"]) === true) {
					return res.status(400).send({ error: "This user is already moderator" });
				}

				const newMods = [...(settings?.["moderators"] ?? []), userRes["user"]["id"]];
				await servers.updateOne({ id: server }, { $set: { moderators: newMods } });
				res.send({
					success: true,
					mods: newMods,
					users: [userRes["user"]],
				});
				return;
			}

			case "config": {
				function validateField(field: string, types: string[], level: 0 | 1 | 2 | 3): boolean {
					if (permissionLevel < level) {
						res.status(403).send({ error: `You are not authorized to change '${field}'` });
						return false;
					}
					if (req.body?.[field] != undefined && !types.includes(typeof req.body?.[field])) {
						res.status(400).send({ error: `Field '${field}' needs to be of type ${types.join(" or ")}` });
						return false;
					}
					return true;
				}

				// Validate all fields
				const fields = [
					["prefix", ["string"], 2],
					["spaceAfterPrefix", ["boolean"], 2],
					["dmOnKick", ["boolean"], 2],
					["dmOnBan", ["boolean"], 2],
					["dmOnWarn", ["boolean"], 2],
					["antispamEnabled", ["boolean"], 2],
					["votekickEnabled", ["boolean"], 2],
					["votekickVotesRequired", ["number"], 2],
					["votekickBanDuration", ["number"], 2],
					["wordlistEnabled", ["boolean"], 2],
				] as const;
				for (const [field, types, level] of fields) {
					if (!validateField(field as string, types as string[], level as 0 | 1 | 2 | 3)) return;
				}

				const body = req.body;
				const setFields: Record<string, any> = {};

				if (body.prefix !== undefined) setFields["prefix"] = body.prefix === "" ? null : body.prefix;
				if (body.spaceAfterPrefix !== undefined) setFields["spaceAfterPrefix"] = body.spaceAfterPrefix;
				if (body.dmOnKick !== undefined) setFields["dmOnKick"] = body.dmOnKick;
				if (body.dmOnBan !== undefined) setFields["dmOnBan"] = body.dmOnBan;
				if (body.dmOnWarn !== undefined) setFields["dmOnWarn"] = body.dmOnWarn;
				if (body.antispamEnabled !== undefined) setFields["antispamEnabled"] = body.antispamEnabled;
				if (body.wordlistEnabled !== undefined) setFields["wordlistEnabled"] = body.wordlistEnabled;

				// Votekick nested fields
				if (body.votekickEnabled !== undefined) setFields["votekick.enabled"] = body.votekickEnabled;
				if (body.votekickVotesRequired !== undefined) setFields["votekick.votesRequired"] = body.votekickVotesRequired;
				if (body.votekickBanDuration !== undefined) setFields["votekick.banDuration"] = body.votekickBanDuration;

				await servers.updateOne({ id: server }, { $set: setFields });
				return res.send({ success: true });
			}

			default:
				return badRequest(res);
		}
	} catch (e: any) {
		console.error(e);
		res.status(500).send({ error: e });
	}
});

app.delete("/dash/server/:server/:option/:target", async (req: Request, res: Response, next) => {
	const user = await isAuthenticated(req, res, true);
	if (!user) return unauthorized(res);

	const { server, target, option } = req.params;
	if (!server || typeof server != "string" || !target || typeof target != "string") return badRequest(res);

	const permissionLevelRes = await getPermissionLevel(user, server);
	if (!permissionLevelRes.success) return res.status(permissionLevelRes.statusCode || 500).send({ error: permissionLevelRes.error });

	const dbInstance3 = await db;
	const servers3 = dbInstance3.collection("servers");
	const permissionLevel3: 0 | 1 | 2 | 3 = permissionLevelRes["level"];
	const settings3 = await servers3.findOne({ id: server });

	switch (option) {
		case "managers": {
			if (permissionLevel3 < 3) return res.status(403).send({ error: "You are not allowed to remove bot managers." });

			if (!settings3?.["botManagers"]?.includes(target)) {
				return res.status(400).send({ error: "This user is not manager" });
			}

			const newManagers = (settings3?.["botManagers"] ?? []).filter((i: string) => i != target);
			await servers3.updateOne({ id: server }, { $set: { botManagers: newManagers } });
			res.send({
				success: true,
				managers: newManagers,
			});
			return;
		}
		case "mods": {
			if (permissionLevel3 < 2) return res.status(403).send({ error: "You are not allowed to remove moderators." });

			if (!settings3?.["moderators"]?.includes(target)) {
				return res.status(400).send({ error: "This user is not moderator" });
			}

			const newMods = (settings3?.["moderators"] ?? []).filter((i: string) => i != target);
			await servers3.updateOne({ id: server }, { $set: { moderators: newMods } });
			res.send({
				success: true,
				mods: newMods,
			});
			return;
		}
		default:
			next();
	}
});
