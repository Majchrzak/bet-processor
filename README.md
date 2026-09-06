# bet-processor

Built with:

- **Hono** - small and fast.
- **PostgreSQL + TimescaleDB** - ledger and time-bounded RTP in one engine.
- **Zod (`zod/compile`)** - compiled parsers on the hot path.


## Design - what we optimized for

The system is designed for continuous, never-ending operation with an
ever-growing transaction history. Permanent ledger data is split into
time-based chunks and moved to columnstore, mutable action state is bounded by
retention, and RTP reports use hourly and daily aggregates instead of scanning
the complete history.

- **One procedure, one round trip** - `process_game_actions()` runs the full batch
  atomically (wallet lock, ordered actions, idempotency, pre-rollbacks). The API
  sends one call instead of N+1 queries per action, less pool pressure and faster
  than orchestrating the same work from Node, even in a single transaction.

- **Idempotency without extras** - core tables use deterministic keys derived
  from natural identifiers (user, currency, game, action). Resubmitting the same
  action produces the same `hot_game_action` primary key. Duplicate submissions
  return the existing transaction ID and do not modify the wallet balance a
  second time. Rollbacks use the same key scheme to locate the original action.
  This requires no separate deduplication table; the only additional index
  supports rollback-before-original lookups.

- **Hot path, cold ledger** - recent actions read a small, bounded projection;
  the append-only ledger holds full financial history for RTP. Retention trims
  the hot store as volume grows, keeping idempotency and rollback lookups
  independent of the permanent ledger size. A daily Timescale job retains hot
  action state for 60 days after a game finishes. The game lifecycle and ledger
  remain durable.

- **Layered RTP reads** - split `[from, to)` into disjoint slices, sum each,
  merge. Most of a long window comes from pre-aggregated buckets, not a full
  ledger scan:
  1. Raw ledger - from `from` until the next hour boundary (partial start).
  2. Hourly aggregate - complete hours before the first full UTC day.
  3. Daily aggregate - complete UTC days in the middle.
  4. Hourly aggregate - complete hours after the last full UTC day.
  5. Raw ledger - from the last hour boundary to `to` (partial end).

## Performance

Profile: **10,000 users**, **90 concurrent workers**, **30s warmup**, **30s
measurement**, one finished bet per request, HMAC enabled, and the full response
body consumed by the client.

| Transaction rows | Game round rows | Hot action rows | Avg latency | Throughput | vs baseline |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 0 | 0 | **56.261 ms** | **1,601.77 RPS** | baseline |
| 10M | ~5.0M | ~1M | **60.053 ms** | **1,499.70 RPS** | −6.4% RPS |
| 50M | ~25.2M | ~1M | **61.959 ms** | **1,453.80 RPS** | −9.2% RPS |
| 100M | ~50.0M | ~1M | **71.349 ms** | **1,262.97 RPS** | −21.2% RPS |

The tools can generate a complete synthetic dataset for local testing:
`fixture` populates historical `game_round`, `transactions`, and recent
`hot_game_action` rows, while `seed` creates the wallets. The example below
creates 50M games (100M transaction rows) and runs an ingestion simulation.

```bash
pnpm docker:up
pnpm fixture \
  --clean \
  --games 50000000 \
  --users 10000 \
  --days 365 \
  --namespace bench
pnpm seed --users 10000 --namespace bench
pnpm benchmark \
  --users 10000 \
  --concurrency 90 \
  --warmup 30 \
  --duration 30 \
  --namespace bench
```

## Run it

```bash
pnpm docker:up
pnpm seed --users 10000 --namespace test
pnpm run-game --rounds 100000 --users 10000 --namespace test
```

The game runner uses a non-trivial payout distribution with an expected RTP of
95%. It fails if any round fails or if casino RTP falls outside a
three-standard-error confidence band with a minimum tolerance of ±1 percentage
point. It also verifies the active user count and variance for larger user
populations.

## Tests

Unit tests - no running stack:

```bash
pnpm test
```

Acceptance tests - API and database must be up (`pnpm docker:up`):

```bash
pnpm test:acceptance
```

Covers processor scenarios A–J and RTP reporting (auth, rollbacks, pagination,
time windows).

## Packages

- [HTTP API](packages/api/README.md)
- [CLI tools](packages/tools/README.md)

## Assumptions and limitations

- **JSON numbers** - balances and report totals are safe up to
  `Number.MAX_SAFE_INTEGER`; the database uses `BIGINT`.
- **Single-node scale** - one PostgreSQL cluster is enough for tens of
  millions of rows. Beyond that, shard by `user_id`; writes are already
  user-scoped, and only casino-wide RTP needs a cross-shard merge.
