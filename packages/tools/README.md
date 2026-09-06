# @bet-processor/tools

CLI utilities for seeding wallets, generating historical fixtures, running
randomized games, and measuring ingestion performance.

## Commands

| Command | Uses | Description |
| --- | --- | --- |
| `pnpm seed` | PostgreSQL | Create deterministic wallets or reset their balances |
| `pnpm run-game` | API | Run randomized games and verify RTP reports |
| `pnpm fixture` | PostgreSQL | Generate historical benchmark data |
| `pnpm benchmark` | API | Measure signed game-round ingestion |

Run commands from the repository root. Each command builds the required
packages automatically.

```bash
pnpm docker:up
```

## `seed`

Creates deterministic wallets. Running it again with the same namespace,
currency, and user count resets existing wallets to the requested balance.

```bash
pnpm seed --users 10000 --balance 100000000 --namespace demo
```

| Option | Default | Description |
| --- | --- | --- |
| `--users <count>` | `1000` | Number of wallets |
| `--balance <minor-units>` | `100000000` | Initial balance per wallet |
| `--currency <currency>` | `USD` | Wallet currency |
| `--namespace <value>` | none | Deterministic user namespace |
| `--database-url <url>` | local PostgreSQL | Database connection URL |

## `run`

Runs randomized game rounds against the API. Users must first be seeded with
the same namespace and currency.

The payout distribution has an expected RTP of 95%. After the run, the command
checks the casino RTP report, active user count, and per-user variance. It exits
with an error if a round fails or RTP is outside its sample-size-adjusted
tolerance.

```bash
pnpm seed --users 10000 --namespace demo
pnpm run-game \
  --rounds 100000 \
  --users 10000 \
  --concurrency 10 \
  --namespace demo
```

| Option | Default | Description |
| --- | --- | --- |
| `--rounds <count>` | `10000` | Number of game rounds |
| `--users <count>` | `1000` | Number of seeded players |
| `--concurrency <count>` | `10` | Maximum concurrent rounds |
| `--currency <currency>` | `USD` | Wallet and report currency |
| `--namespace <value>` | none | Namespace used by `seed` |
| `--api-url <url>` | `http://localhost:3000` | API base URL |
| `--hmac-secret <secret>` | `development-hmac-secret` | Request signing secret |

## `fixture`

Generates completed historical games directly in PostgreSQL. Each game creates:

- one `game_round`;
- one bet and one win in the permanent `transactions` ledger;
- corresponding `hot_game_action` rows only for the most recent 60 days.

`--clean` truncates `transactions`, `hot_game_action`, `game_round`, and
`wallet` before generation. Omit it to append another fixture.

```bash
pnpm fixture \
  --clean \
  --games 5000000 \
  --users 10000 \
  --days 365 \
  --namespace bench
```

| Option | Default | Description |
| --- | --- | --- |
| `--games <count>` | `0` | Number of completed games |
| `--users <count>` | `1000` | Number of fixture users |
| `--days <count>` | `365` | Historical time span |
| `--batch-games <count>` | `100000` | Games inserted per transaction |
| `--currency <currency>` | `USD` | Transaction currency |
| `--namespace <value>` | none | Deterministic user namespace |
| `--database-url <url>` | local PostgreSQL | Database connection URL |
| `--clean` | off | Remove existing application data first |

## `benchmark`

Runs a closed-loop ingestion benchmark against the API. Every request contains
one finished bet. Warmup requests are excluded from latency and throughput but
are included in `insertedRows`.

Users must first be seeded with the same namespace and currency.

```bash
pnpm seed --users 10000 --namespace bench
pnpm benchmark \
  --users 10000 \
  --concurrency 90 \
  --warmup 30 \
  --duration 30 \
  --namespace bench
```

| Option | Default | Description |
| --- | --- | --- |
| `--users <count>` | `1000` | Number of seeded player wallets |
| `--concurrency <count>` | `10` | Number of concurrent workers |
| `--warmup <seconds>` | `0` | Warmup excluded from results |
| `--duration <seconds>` | `30` | Measured duration |
| `--currency <currency>` | `USD` | Wallet currency |
| `--namespace <value>` | none | Namespace used by `seed` |
| `--api-url <url>` | `http://localhost:3000` | API base URL |
| `--hmac-secret <secret>` | `development-hmac-secret` | Request signing secret |

Example output:

```json
{
  "averageTimeMs": 60.053,
  "insertedRows": 84140,
  "requests": 44991,
  "requestsPerSecond": 1499.7
}
```

`averageTimeMs` covers the complete client cycle, including reading the
response body. `requests` and `requestsPerSecond` cover only the measured
interval.
