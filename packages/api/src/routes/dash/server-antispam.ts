import { app, db } from "../..";
import type { Request, Response } from "express";
import { badRequest, ensureObjectStructure, isAuthenticated, requireAuth } from "../../utils";
import type { Collection } from "mongodb";
import { ulid } from "ulid";

let _serversCollection: Collection | null = null;

async function serversCollection() {
	if (!_serversCollection) _serversCollection = (await db).collection("servers");
	return _serversCollection;
}

type AntispamRule = {
	id: string;
	max_msg: number;
	timeframe: number;
	action: 0 | 1 | 2 | 3 | 4;
	channels: string[] | null;
	message: string | null;
};

app.get("/dash/server/:server/antispam", requireAuth({ permission: 2 }), async (req: Request, res: Response) => {
	const user = await isAuthenticated(req, res, true);
	if (!user) return;

	const { server } = req.params;
	if (!server || typeof server != "string") return badRequest(res);

	const serverConfig = await (await serversCollection()).findOne({ id: server });
	if (!serverConfig) return res.status(404).send({ error: "Server not found" });

	const result = {
		antispam:
			(serverConfig["automodSettings"]?.spam as AntispamRule[] | undefined)?.map(
				(r) =>
					({
						action: r.action,
						channels: r.channels,
						id: r.id,
						max_msg: r.max_msg,
						message: r.message,
						timeframe: r.timeframe,
					}) as AntispamRule,
			) ?? [],
	};

	res.send(result);
});

app.patch("/dash/server/:server/antispam/:ruleid", requireAuth({ permission: 2 }), async (req: Request, res: Response) => {
	const user = await isAuthenticated(req, res, true);
	if (!user) return;

	const { server, ruleid } = req.params;
	const body = req.body;
	if (!server || !ruleid) return badRequest(res);

	const serverConfig = await (await serversCollection()).findOne({ id: server });
	const antiSpamRules: AntispamRule[] = serverConfig?.["automodSettings"]?.spam ?? [];

	const rule = antiSpamRules.find((r) => r.id == ruleid);
	if (!rule) return res.status(404).send({ error: "No rule with this ID could be found." });

	const action = body.action != null ? Number(body.action) : rule.action;
	const max_msg = body.max_msg != null ? Number(body.max_msg) : rule.max_msg;
	const timeframe = body.timeframe != null ? Number(body.timeframe) : rule.timeframe;

	if (action < 0 || action > 4) return res.status(400).send("Invalid action");
	if (max_msg < 1 || max_msg > 1000) return res.status(400).send("max_msg must be between 1 and 1000");
	if (timeframe < 1 || timeframe > 86400) return res.status(400).send("timeframe must be between 1 and 86400");

	const result = await (
		await serversCollection()
	).updateOne(
		{ "id": server, "automodSettings.spam.id": ruleid },
		{
			$set: {
				"automodSettings.spam.$": {
					...rule,
					action,
					channels: body.channels ?? rule.channels,
					message: body.message ?? rule.message,
					max_msg,
					timeframe,
				},
			},
		},
	);

	return res.send({ success: result.modifiedCount > 0 });
});

app.post("/dash/server/:server/antispam", requireAuth({ permission: 2 }), async (req, res) => {
	const user = await isAuthenticated(req, res, true);
	if (!user) return;

	const { server } = req.params;
	if (!server || typeof server != "string") return badRequest(res);

	let rule: any;
	try {
		rule = ensureObjectStructure(
			req.body,
			{
				max_msg: "number",
				timeframe: "number",
				action: "number",
				message: "string",
			},
			true,
		);
	} catch (e) {
		return res.status(400).send(e);
	}

	if (rule.action == null || rule.action < 0 || rule.action > 4) return res.status(400).send("Invalid action");

	if (rule.max_msg == null || rule.timeframe == null || rule.action == null) {
		return res.status(400).send("Missing required fields: max_msg, timeframe, action");
	}
	if (rule.max_msg < 1 || rule.max_msg > 1000) return res.status(400).send("max_msg must be between 1 and 1000");
	if (rule.timeframe < 1 || rule.timeframe > 86400) return res.status(400).send("timeframe must be between 1 and 86400");

	const id = ulid();

	const result = await (
		await serversCollection()
	).updateOne({ id: server }, {
		$push: {
			"automodSettings.spam": {
				id: id,
				max_msg: rule.max_msg ?? 5,
				timeframe: rule.timeframe ?? 3,
				action: rule.action ?? 0,
				message: rule.message ?? null,
			},
		},
	} as any);

	res.status(200).send({ success: result.modifiedCount > 0, id: id });
});

app.delete("/dash/server/:server/antispam/:ruleid", requireAuth({ permission: 2 }), async (req, res) => {
	const user = await isAuthenticated(req, res, true);
	if (!user) return;

	const { server, ruleid } = req.params;
	if (!server || typeof server != "string" || !ruleid || typeof ruleid != "string") return badRequest(res);

	let result;
	try {
		result = await (
			await serversCollection()
		).updateOne({ id: server }, {
			$pull: {
				"automodSettings.spam": { id: ruleid },
			},
		} as any);
	} catch (e) {
		console.error(e);
		res.status(500).send({ error: "Internal server error" });
		return;
	}

	if (result.modifiedCount > 0) res.status(200).send({ success: true });
	else res.status(404).send({ success: false, error: "Rule not found" });
});
