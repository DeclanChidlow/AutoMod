import { Request, Response, NextFunction } from "express";
import { Collection, Db } from "mongodb";
import { app, SESSION_LIFETIME } from "..";

let sessionsCollection: Collection;

export function initializeSessionsMiddleware(db: Db) {
	sessionsCollection = db.collection("sessions");
}

app.use("*", async (req: Request, res: Response, next: NextFunction) => {
	next();

	const user = req.header("x-auth-user");
	const token = req.header("x-auth-token");
	if (!user || !token) return;

	try {
		const session = await sessionsCollection.findOne({
			user,
			token,
			expires: { $gt: new Date() },
		});

		if (session) {
			await sessionsCollection.updateOne({ _id: session._id }, { $set: { expires: new Date(Date.now() + SESSION_LIFETIME) } });
		}
	} catch (e) {
		console.error(e);
	}
});
