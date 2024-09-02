import { Request } from "express";
import { app } from "..";

app.use('*', (req: Request, next: () => void) => {
    console.debug(`${req.method} ${req.url}`);
    next();
});
