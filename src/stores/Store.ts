import type { BucketResult, ConsumeOptions } from "../core/tokenBucket.js";

export interface BucketState {
  tokens: number;
  lastRefill: number;
}

export interface Store {
  /** Optional atomic operation, required for correctness across processes. */
  consume?(key: string, options: ConsumeOptions, ttlSeconds: number): Promise<BucketResult>;
  get(key: string): Promise<BucketState | undefined>;
  set(key: string, state: BucketState, ttlSeconds: number): Promise<void>;
}
