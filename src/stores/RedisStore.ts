import type { BucketState, Store } from "./Store.js";

export interface RedisLikeClient {
  hGetAll(key: string): Promise<Record<string, string>>;
  hSet(key: string, values: Record<string, string>): Promise<unknown>;
  expire(key: string, seconds: number): Promise<unknown>;
}

/**
 * Redis-backed store for sharing bucket state across multiple
 * server instances. Requires an already-connected redis client
 * (this package does not depend on `redis` directly — bring your own).
 *
 * @example
 * import { createClient } from "redis";
 * const client = createClient({ url: process.env.REDIS_URL });
 * await client.connect();
 * const store = new RedisStore(client, { keyPrefix: "rb:" });
 */
export class RedisStore implements Store {
  private client: RedisLikeClient;
  private keyPrefix: string;

  constructor(client: RedisLikeClient, options: { keyPrefix?: string } = {}) {
    this.client = client;
    this.keyPrefix = options.keyPrefix ?? "rate-bucket:";
  }

  async get(key: string): Promise<BucketState | undefined> {
    const data = await this.client.hGetAll(this.keyPrefix + key);
    if (!data || Object.keys(data).length === 0) return undefined;
    return {
      tokens: Number(data.tokens),
      lastRefill: Number(data.lastRefill),
    };
  }

  async set(key: string, state: BucketState, ttlSeconds: number): Promise<void> {
    const fullKey = this.keyPrefix + key;
    await this.client.hSet(fullKey, {
      tokens: state.tokens.toString(),
      lastRefill: state.lastRefill.toString(),
    });
    await this.client.expire(fullKey, ttlSeconds);
  }
}
