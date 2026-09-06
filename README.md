# bet-processor

Built with:

- **Hono** - small and fast.
- **PostgreSQL + TimescaleDB** - ledger and time-bounded RTP in one engine.
- **Zod (`zod/compile`)** - compiled parsers on the hot path.

## Design — what we optimized for

**One procedure, one round trip** - `process_game_actions()` runs the full batch
atomically (wallet lock, ordered actions, idempotency, pre-rollbacks). The API
sends one call instead of N+1 queries per action, less pool pressure and faster
than orchestrating the same work from Node, even in a single transaction.

**Idempotency without extras** - core tables use deterministic keys derived
from natural identifiers (user, currency, game, action). Retries address the
same row every time, so replay detection is a primary-key lookup — no dedup
table, no composite indexes on `(user, game, action_id)`, and fewer indexes
mean faster inserts under load. The only extra index is one partial index on
`hot_game_action` for rollback lookups — nothing else.

**Hot path, cold ledger** - recent games and actions read a
small, bounded projection; the append-only ledger holds full financial history
for RTP. Retention trims the hot store as volume grows - replay lookups stay
fast without scanning billions of ledger rows.

**Layered RTP reads** — split `[from, to)` into disjoint slices, sum each, merge.
Most of a long window comes from pre-aggregated buckets, not a full ledger scan.

1. Raw ledger - from `from` until the next hour boundary (partial start).
2. Hourly aggregate - complete hours before the first full UTC day.
3. Daily aggregate - complete UTC days in the middle.
4. Hourly aggregate - complete hours after the last full UTC day.
5. Raw ledger - from the last hour boundary to `to` (partial end).

## Run it

```bash
pnpm docker:up
pnpm seed --users 10000 --namespace test
pnpm run-game --rounds 100000 --users 10000 --namespace test
```

## Tests

Unit tests — no running stack:

```bash
pnpm test
```

Acceptance tests — API and database must be up (`pnpm docker:up`):

```bash
pnpm test:acceptance
```

Covers processor scenarios A–J and RTP reporting (auth, rollbacks, pagination,
time windows).

## Benchmarking

Empty DB baseline. Use the same `--namespace` for `fixture`, `seed`, and
`benchmark` so traffic hits the seeded wallets.

```bash
pnpm docker:up
pnpm fixture --clean --games 0 --namespace bench
pnpm seed --users 1000 --namespace bench
pnpm benchmark --duration 30 --users 1000 --concurrency 25 --namespace bench
```

~100M historical transaction rows (50M games × 2 ledger rows). Same namespace as above.

```bash
pnpm fixture --clean --games 50000000 --users 1000 --days 365 --namespace bench
pnpm seed --users 1000 --namespace bench
pnpm benchmark --duration 30 --users 1000 --concurrency 25 --namespace bench
```

## API

See [`packages/api/README.md`](packages/api/README.md).

## Assumptions and limitations

- **JSON numbers** — balances and report totals are safe up to
  `Number.MAX_SAFE_INTEGER`; the database uses `BIGINT`.
