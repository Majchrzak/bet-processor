# bet-processor

## Benchmarking

Start the local stack, then prepare and benchmark an empty-history database:

```bash
docker compose up --build --wait
pnpm fixture --clean --games 0
pnpm seed --users 1000
pnpm benchmark --duration 30 --users 1000 --concurrency 25
```

To compare it with 100 million historical transaction rows:

```bash
pnpm fixture --clean --games 50000000 --users 1000 --days 365
pnpm seed --users 1000
pnpm benchmark --duration 30 --users 1000 --concurrency 25
```

`fixture --clean` deletes all application data, including wallets, before it
loads history. Run `seed` afterward to create fresh wallets for the measured
benchmark. Each fixture game creates two `transactions` rows and one
`game_round` row. Its two `hot_game_action` rows are retained only when the game
falls within the newest 60 days. The example uses 50 million games to create
100 million historical transaction rows. Fixture generation is batched; use
`--batch-games` to override the default batch size of 100,000 games.
