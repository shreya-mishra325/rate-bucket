import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { rateLimiter, type ExpressRateLimiterOptions } from "../src/adapters/express.js";

function context() {
  const req = { ip: "127.0.0.1", path: "/api" } as Request;
  const res = {
    setHeader: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return { req, res, response: res as unknown as Response, next: vi.fn() };
}

describe("Express middleware", () => {
  it("supports async keys and costs, returning retry headers on rejection", async () => {
    const middleware = rateLimiter({
      maxTokens: 2,
      refillRatePerSecond: 1,
      keyGenerator: async () => "user",
      cost: async () => 2,
    });
    const { req, res, response, next } = context();
    await middleware(req, response, next);
    expect(next).toHaveBeenCalledOnce();
    next.mockClear();
    await middleware(req, response, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.setHeader).toHaveBeenCalledWith("Retry-After", "2");
  });

  it("skips requests without invoking the key generator", async () => {
    const keyGenerator = vi.fn();
    const middleware = rateLimiter({ skip: async () => true, keyGenerator });
    const { req, res, response, next } = context();
    await middleware(req, response, next);
    expect(next).toHaveBeenCalledWith();
    expect(keyGenerator).not.toHaveBeenCalled();
    expect(res.setHeader).not.toHaveBeenCalled();
  });

  it.each(["key", "cost", "skip", "store", "onLimited"])("forwards %s errors to next for Express 4 and 5", async (source) => {
    const error = new Error("failure");
    const fail = async (): Promise<never> => {
      throw error;
    };
    const cases: Record<string, ExpressRateLimiterOptions> = {
      key: { keyGenerator: fail },
      cost: { cost: fail },
      skip: { skip: fail },
      store: { store: { get: fail, set: fail } },
      onLimited: { onLimited: fail, cost: 2 },
    };
    const middleware = rateLimiter({ maxTokens: 1, refillRatePerSecond: 0, ...cases[source] });
    const { req, response, next } = context();
    await middleware(req, response, next);
    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith(error);
  });

  it("omits Retry-After when a cost can never be satisfied", async () => {
    const middleware = rateLimiter({ maxTokens: 1, cost: 2 });
    const { req, res, response, next } = context();
    await middleware(req, response, next);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.setHeader.mock.calls.some(([name]) => name === "Retry-After")).toBe(false);
  });
});
