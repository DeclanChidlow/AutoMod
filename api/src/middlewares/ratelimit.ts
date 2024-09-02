import { Request, Response, NextFunction } from "express";
import { ulid } from "ulid";
import { app } from "..";
import { redis } from "../db";

class RateLimiter {
    route: string;
    limit: number;
    timeframe: number;

    constructor(route: string, limits: { limit: number, timeframe: number }) {
        this.route = route;
        this.limit = limits.limit;
        this.timeframe = limits.timeframe;
    }

    middleware() {
        return async (req: Request, res: Response, next: NextFunction) => {
            try {
                const ip = req.ip;
                const reqId = ulid();
                // ratelimit:ip_address_base64:route_base64
                const redisKey = `ratelimit:${Buffer.from(ip).toString('base64')}:${Buffer.from(this.route).toString('base64')}`;
                const reqs = await redis.SCARD(redisKey);
                if (reqs >= this.limit) {
                    console.debug(`Ratelimiter: IP address exceeded ratelimit for ${this.route} [${this.limit}/${this.timeframe}]`);
                    res
                        .status(429)
                        .send({
                            error: 'You are being rate limited.',
                            limit: this.limit,
                            timeframe: this.timeframe,
                        });
                } else {
                    await redis.SADD(redisKey, reqId);
                    await redis.sendCommand([ 'EXPIREMEMBER', redisKey, reqId, this.timeframe.toString() ]);
                    next();
                }
            } catch(e) {
                console.error(e);
                next(e);
            }
        };
    }
}

const globalRateLimiter = new RateLimiter('*', { limit: 20, timeframe: 1 });
app.use('*', globalRateLimiter.middleware());

export { RateLimiter };
