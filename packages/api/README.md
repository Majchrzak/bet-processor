# @bet-processor/api

HTTP API for atomic bet processing and time-bounded RTP reporting.

All monetary values are integer minor units (for example, cents). Every route
except `/health` requires HMAC authentication.

## Endpoints

| Method | Path | Authentication | Description |
| --- | --- | --- | --- |
| `POST` | `/aggregator/takehome/process` | HMAC over raw request body | Read a balance or process an ordered action batch |
| `GET` | `/reports/rtp/users` | HMAC over empty body | Paginated RTP grouped by user and currency |
| `GET` | `/reports/rtp/casino` | HMAC over empty body | Casino-wide RTP grouped by currency |
| `GET` | `/health` | None | Liveness check |

Request and response schemas live in:

- [`src/processor/contract/`](src/processor/contract/)
- [`src/rtp-users/contract/`](src/rtp-users/contract/)
- [`src/rtp-casino/contract/`](src/rtp-casino/contract/)

## Process endpoint

### Balance lookup

```json
{
  "user_id": "player-1",
  "currency": "USD"
}
```

```json
{
  "balance": 100000
}
```

### Process actions

```json
{
  "user_id": "player-1",
  "currency": "USD",
  "game": "provider:game",
  "game_id": "round-1",
  "finished": true,
  "actions": [
    { "action": "bet", "action_id": "8cbef27c-aef9-4de9-8058-64d59f54a621", "amount": 100 },
    { "action": "win", "action_id": "962ead63-b2b2-4e61-ad21-cd36e73892b0", "amount": 250 }
  ]
}
```

| Action | Required fields | Balance effect |
| --- | --- | --- |
| `bet` | `action_id`, positive `amount` | Subtracts `amount` |
| `win` | `action_id`, positive `amount` | Adds `amount` |
| `rollback` | `action_id`, `original_action_id` | Reverses the original action if it was applied |

Actions are processed in request order and the complete batch is atomic.
Replaying an `action_id` returns its original `tx_id` without changing the
balance.

When a rollback arrives before its original bet or win, the rollback is stored
and the later original action becomes a no-op. After the first
`finished: true`, new actions are rejected regardless of the flag on subsequent
requests; known replays and pre-rolled-back originals remain valid.

Action state is retained for 60 days after game completion or, for unfinished
games, after the most recent action. The game lifecycle and financial ledger
remain durable.

### Domain errors

Errors use `{ "code": number, "message": string }`.

| Code | HTTP | Meaning |
| --- | --- | --- |
| `99` | `404` | Wallet not found |
| `100` | `400` | Insufficient funds |
| `101` | `400` | Game already finished |
| `102` | `400` | Invalid request |
| `108` | `400` | Too many actions |

The default maximum is 1,000 actions per request and is configurable through
`BET_PROCESSOR_MAX_ACTIONS_PER_REQUEST`.

## RTP reports

Both reports accept a half-open ISO-8601 time window:

| Query parameter | Required | Description |
| --- | --- | --- |
| `from` | Yes | Inclusive start time |
| `to` | Yes | Exclusive end time |
| `limit` | Users only | Page size, default 100 and maximum 1,000 |
| `cursor` | Users only | Opaque cursor returned by the previous page |

RTP rows contain:

- `rounds`
- effective `total_bet` and `total_win`
- `rolled_back_bet` and `rolled_back_win`
- `rtp = total_win / total_bet`, or `null` when `total_bet` is zero

The user report groups by `user_id` and `currency` and returns `next_cursor`.
The casino report groups by currency and is not paginated.

## Authentication

```text
Authorization: HMAC-SHA256 <hex-digest>
```

The digest is:

```text
hex(HMAC_SHA256(BET_PROCESSOR_HMAC_SECRET, raw request body bytes))
```

POST requests are signed over the exact bytes sent to the API. GET requests are
signed over an empty body. Signatures are compared in constant time.

Missing, malformed, or invalid authorization returns:

```text
HTTP 403
{"message":"forbidden"}
```

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `BET_PROCESSOR_DATABASE_URL` | `postgresql://postgres:development-db-password@localhost:5432/bet_processor` | PostgreSQL connection string |
| `BET_PROCESSOR_DB_POOL_SIZE` | `90` | Connection pool size |
| `BET_PROCESSOR_DB_STATEMENT_TIMEOUT_MS` | `30000` | Per-query timeout in milliseconds |
| `BET_PROCESSOR_HMAC_SECRET` | `development-hmac-secret` | Request signing secret |
| `BET_PROCESSOR_HOST` | `0.0.0.0` | Bind address |
| `BET_PROCESSOR_PORT` | `3000` | Listen port |
| `BET_PROCESSOR_LOG_LEVEL` | `warn` | Log level (`fatal` through `silent`) |
| `BET_PROCESSOR_MAX_ACTIONS_PER_REQUEST` | `1000` | Maximum actions per process request |
| `BET_PROCESSOR_REQUEST_BODY_LIMIT_BYTES` | `1048576` | Maximum request body size |
| `BET_PROCESSOR_RTP_MAX_RANGE_DAYS` | `3660` | Maximum RTP report window |
