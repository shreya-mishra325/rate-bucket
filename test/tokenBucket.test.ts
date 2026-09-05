import { describe, expect, it } from "vitest";
import { createBucketState, tryConsume } from "../src/core/tokenBucket.js";

describe("tryConsume", () => {
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
    // refill rate of 2/sec over 5s = 10 tokens available
    const result = tryConsume(state, { maxTokens: 10, refillRatePerSecond: 2 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it("never refills above maxTokens", () => {
    const longAgo = Date.now() - 100_000;
    const state = { tokens: 0, lastRefill: longAgo };
    const result = tryConsume(state, { maxTokens: 5, refillRatePerSecond: 10 });
    expect(result.remaining).toBe(4); // capped at 5, minus 1 consumed
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
