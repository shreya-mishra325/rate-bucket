import { afterEach, expect, it, vi } from "vitest";
import { MemoryStore } from "../src/stores/MemoryStore.js";
import { RateLimiter } from "../src/RateLimiter.js";

afterEach(() => vi.useRealTimers());

it("refreshes expiration on rejected attempts and resets an idle bucket", async () => {
  vi.useFakeTimers();
  const store = new MemoryStore();
  try {
    const limiter = new RateLimiter({ maxTokens: 1, refillRatePerSecond: 0, ttlSeconds: 1, store });
    await limiter.consume("key");
    vi.advanceTimersByTime(750);
    expect((await limiter.consume("key")).allowed).toBe(false);
    vi.advanceTimersByTime(750);
    expect((await limiter.consume("key")).allowed).toBe(false);
    vi.advanceTimersByTime(1000);
    expect((await limiter.consume("key")).allowed).toBe(true);
  } finally {
    store.destroy();
  }
});

it("does not expose mutable stored state", async () => {
  const store = new MemoryStore();
  try {
    const state = { tokens: 1, lastRefill: Date.now() };
    await store.set("key", state, 60);
    state.tokens = 100;
    const read = (await store.get("key"))!;
    expect(read.tokens).toBe(1);
    read.tokens = 200;
    expect((await store.get("key"))!.tokens).toBe(1);
  } finally {
    store.destroy();
  }
});
