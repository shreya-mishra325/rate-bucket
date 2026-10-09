import type { NextFunction, Request, Response } from "express";
import { RateLimiter, type RateLimiterOptions, type ConsumeResult } from "../RateLimiter.js";

export interface ExpressRateLimiterOptions extends RateLimiterOptions {
  keyGenerator?: (req: Request) => string | Promise<string>;
  onLimited?: (req: Request, res: Response, result: ConsumeResult) => void | Promise<void>;
  cost?: number | ((req: Request) => number | Promise<number>);
  skip?: (req: Request) => boolean | Promise<boolean>;
}

/**
 * Express middleware wrapping RateLimiter.
 *
 * @example
 * import express from "express";
 * import { rateLimiter } from "@shreya-mishra325/rate-bucket/express";
 *
 * app.use(rateLimiter({ maxTokens: 20, refillRatePerSecond: 1 }));
 */
export function rateLimiter(options: ExpressRateLimiterOptions = {}) {
  const limiter = new RateLimiter(options);
  const keyGenerator = options.keyGenerator ?? ((req: Request) => req.ip ?? "unknown");
  const cost = options.cost ?? 1;

  return async function rateLimiterMiddleware(req: Request, res: Response, next: NextFunction) {
    try {
      if (await options.skip?.(req)) {
        next();
        return;
      }
      const key = await keyGenerator(req);
      const requestCost = typeof cost === "function" ? await cost(req) : cost;
      const result = await limiter.consume(key, requestCost);

      res.setHeader("X-RateLimit-Limit", String(result.limit));
      res.setHeader("X-RateLimit-Remaining", String(result.remaining));

      if (!result.allowed) {
        if (result.retryAfterMs !== null) {
          const retryAfterSeconds = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
          res.setHeader("Retry-After", String(retryAfterSeconds));
        }
        if (options.onLimited) {
          await options.onLimited(req, res, result);
          return;
        }
        return res.status(429).json({
          success: false,
          message: "Too Many Requests",
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
