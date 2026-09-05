import type { BucketState } from "../stores/Store.js";

export function createBucketState(maxTokens: number): BucketState {
  return {
    tokens: maxTokens,
    lastRefill: Date.now(),
  };
}

export function tryConsume(
  state: BucketState,
  options: { maxTokens: number; refillRatePerSecond: number; cost?: number },
): { state: BucketState; allowed: boolean; remaining: number } {
  const { maxTokens, refillRatePerSecond, cost = 1 } = options;
  const now = Date.now();
  const elapsedSeconds = Math.max(0, (now - state.lastRefill) / 1000);
  const refilled = Math.min(maxTokens, state.tokens + elapsedSeconds * refillRatePerSecond);

  const allowed = refilled >= cost;
  const tokens = allowed ? refilled - cost : refilled;

  return {
    state: {
      tokens: Number(tokens.toFixed(6)),
      lastRefill: now,
    },
    allowed,
    remaining: Math.floor(tokens),
  };
}
