import { describe, expect, it, vi } from "vitest";
import { RedisStore, type RedisLikeClient } from "../src/stores/RedisStore.js";

function client() {
  return { eval: vi.fn(), hGetAll: vi.fn(), hSet: vi.fn(), expire: vi.fn() };
}

describe("RedisStore", () => {
  it("uses one atomic operation and preserves fractional tokens", async () => {
    const redis = client();
    redis.eval.mockResolvedValue([0, 0, 750, "0.25", "1000"]);
    const store = new RedisStore(redis, { keyPrefix: "test:" });
    const result = await store.consume("user", { maxTokens: 2, refillRatePerSecond: 1 }, 0.5);
    expect(result).toEqual({
      allowed: false,
      remaining: 0,
      retryAfterMs: 750,
      state: { tokens: 0.25, lastRefill: 1000 },
    });
    expect(redis.eval).toHaveBeenCalledWith(expect.any(String), {
      keys: ["test:user"],
      arguments: ["2", "1", "1", "500"],
    });
    expect(redis.hGetAll).not.toHaveBeenCalled();
    expect(redis.hSet).not.toHaveBeenCalled();
  });

  it("rejects clients without eval support", () => {
    expect(() => new RedisStore({} as RedisLikeClient)).toThrow("eval");
  });

  it.each([null, [], [1, 0, 0, "bad", "1000"]])("rejects malformed replies: %s", async (reply) => {
    const redis = client();
    redis.eval.mockResolvedValue(reply);
    await expect(new RedisStore(redis).consume("user", { maxTokens: 1, refillRatePerSecond: 1 }, 60)).rejects.toThrow();
  });

  it("propagates Redis failures", async () => {
    const redis = client();
    redis.eval.mockRejectedValue(new Error("offline"));
    await expect(new RedisStore(redis).consume("user", { maxTokens: 1, refillRatePerSecond: 1 }, 60)).rejects.toThrow("offline");
  });
});
