import type { Request, Response, NextFunction } from "express";
import type { Collection } from "mongodb";
import { app, db, SESSION_LIFETIME } from "..";

let _sessionsCollection: Collection | null = null;

async function sessionsCollection() {
	if (!_sessionsCollection) _sessionsCollection = (await db).collection("sessions");
	return _sessionsCollection;
}

app.use("*", async (req: Request, _res: Response, next: NextFunction) => {
	await next();

	const user = req.header("x-auth-user");
	const token = req.header("x-auth-token");
	if (!user || !token) return;

	try {
		const col = await sessionsCollection();
		const session = await col.findOne({
			user,
			token,
			expires: { $gt: new Date() },
		});

		if (session) {
			await col.updateOne({ _id: session._id }, { $set: { expires: new Date(Date.now() + SESSION_LIFETIME) } });
		}
	} catch (e) {
		console.error(e);
	}
});
