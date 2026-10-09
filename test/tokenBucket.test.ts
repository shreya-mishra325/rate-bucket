import { afterEach, describe, expect, it, vi } from "vitest";
import { createBucketState, tryConsume } from "../src/core/tokenBucket.js";

afterEach(() => vi.useRealTimers());

describe("tryConsume", () => {
  it("does not mint tokens when the clock moves backwards and catches up", () => {
    vi.useFakeTimers();
    vi.setSystemTime(9000);
    const original = { tokens: 0, lastRefill: 10000 };
    const first = tryConsume(original, { maxTokens: 1, refillRatePerSecond: 1 });
    vi.setSystemTime(10000);
    const second = tryConsume(first.state, { maxTokens: 1, refillRatePerSecond: 1 });
    expect(second.allowed).toBe(false);
    expect(second.state.tokens).toBe(0);
  });

  it("preserves sub-microtoken costs", () => {
    const result = tryConsume({ tokens: 0.0000004, lastRefill: Date.now() }, { maxTokens: 1, refillRatePerSecond: 0, cost: 0.0000001 });
    expect(result.state.tokens).toBeCloseTo(0.0000003, 12);
  });

  it("allows consumption when the bucket is full", () => {
    const state = createBucketState(10);
    const result = tryConsume(state, { maxTokens: 10, refillRatePerSecond: 1 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it("rejects consumption when the bucket is empty", () => {
    const state = { tokens: 0, lastRefill: Date.now() };
    const result = tryConsume(state, { maxTokens: 10, refillRatePerSecond: 1 });
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("refills tokens based on elapsed time", () => {
    const fiveSecondsAgo = Date.now() - 5000;
    const state = { tokens: 0, lastRefill: fiveSecondsAgo };
    const result = tryConsume(state, { maxTokens: 10, refillRatePerSecond: 2 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it("never refills above maxTokens", () => {
    const longAgo = Date.now() - 100_000;
    const state = { tokens: 0, lastRefill: longAgo };
    const result = tryConsume(state, { maxTokens: 5, refillRatePerSecond: 10 });
    expect(result.remaining).toBe(4);
  });

  it("supports consuming more than 1 token at once", () => {
    const state = createBucketState(10);
    const result = tryConsume(state, { maxTokens: 10, refillRatePerSecond: 1, cost: 5 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(5);
  });

  it("rejects when cost exceeds available tokens, without deducting", () => {
    const state = { tokens: 3, lastRefill: Date.now() };
    const result = tryConsume(state, { maxTokens: 10, refillRatePerSecond: 0, cost: 5 });
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(3);
  });
});
