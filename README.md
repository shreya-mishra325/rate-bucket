# rate-bucket

[![npm version](https://img.shields.io/npm/v/@shreya-mishra325/rate-bucket.svg)](https://www.npmjs.com/package/@shreya-mishra325/rate-bucket)

Published as `@shreya-mishra325/rate-bucket` on npm.

A small, dependency-free token-bucket rate limiter for Node.js and TypeScript.
Zero-config in-memory store by default, with an optional Redis-backed store
for multi-instance deployments, and an optional Express middleware.

- No required dependencies for the core limiter
- Works with any key: IP address, user ID, API key, etc.
- Pluggable storage (`MemoryStore` built in, `RedisStore` for shared state)
- Ships ESM + CJS + TypeScript types
- Express middleware available at `@shreya-mishra325/rate-bucket/express` (doesn't pull in Express for non-Express users)

## Install

```bash
npm install @shreya-mishra325/rate-bucket
```

## Quick start (framework-agnostic)

```ts
import { RateLimiter } from "@shreya-mishra325/rate-bucket";

const limiter = new RateLimiter({
  maxTokens: 20,          
  refillRatePerSecond: 1,
});

const result = await limiter.consume(userId);
if (!result.allowed) {
  throw new Error("Rate limit exceeded");
}
console.log(`${result.remaining}/${result.limit} tokens left`);
```

## Express middleware

```ts
import express from "express";
import { rateLimiter } from "@shreya-mishra325/rate-bucket/express";

const app = express();

app.use(
  rateLimiter({
    maxTokens: 20,
    refillRatePerSecond: 1,
    keyGenerator: (req) => req.ip, 
  }),
);
```

Rejected requests get a `429` with `{ success: false, message: "Too Many Requests" }`
by default. Override with `onLimited(req, res, result)` for custom responses.

## Sharing state across multiple instances (Redis)

By default, bucket state lives in memory in the current process — fine for a
single instance, but each instance will have its own limits if you run more
than one. To share state, bring your own connected `redis` client:

```ts
import { createClient } from "redis";
import { RateLimiter, RedisStore } from "@shreya-mishra325/rate-bucket";

const client = createClient({ url: process.env.REDIS_URL });
await client.connect();

const limiter = new RateLimiter({
  maxTokens: 20,
  refillRatePerSecond: 1,
  store: new RedisStore(client),
});
```

`@shreya-mishra325/rate-bucket` does not depend on the `redis` package directly — you install
and configure the client yourself, and pass it in. Any client exposing
`hGetAll` / `hSet` / `expire` (the `node-redis` v4+ API) will work.

## Custom stores

Implement the `Store` interface to persist bucket state anywhere:

```ts
import type { Store, BucketState } from "@shreya-mishra325/rate-bucket";

class MyStore implements Store {
  async get(key: string): Promise<BucketState | undefined> { }
  async set(key: string, state: BucketState, ttlSeconds: number): Promise<void> { }
}
```

## API

### `new RateLimiter(options)`

| Option                | Default             | Description                                  |
| ---------------------- | -------------------- | --------------------------------------------- |
| `maxTokens`            | `10`                 | Bucket capacity                               |
| `refillRatePerSecond`  | `maxTokens / 60`     | Tokens added per second                       |
| `ttlSeconds`           | `1800`               | How long an idle key's state is retained      |
| `store`                | `new MemoryStore()`  | Where state is persisted                      |

### `limiter.consume(key, cost = 1)`

Returns `{ allowed, remaining, limit }`.

## Why token bucket

Unlike a fixed window counter, a token bucket allows short bursts up to its
capacity while enforcing a steady average rate over time — closer to how
most real APIs want to behave.

## License

MIT

---
 
[GitHub](https://github.com/shreya-mishra325/rate-bucket)
[npm](https://www.npmjs.com/package/@shreya-mishra325/rate-bucket)