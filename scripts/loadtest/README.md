# Load Testing Suite

## Prerequisites

- **k6** — Install from https://k6.io/docs/get-started/installation/
- **Node.js 18+** — For DB/Redis benchmark scripts
- **Python 3.9+** — For browser concurrency simulation
- **Postgres + Redis** — Running on default ports

## Quick Start

```bash
# 1. Start the backend
cd apps/backend && npm run start:dev

# 2. Run all load tests
bash scripts/loadtest/run-load-tests.sh

# Or run individually:
k6 run scripts/loadtest/api-load.k6.js
k6 run scripts/loadtest/websocket-load.k6.js
node scripts/loadtest/db-benchmark.js
node scripts/loadtest/redis-queue-benchmark.js
python3 scripts/loadtest/browser-concurrent.py
```

## Test Descriptions

| Test | Tool | Target | What It Does |
|---|---|---|---|
| `api-load.k6.js` | k6 | 1000 concurrent | Register, login, create tasks, read profile, list sessions |
| `websocket-load.k6.js` | k6 | 10000 connections | Auth + WebSocket connect, receive events |
| `db-benchmark.js` | Node/Prisma | — | 9 query types at 1/5/10/25/50 concurrency |
| `redis-queue-benchmark.js` | Node/ioredis | — | 5 Redis ops + Bull queue at 1/10/50 concurrency |
| `browser-concurrent.py` | Python/aiohttp | 100 sessions | Register + create tasks + check sessions |

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `BASE_URL` | `http://localhost:4000` | Backend API URL |
| `WS_URL` | `ws://localhost:4000` | WebSocket URL |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `K6_BIN` | `k6` | k6 binary path |

## Thresholds

- API: failure rate < 5%, P95 latency < 2s for general, < 5s for tasks
- WebSocket: connection success > 90%, P95 connect time < 3s
- Browser sessions: 95%+ success rate
