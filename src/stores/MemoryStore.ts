import type { BucketState, Store } from "./Store.js";
import { createBucketState, tryConsume, type BucketResult, type ConsumeOptions } from "../core/tokenBucket.js";

interface Entry {
  state: BucketState;
  expiresAt: number;
}

export class MemoryStore implements Store {
  private data = new Map<string, Entry>();
  private sweepIntervalMs: number;
  private timer?: ReturnType<typeof setInterval>;

  constructor(options: { sweepIntervalMs?: number } = {}) {
    this.sweepIntervalMs = options.sweepIntervalMs ?? 60_000;
    this.timer = setInterval(() => this.sweep(), this.sweepIntervalMs);
    if (typeof this.timer.unref === "function") {
      this.timer.unref();
    }
  }

  async get(key: string): Promise<BucketState | undefined> {
    return this.read(key);
  }

  private read(key: string): BucketState | undefined {
    const entry = this.data.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.data.delete(key);
      return undefined;
    }
    return { ...entry.state };
  }

  async consume(key: string, options: ConsumeOptions, ttlSeconds: number): Promise<BucketResult> {
    const result = tryConsume(this.read(key) ?? createBucketState(options.maxTokens), options);
    // No await between reading and updating: other requests cannot interleave.
    this.data.set(key, {
      state: { ...result.state },
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
    return result;
  }

  async set(key: string, state: BucketState, ttlSeconds: number): Promise<void> {
    this.data.set(key, {
      state: { ...state },
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.data) {
      if (entry.expiresAt <= now) {
        this.data.delete(key);
      }
    }
  }

  destroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
