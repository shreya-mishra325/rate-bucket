import type { BucketState } from "../stores/Store.js";

export interface ConsumeOptions {
  maxTokens: number;
  refillRatePerSecond: number;
  cost?: number;
}

export interface BucketResult {
  state: BucketState;
  allowed: boolean;
  remaining: number;
  /** null means the requested cost cannot be replenished. */
  retryAfterMs: number | null;
}

export function validateOptions({ maxTokens, refillRatePerSecond, cost = 1 }: ConsumeOptions): void {
  if (!Number.isFinite(maxTokens) || maxTokens <= 0) {
    throw new RangeError("maxTokens must be finite and positive");
  }
  if (!Number.isFinite(refillRatePerSecond) || refillRatePerSecond < 0) {
    throw new RangeError("refillRatePerSecond must be finite and non-negative");
  }
  if (!Number.isFinite(cost) || cost <= 0) {
    throw new RangeError("cost must be finite and positive");
  }
}

export function createBucketState(maxTokens: number): BucketState {
  validateOptions({ maxTokens, refillRatePerSecond: 0 });
  return {
    tokens: maxTokens,
    lastRefill: Date.now(),
  };
}

export function tryConsume(
  state: BucketState,
  options: ConsumeOptions,
): BucketResult {
  validateOptions(options);
  const { maxTokens, refillRatePerSecond, cost = 1 } = options;
  const now = Math.max(Date.now(), state.lastRefill);
  const elapsedSeconds = Math.max(0, (now - state.lastRefill) / 1000);
  const refilled = Math.min(maxTokens, state.tokens + elapsedSeconds * refillRatePerSecond);

  const allowed = refilled >= cost;
  const tokens = allowed ? refilled - cost : refilled;
  let retryAfterMs: number | null = null;
  if (allowed) {
    retryAfterMs = 0;
  } else if (cost <= maxTokens && refillRatePerSecond > 0) {
    retryAfterMs = Math.ceil((cost - refilled) / refillRatePerSecond * 1000);
  }

  return {
    state: {
      tokens,
      lastRefill: now,
    },
    allowed,
    remaining: Math.floor(tokens),
    retryAfterMs,
  };
}
