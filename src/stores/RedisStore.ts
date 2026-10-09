import type { BucketState, Store } from "./Store.js";
import { validateOptions, type BucketResult, type ConsumeOptions } from "../core/tokenBucket.js";

export interface RedisLikeClient {
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
  hGetAll(key: string): Promise<Record<string, string>>;
  hSet(key: string, values: Record<string, string>): Promise<unknown>;
  expire(key: string, seconds: number): Promise<unknown>;
}

// Refill, deduction and expiration form one atomic server-side operation.
const CONSUME_SCRIPT = `
local capacity = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local cost = tonumber(ARGV[3])
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local data = redis.call('HMGET', KEYS[1], 'tokens', 'lastRefill')
local tokens = tonumber(data[1]) or capacity
local last = tonumber(data[2]) or now
now = math.max(now, last)
tokens = math.min(capacity, tokens + math.max(0, now - last) / 1000 * rate)
local allowed = 0
local retry = -1
if tokens >= cost then
  tokens = tokens - cost
  allowed = 1
  retry = 0
elseif rate > 0 and cost <= capacity then
  retry = math.ceil((cost - tokens) / rate * 1000)
end
redis.call('HSET', KEYS[1], 'tokens', tostring(tokens), 'lastRefill', tostring(now))
redis.call('PEXPIRE', KEYS[1], ARGV[4])
return {allowed, math.floor(tokens), retry, tostring(tokens), tostring(now)}
`;

/**
 * Redis-backed store for sharing bucket state across multiple
 * server instances. Requires a connected Redis client with eval support.
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
    if (typeof client.eval !== "function") {
      throw new TypeError("RedisStore requires a client with eval support for atomic consumption");
    }
    this.client = client;
    this.keyPrefix = options.keyPrefix ?? "rate-bucket:";
  }

  async consume(key: string, options: ConsumeOptions, ttlSeconds: number): Promise<BucketResult> {
    validateOptions(options);
    const result = await this.client.eval(CONSUME_SCRIPT, {
      keys: [this.keyPrefix + key],
      arguments: [
        String(options.maxTokens),
        String(options.refillRatePerSecond),
        String(options.cost ?? 1),
        String(Math.ceil(ttlSeconds * 1000)),
      ],
    });
    if (!Array.isArray(result) || result.length !== 5) {
      throw new Error("Unexpected Redis consume response");
    }
    const [allowed, remaining, retry, tokens, lastRefill] = result.map(Number);
    if (![allowed, remaining, retry, tokens, lastRefill].every(Number.isFinite)) {
      throw new Error("Invalid Redis consume response");
    }
    return {
      allowed: allowed === 1,
      remaining,
      retryAfterMs: retry < 0 ? null : retry,
      state: { tokens, lastRefill },
    };
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
