import type { Request, Response, NextFunction } from "express";
import { app } from "..";

const ALLOWED_ORIGIN = "https://automod.vale.rocks";

app.use("*", (req: Request, res: Response, next: NextFunction) => {
	const origin = req.headers.origin;
	if (origin === ALLOWED_ORIGIN) {
		res.header("Access-Control-Allow-Origin", origin);
		res.header("Access-Control-Allow-Credentials", "true");
	} else {
		res.header("Access-Control-Allow-Origin", "*");
	}
	res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, x-auth-user, x-auth-token");
	res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");

	if (req.method === "OPTIONS") {
		res.status(200).end();
		return;
	}

	next();
});
