import type { NextFunction, Request, Response } from "express";
import { RateLimiter, type RateLimiterOptions } from "../RateLimiter.js";

export interface ExpressRateLimiterOptions extends RateLimiterOptions {
  keyGenerator?: (req: Request) => string;
  onLimited?: (req: Request, res: Response, result: { limit: number; remaining: number }) => void;
  cost?: number;
}

/**
 * Express middleware wrapping RateLimiter.
 *
 * @example
 * import express from "express";
 * import { rateLimiter } from "rate-bucket/express";
 *
 * app.use(rateLimiter({ maxTokens: 20, refillRatePerSecond: 1 }));
 */
export function rateLimiter(options: ExpressRateLimiterOptions = {}) {
  const limiter = new RateLimiter(options);
  const keyGenerator = options.keyGenerator ?? ((req: Request) => req.ip ?? "unknown");
  const cost = options.cost ?? 1;

  return async function rateLimiterMiddleware(req: Request, res: Response, next: NextFunction) {
    const key = keyGenerator(req);
    const result = await limiter.consume(key, cost);

    res.setHeader("X-RateLimit-Limit", String(result.limit));
    res.setHeader("X-RateLimit-Remaining", String(result.remaining));

    if (!result.allowed) {
      if (options.onLimited) {
        return options.onLimited(req, res, result);
      }
      return res.status(429).json({
        success: false,
        message: "Too Many Requests",
      });
    }

    next();
  };
}
