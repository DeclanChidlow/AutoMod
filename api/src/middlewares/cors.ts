import { Request, Response, NextFunction } from "express";
import { app } from "..";

app.use('*', (req: Request, res: Response, next: NextFunction) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, x-auth-user, x-auth-token');
    res.header('Access-Control-Allow-Methods', '*');
    next();
});
