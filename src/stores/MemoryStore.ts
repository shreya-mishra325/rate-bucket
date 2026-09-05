import type { BucketState, Store } from "./Store.js";

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
    const entry = this.data.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.data.delete(key);
      return undefined;
    }
    return entry.state;
  }

  async set(key: string, state: BucketState, ttlSeconds: number): Promise<void> {
    this.data.set(key, {
      state,
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
