# Changelog

## Unreleased

### Fixed

- Prevent concurrent consumption from exceeding the in-memory token budget.
- Use an atomic Redis Lua script and server time for shared token budgets.
- Serialize legacy custom-store consumption per key and store object within
  one process, releasing queued requests after store failures.
- Reject invalid capacities, refill rates, TTLs, keys, and request costs.
- Avoid premature refill after a backward wall-clock adjustment and preserve
  fractional tokens without rounding on every request.
- Forward Express middleware and async callback failures to `next(error)`.

### Added

- `retryAfterMs` in consume results and `Retry-After` on retryable HTTP 429s.
- Async Express key generators, request costs, skip predicates, and handlers.
- An optional atomic `Store.consume` extension with exported result/options types.

### Compatibility notes

- Redis-like clients must implement `eval` for atomic consumption.
- Previously accepted invalid inputs now throw. See the README migration notes.
