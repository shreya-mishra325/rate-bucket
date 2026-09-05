import { describe, expect, it } from "vitest";
import { RateLimiter } from "../src/RateLimiter.js";
import { MemoryStore } from "../src/stores/MemoryStore.js";

describe("RateLimiter", () => {
  it("allows requests within the limit", async () => {
    const limiter = new RateLimiter({ maxTokens: 3, refillRatePerSecond: 0 });
    const a = await limiter.consume("user-1");
    const b = await limiter.consume("user-1");
    const c = await limiter.consume("user-1");
    expect([a.allowed, b.allowed, c.allowed]).toEqual([true, true, true]);
  });

  it("rejects requests once the bucket is exhausted", async () => {
    const limiter = new RateLimiter({ maxTokens: 2, refillRatePerSecond: 0 });
    await limiter.consume("user-2");
    await limiter.consume("user-2");
    const third = await limiter.consume("user-2");
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
  });

  it("tracks separate buckets per key", async () => {
    const limiter = new RateLimiter({ maxTokens: 1, refillRatePerSecond: 0 });
    const userA = await limiter.consume("a");
    const userB = await limiter.consume("b");
    expect(userA.allowed).toBe(true);
    expect(userB.allowed).toBe(true);
  });

  it("accepts a custom store", async () => {
    const store = new MemoryStore();
    const limiter = new RateLimiter({ maxTokens: 1, refillRatePerSecond: 0, store });
    const first = await limiter.consume("x");
    const second = await limiter.consume("x");
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);
    store.destroy();
  });
});
