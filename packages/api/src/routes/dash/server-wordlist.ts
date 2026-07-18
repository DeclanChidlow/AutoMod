import { app, db } from "../..";
import type { Request, Response } from "express";
import { badRequest, isAuthenticated, requireAuth } from "../../utils";
import type { Collection } from "mongodb";

let _servers: Collection | null = null;
async function serversCollection() {
	if (!_servers) _servers = (await db).collection("servers");
	return _servers;
}

type WordlistEntry = { word: string; strictness: "SOFT" | "HARD" | "STRICT" };
type WordlistAction = { action: "LOG" | "DELETE" | "WARN"; message: string };

const MAX_WORD_LENGTH = 2000;

// GET — list all wordlist entries + config
app.get("/dash/server/:server/wordlist", requireAuth({ permission: 2 }), async (req: Request, res: Response) => {
	const user = await isAuthenticated(req, res, true);
	if (!user) return;

	const { server } = req.params;
	if (!server || typeof server != "string") return badRequest(res);

	const col = await serversCollection();
	const doc = await col.findOne({ id: server });

	res.send({
		enabled: !!doc?.["wordlistEnabled"],
		action: (doc?.["wordlistAction"] as WordlistAction) || { action: "LOG", message: "" },
		words: (doc?.["wordlist"] as WordlistEntry[]) || [],
	});
});

// POST — add a word
app.post("/dash/server/:server/wordlist", requireAuth({ permission: 2 }), async (req: Request, res: Response) => {
	const user = await isAuthenticated(req, res, true);
	if (!user) return;

	const { server } = req.params;
	if (!server || typeof server != "string") return badRequest(res);

	const body = req.body;
	if (!body.word || typeof body.word != "string") return badRequest(res, "Missing 'word' field");
	if (body.word.length > MAX_WORD_LENGTH) return badRequest(res, `Word must be at most ${MAX_WORD_LENGTH} characters`);

	const strictness = ["SOFT", "HARD", "STRICT"].includes(body.strictness) ? body.strictness : "SOFT";

	const entry: WordlistEntry = { word: body.word.toLowerCase(), strictness };

	const col = await serversCollection();

	const result = await col.updateOne({ id: server }, [
		{
			$set: {
				wordlist: {
					$concatArrays: [{ $filter: { input: { $ifNull: ["$wordlist", []] }, cond: { $ne: [{ $toLower: "$$this.word" }, entry.word] } } }, [entry]],
				},
			},
		},
	]);

	res.send({ success: result.modifiedCount > 0, entry });
});

// PATCH — update a word's strictness
app.patch("/dash/server/:server/wordlist/:word", requireAuth({ permission: 2 }), async (req: Request, res: Response) => {
	const user = await isAuthenticated(req, res, true);
	if (!user) return;

	const { server, word } = req.params;
	if (!server || !word) return badRequest(res);
	if (word.length > MAX_WORD_LENGTH) return badRequest(res, `Word must be at most ${MAX_WORD_LENGTH} characters`);

	const strictness = ["SOFT", "HARD", "STRICT"].includes(req.body.strictness) ? req.body.strictness : "SOFT";

	const col = await serversCollection();
	const result = await col.updateOne({ "id": server, "wordlist.word": word.toLowerCase() }, { $set: { "wordlist.$.strictness": strictness } } as any);

	res.send({ success: result.modifiedCount > 0 });
});

// DELETE — remove a word
app.delete("/dash/server/:server/wordlist/:word", requireAuth({ permission: 2 }), async (req: Request, res: Response) => {
	const user = await isAuthenticated(req, res, true);
	if (!user) return;

	const { server, word } = req.params;
	if (!server || !word) return badRequest(res);

	const col = await serversCollection();
	const result = await col.updateOne({ id: server }, { $pull: { wordlist: { word: word.toLowerCase() } } } as any);

	res.send({ success: result.modifiedCount > 0 });
});

// PUT — update wordlist config (enabled, action type, action message)
app.put("/dash/server/:server/wordlist/config", requireAuth({ permission: 2 }), async (req: Request, res: Response) => {
	const user = await isAuthenticated(req, res, true);
	if (!user) return;

	const { server } = req.params;
	if (!server || typeof server != "string") return badRequest(res);

	const body = req.body;
	const setFields: Record<string, any> = {};

	if (body.enabled !== undefined) setFields["wordlistEnabled"] = !!body.enabled;
	if (body.action !== undefined) {
		if (!["LOG", "DELETE", "WARN"].includes(body.action)) return badRequest(res, "action must be LOG, DELETE, or WARN");
		setFields["wordlistAction.action"] = body.action;
	}
	if (body.message !== undefined) {
		setFields["wordlistAction.message"] = body.message || "";
	}

	if (Object.keys(setFields).length === 0) return badRequest(res, "No fields to update");

	const col = await serversCollection();
	await col.updateOne({ id: server }, { $set: setFields });

	res.send({ success: true });
});
