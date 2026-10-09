# rate-bucket

[![npm version](https://img.shields.io/npm/v/@shreya-mishra325/rate-bucket.svg)](https://www.npmjs.com/package/@shreya-mishra325/rate-bucket)

A token-bucket rate limiter for Node.js and TypeScript. Uses memory by default,
with optional Redis storage and Express middleware. The core has no runtime
dependencies. Includes ESM, CommonJS, and TypeScript declarations.

## Install

```bash
npm install @shreya-mishra325/rate-bucket
```

## Usage

```ts
import { RateLimiter } from "@shreya-mishra325/rate-bucket";

const limiter = new RateLimiter({
  maxTokens: 20,
  refillRatePerSecond: 1,
});

const result = await limiter.consume("user-123");
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
    keyGenerator: (req) => req.ip ?? "unknown",
  }),
);
```

Rejected requests get a `429` with `{ success: false, message: "Too Many Requests" }`
by default. Override with `onLimited(req, res, result)` for custom responses.
Responses include `X-RateLimit-Limit` and `X-RateLimit-Remaining`. Rejected
requests also include `Retry-After` (seconds) when tokens can replenish enough
to satisfy the cost. Middleware errors are forwarded to `next(error)` in
Express 4 and 5.

Skip health checks and charge a higher cost for exports:

```ts
app.use(rateLimiter({
  maxTokens: 100,
  refillRatePerSecond: 5,
  skip: (req) => req.path === "/health",
  cost: (req) => req.path === "/export" ? 10 : 1,
}));
```

`keyGenerator`, `cost`, `skip`, and `onLimited` may return promises. Skipped
requests do not consume tokens or receive rate-limit headers. Prefer an
authenticated user ID as the key when available. When using IP addresses,
configure Express `trust proxy` for your deployment; do not blindly trust
client-supplied forwarding headers. The default uses each full IP address:
it does not group IPv6 addresses into subnets.

## Redis

The memory store tracks limits within one process. To share limits across
instances, pass a connected `redis` client:

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

Install `redis` separately. Custom clients must expose `eval`, `hGetAll`,
`hSet`, and `expire` with the `node-redis` v4+ signatures.
Consumption runs a single Lua script using Redis server time to atomically
refill, deduct, and expire a bucket. The Redis account needs permission to
execute `EVAL`, `TIME`, `HMGET`, `HSET`, and `PEXPIRE`. Use a different
`keyPrefix` for independent policies that could otherwise share keys.

## Custom stores

Custom stores implement this interface. Import `Store` and `BucketState`
from `@shreya-mishra325/rate-bucket`:

```ts
import type { BucketState } from "@shreya-mishra325/rate-bucket";

interface Store {
  get(key: string): Promise<BucketState | undefined>;
  set(key: string, state: BucketState, ttlSeconds: number): Promise<void>;
}
```

Legacy `get`/`set` stores are serialized per key for callers sharing the same
store object within one process. This cannot coordinate separate processes
or different store objects. For distributed correctness, implement the
optional `consume(key, options, ttlSeconds): Promise<BucketResult>` method
with a transaction or another backend atomic operation. `ConsumeOptions`
and `BucketResult` are exported types. Built-in stores implement this method.

## API

### `new RateLimiter(options)`

| Option                | Default             | Description                                  |
| ---------------------- | -------------------- | --------------------------------------------- |
| `maxTokens`            | `10`                 | Bucket capacity                               |
| `refillRatePerSecond`  | `maxTokens / 60`     | Tokens added per second                       |
| `ttlSeconds`           | `1800`               | How long an idle key's state is retained      |
| `store`                | `new MemoryStore()`  | Where state is persisted                      |

### `limiter.consume(key, cost = 1)`

Returns `{ allowed, remaining, limit, retryAfterMs }`.

- `retryAfterMs` is `0` on success, or the estimated milliseconds until the
  requested cost is available. Other consumers can change this estimate.
- `retryAfterMs` is `null` if the cost exceeds capacity or refill is disabled
  and there are not enough tokens. Expiration can still reset the bucket.
- Capacity, cost, and TTL must be finite and positive; refill rate must be
  finite and non-negative. Fractional costs are supported. Keys must be
  non-empty strings. Invalid values throw before accessing storage.
- TTL is refreshed on every consumption attempt, including rejections.
  Expired keys restart with full capacity. Choose a TTL at least as long as
  `maxTokens / refillRatePerSecond` if you want to avoid early resets.
- Use the same capacity and refill settings for limiters sharing a bucket.

### Memory-store lifecycle

For short-lived limiters, supply a `MemoryStore` and call `store.destroy()`
when finished to stop its cleanup timer. This does not clear existing buckets.
The timer is unreferenced and does not keep a Node.js process alive.

## Upgrading from 0.1.1

- Custom Redis clients must now implement `eval`; the built-in store no longer
  uses a non-atomic read/write sequence for consumption. Standard `node-redis`
  clients already provide this method.
- Zero/negative costs, invalid numeric options, and empty keys are rejected.
- Consume results have a new `retryAfterMs` field; update exact-object
  assertions and manually constructed `ConsumeResult` values accordingly.
- Legacy custom stores remain usable, with the process-local limitation above.

## Development

```sh
npm ci
npm run typecheck
npm test
npm run build
npm pack --dry-run
```

To include the real Redis integration test, set `REDIS_URL` to a test Redis
instance before running `npm test`. Without it, that test is skipped. CI runs
it with Redis 7. Node 18 and 20 remain in the compatibility matrix alongside
22 and 24; use a maintained Node release for deployments.

## Token bucket behavior

A bucket starts with `maxTokens` tokens. Each request spends its cost, and
tokens refill at `refillRatePerSecond`, up to capacity. This permits bursts
while limiting the average request rate.

## License

MIT
