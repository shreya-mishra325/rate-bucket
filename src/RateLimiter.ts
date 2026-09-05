import { createBucketState, tryConsume } from "./core/tokenBucket.js";
import { MemoryStore } from "./stores/MemoryStore.js";
import type { Store } from "./stores/Store.js";

export interface RateLimiterOptions {
  maxTokens?: number;
  refillRatePerSecond?: number;
  ttlSeconds?: number;
  store?: Store;
}

export interface ConsumeResult {
  allowed: boolean;
  remaining: number;
  limit: number;
}

const DEFAULT_MAX_TOKENS = 10;
const DEFAULT_TTL_SECONDS = 30 * 60;

/**
 * Framework-agnostic token-bucket rate limiter.
 *
 * @example
 * const limiter = new RateLimiter({ maxTokens: 20, refillRatePerSecond: 1 });
 * const result = await limiter.consume(userId);
 * if (!result.allowed) throw new Error("rate limited");
 */
export class RateLimiter {
  private maxTokens: number;
  private refillRatePerSecond: number;
  private ttlSeconds: number;
  private store: Store;

  constructor(options: RateLimiterOptions = {}) {
    this.maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.refillRatePerSecond = options.refillRatePerSecond ?? this.maxTokens / 60;
    this.ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
    this.store = options.store ?? new MemoryStore();
  }

  async consume(key: string, cost = 1): Promise<ConsumeResult> {
    const existing = await this.store.get(key);
    const current = existing ?? createBucketState(this.maxTokens);

    const { state, allowed, remaining } = tryConsume(current, {
      maxTokens: this.maxTokens,
      refillRatePerSecond: this.refillRatePerSecond,
      cost,
    });

    await this.store.set(key, state, this.ttlSeconds);
    return { allowed, remaining, limit: this.maxTokens };
  }
}
