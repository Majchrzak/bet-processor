# @bet-processor/api

HTTP API for bet processing and RTP reporting.

Amounts and balances are integer minor units (e.g. cents). All routes except
`/health` require HMAC auth (below).

Schemas: [`src/processor/contract/`](src/processor/contract/),
[`src/rtp-users/contract/`](src/rtp-users/contract/),
[`src/rtp-casino/contract/`](src/rtp-casino/contract/).

## `POST /aggregator/takehome/process`

**Balance lookup** — `{ "user_id", "currency" }` → `{ "balance" }`.

**Process actions** — `{ "user_id", "currency", "game", "game_id", "actions"[, "finished"] }`
→ `{ "game_id", "transactions": [{ "action_id", "tx_id" }], "balance" }`.

Actions: `bet` / `win` (`amount` > 0) or `rollback` (`original_action_id`).
Replayed `action_id` returns the original `tx_id` without changing balance.

Domain errors (JSON `{ "code", "message" }`):

| Code | HTTP | Meaning |
| --- | --- | --- |
| 99 | 404 | Wallet not found |
| 100 | 400 | Insufficient funds |
| 101 | 400 | Game already finished |
| 102 | 400 | Invalid request |
| 108 | 400 | Too many actions (`BET_PROCESSOR_MAX_ACTIONS_PER_REQUEST`, default 1000) |

## `GET /reports/rtp/users`

Query: `from`, `to` (ISO-8601), optional `cursor`, optional `limit` (default 100,
max 1000). Paginated rows: `user_id`, `currency`, `rounds`, `total_bet`,
`total_win`, `rolled_back_bet`, `rolled_back_win`, `rtp` (`null` when effective
bet is zero). Rollbacks are excluded from bet/win totals and reported separately.

## `GET /reports/rtp/casino`

Same time window; one row per currency (no `user_id`).

## `GET /health`

Unauthenticated liveness check.

## Authentication

```text
Authorization: HMAC-SHA256 <lowercase-hex>
```

Digest = `HMAC-SHA256(BET_PROCESSOR_HMAC_SECRET, raw body bytes)`. GET reports
sign an empty body. Comparison is constant-time. Invalid/missing signature →
403 with `{ "message": "forbidden" }`.

## Configuration

Validated by [`src/config.ts`](src/config.ts). Copy [`.env.example`](../../.env.example)
for local / Docker Compose defaults. Unknown variables are ignored.

| Variable | Default | Purpose |
| --- | --- | --- |
| `BET_PROCESSOR_DATABASE_URL` | `postgresql://postgres:development-db-password@localhost:5432/bet_processor` | PostgreSQL connection string |
| `BET_PROCESSOR_DB_POOL_SIZE` | `90` | Connection pool size |
| `BET_PROCESSOR_DB_STATEMENT_TIMEOUT_MS` | `30000` | Per-query timeout (ms) |
| `BET_PROCESSOR_HMAC_SECRET` | `development-hmac-secret` | Request signing secret |
| `BET_PROCESSOR_HOST` | `0.0.0.0` | Bind address |
| `BET_PROCESSOR_PORT` | `3000` | Listen port |
| `BET_PROCESSOR_LOG_LEVEL` | `warn` | Log level (`fatal` … `silent`) |
| `BET_PROCESSOR_MAX_ACTIONS_PER_REQUEST` | `1000` | Max actions per process request |
| `BET_PROCESSOR_REQUEST_BODY_LIMIT_BYTES` | `1048576` | Max request body size |
| `BET_PROCESSOR_RTP_MAX_RANGE_DAYS` | `3660` | Max RTP report window length |

Docker Compose also uses `POSTGRES_*` / `API_PORT` for the database service and
port mapping — see `docker-compose.yml`.
