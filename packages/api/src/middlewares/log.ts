import type { Request, Response, NextFunction } from "express";
import { app } from "..";

app.use("*", (req: Request, _res: Response, next: NextFunction) => {
	console.debug(`${req.method} ${req.url}`);
	next();
});
