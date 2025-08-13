import { Request, Response, NextFunction } from "express";
import { app } from "..";

app.use("*", (req: Request, res: Response, next: NextFunction) => {
	console.debug(`${req.method} ${req.url}`);
	next();
});
