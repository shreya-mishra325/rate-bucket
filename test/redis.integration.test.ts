import { randomUUID } from "node:crypto";
import { createClient } from "redis";
import { expect, it } from "vitest";
import { RateLimiter } from "../src/RateLimiter.js";
import { RedisStore } from "../src/stores/RedisStore.js";

it.skipIf(!process.env.REDIS_URL)("enforces a shared budget across Redis clients and expires state", async () => {
  const clients = [createClient({ url: process.env.REDIS_URL }), createClient({ url: process.env.REDIS_URL })];
  const keyPrefix = `rate-bucket-test:${randomUUID()}:`;
  try {
    await Promise.all(clients.map(client => client.connect()));
    const limiters = clients.map(client => new RateLimiter({
      maxTokens: 3,
      refillRatePerSecond: 0,
      ttlSeconds: 1,
      store: new RedisStore(client, { keyPrefix }),
    }));
    const results = await Promise.all(Array.from({ length: 100 }, (_, i) => limiters[i % 2].consume("shared")));
    expect(results.filter(result => result.allowed)).toHaveLength(3);
    expect(results.filter(result => !result.allowed).every(result => result.retryAfterMs === null)).toBe(true);
    expect(await clients[0].pTTL(keyPrefix + "shared")).toBeGreaterThan(0);
    await new Promise(resolve => setTimeout(resolve, 1100));
    expect((await limiters[1].consume("shared")).allowed).toBe(true);

    const limiter = new RateLimiter({ maxTokens: 1, refillRatePerSecond: 1, store: new RedisStore(clients[0], { keyPrefix }) });
    await limiter.consume("refill", 1);
    const blocked = await limiter.consume("refill", 0.5);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    expect(blocked.retryAfterMs).toBeLessThanOrEqual(500);
    await new Promise(resolve => setTimeout(resolve, 550));
    expect((await limiter.consume("refill", 0.5)).allowed).toBe(true);
  } finally {
    if (clients[0].isReady) await clients[0].del([keyPrefix + "shared", keyPrefix + "refill"]);
    await Promise.all(clients.filter(client => client.isOpen).map(client => client.quit()));
  }
}, 15000);
