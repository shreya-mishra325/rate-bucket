import { afterEach, describe, expect, it, vi } from "vitest";
import { RateLimiter } from "../src/RateLimiter.js";
import { MemoryStore } from "../src/stores/MemoryStore.js";
import type { Store } from "../src/stores/Store.js";

afterEach(() => vi.useRealTimers());

describe("concurrency and validation", () => {
  it.each([false, true])("shares a budget across limiter instances (legacy store: %s)", async (legacy) => {
    const memory = new MemoryStore();
    const store: Store = legacy ? { get: memory.get.bind(memory), set: memory.set.bind(memory) } : memory;
    try {
      const options = { maxTokens: 3, refillRatePerSecond: 0, store };
      const limiters = [new RateLimiter(options), new RateLimiter(options)];
      const requests = Array.from({ length: 100 }, (_, i) => limiters[i % 2].consume("shared"));
      const results = await Promise.all(requests);
      expect(results.filter(result => result.allowed)).toHaveLength(3);
      expect((await limiters[0].consume("other")).allowed).toBe(true);
    } finally {
      memory.destroy();
    }
  });

  it("releases the legacy store queue after an error", async () => {
    const store: Store = {
      get: vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined),
      set: vi.fn().mockResolvedValue(undefined),
    };
    const limiter = new RateLimiter({ store });
    const first = limiter.consume("key");
    const second = limiter.consume("key");
    await expect(first).rejects.toThrow("offline");
    expect((await second).allowed).toBe(true);
  });

  it.each([0, -1, NaN, Infinity])("rejects invalid capacity %s", (maxTokens) => {
    expect(() => new RateLimiter({ maxTokens })).toThrow(RangeError);
  });

  it.each([-1, NaN, Infinity])("rejects invalid refill rate %s", (refillRatePerSecond) => {
    expect(() => new RateLimiter({ refillRatePerSecond })).toThrow(RangeError);
  });

  it.each([0, -1, NaN, Infinity])("rejects invalid TTL %s", (ttlSeconds) => {
    expect(() => new RateLimiter({ ttlSeconds })).toThrow(RangeError);
  });

  it("rejects invalid keys and costs without changing the budget", async () => {
    const store = new MemoryStore();
    try {
      const limiter = new RateLimiter({ store, maxTokens: 1, refillRatePerSecond: 0 });
      for (const cost of [0, -1, NaN, Infinity]) {
        await expect(limiter.consume("key", cost)).rejects.toThrow(RangeError);
      }
      await expect(limiter.consume("")).rejects.toThrow(TypeError);
      expect((await limiter.consume("key")).remaining).toBe(0);
    } finally {
      store.destroy();
    }
  });

  it("reports retry timing and handles impossible costs", async () => {
    vi.useFakeTimers();
    const store = new MemoryStore();
    try {
      const limiter = new RateLimiter({ maxTokens: 2, refillRatePerSecond: 2, store });
      await limiter.consume("key", 2);
      expect((await limiter.consume("key")).retryAfterMs).toBe(500);
      vi.advanceTimersByTime(500);
      expect((await limiter.consume("key")).retryAfterMs).toBe(0);
      expect((await limiter.consume("key", 3)).retryAfterMs).toBeNull();
      const frozen = new RateLimiter({ maxTokens: 1, refillRatePerSecond: 0, store });
      await frozen.consume("frozen");
      expect((await frozen.consume("frozen")).retryAfterMs).toBeNull();
    } finally {
      store.destroy();
    }
  });
});
