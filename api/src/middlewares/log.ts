import { Request } from "express";
import { app, logger } from "..";

app.use('*', (req: Request, next: () => void) => {
    logger.debug(`${req.method} ${req.url}`);
    next();
});
