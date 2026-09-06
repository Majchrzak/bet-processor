pnpm fixture --clean --games 0 --namespace bench
pnpm seed --users 10000 --namespace bench
pnpm benchmark --duration 60 --users 10000 --concurrency 100 --namespace bench

