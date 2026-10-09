import { createBucketState, tryConsume, validateOptions } from "./core/tokenBucket.js";
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
  /** 0 when allowed; null when the cost cannot be replenished. */
  retryAfterMs: number | null;
}

const DEFAULT_MAX_TOKENS = 10;
const DEFAULT_TTL_SECONDS = 30 * 60;
const storeQueues = new WeakMap<Store, Map<string, Promise<void>>>();

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
    validateOptions({ maxTokens: this.maxTokens, refillRatePerSecond: this.refillRatePerSecond });
    if (!Number.isFinite(this.ttlSeconds) || this.ttlSeconds <= 0) {
      throw new RangeError("ttlSeconds must be finite and positive");
    }
    this.store = options.store ?? new MemoryStore();
  }

  async consume(key: string, cost = 1): Promise<ConsumeResult> {
    if (typeof key !== "string" || key.length === 0) {
      throw new TypeError("key must be a non-empty string");
    }
    const options = {
      maxTokens: this.maxTokens,
      refillRatePerSecond: this.refillRatePerSecond,
      cost,
    };
    validateOptions(options);
    if (this.store.consume) {
      const result = await this.store.consume(key, options, this.ttlSeconds);
      return {
        allowed: result.allowed,
        remaining: result.remaining,
        limit: this.maxTokens,
        retryAfterMs: result.retryAfterMs,
      };
    }

    // Legacy stores are serialized per key and shared store object in this process.
    let queues = storeQueues.get(this.store);
    if (!queues) {
      queues = new Map();
      storeQueues.set(this.store, queues);
    }
    const previous = queues.get(key) ?? Promise.resolve();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    queues.set(key, pending);
    await previous;
    try {
      const existing = await this.store.get(key);
      const current = existing ?? createBucketState(this.maxTokens);
      const { state, allowed, remaining, retryAfterMs } = tryConsume(current, options);
      await this.store.set(key, state, this.ttlSeconds);
      return { allowed, remaining, limit: this.maxTokens, retryAfterMs };
    } finally {
      release();
      if (queues.get(key) === pending) {
        queues.delete(key);
      }
    }
  }
}
