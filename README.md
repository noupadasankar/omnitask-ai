<div align="center">

<img src="https://img.shields.io/badge/OmniTask-AI-6366f1?style=for-the-badge&logo=robot&logoColor=white" alt="OmniTask AI" />

# OmniTask AI

### _Personal Autonomous Agent Workforce_

**Give it a task in plain English. It opens the browser, does the work, stores everything, and reports back.**

[![CI](https://github.com/noupadasankar/omnitask-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/noupadasankar/omnitask-ai/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20-green.svg)](https://nodejs.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/noupadasankar/omnitask-ai/blob/main/CONTRIBUTING.md)

[Live Demo](https://omnitask.ai) · [Documentation](https://github.com/noupadasankar/omnitask-ai/blob/main/docs/README.md) · [Report Bug](https://github.com/noupadasankar/omnitask-ai/issues) · [Request Feature](https://github.com/noupadasankar/omnitask-ai/issues)

</div>

---

## What Is OmniTask AI?

OmniTask AI is a **production-grade autonomous agent platform** where you type a natural language command and a browser agent executes it completely — navigating websites, filling forms, extracting data, downloading files, and reporting results in real time.

Think of it as hiring a tireless digital employee who never sleeps, never makes typos, remembers everything it has ever done, and asks permission before taking risky actions.

```
You type:  "Apply to the top 5 remote TypeScript jobs on LinkedIn"

Agent does:
  1. Opens LinkedIn Jobs
  2. Searches "TypeScript remote"
  3. Filters by "Remote" and "Last 24 hours"
  4. For each job: reads description → generates tailored answer → clicks Apply
  5. Detects form submission → asks your approval (shows screenshot)
  6. You click Approve → agent submits
  7. Saves confirmation screenshots to your File Vault
  8. Reports: "5 applications submitted" with links to each job

Total time: ~4 minutes. Your involvement: 30 seconds (one approval click).
```

---

## Features at a Glance

| Feature                          | Description                                                               |
| -------------------------------- | ------------------------------------------------------------------------- |
| 🧠 **Natural Language Planning** | GPT-4o converts plain English to a validated, structured execution plan   |
| 🌐 **Browser Automation**        | Playwright executes any web task — navigate, click, type, extract, upload |
| 👁️ **Shadow Mode**               | Simulate the full plan dry-run before a single real click happens         |
| 🔐 **Approval Gates**            | CAPTCHA, login pages, and payment flows pause and ask for your approval   |
| 🧩 **Multi-Agent System**        | BrowserAgent, APIAgent, FileAgent, ResearchAgent, SupervisorAgent         |
| 🧬 **Memory System**             | Semantic search over past tasks — "do what I did last week for invoices"  |
| ⚡ **Skill Library**             | Repeated workflows auto-promote to one-click reusable automations         |
| 📁 **File Vault**                | Every screenshot, PDF, CSV, download — stored, versioned, searchable      |
| 📊 **Live Dashboard**            | Real-time WebSocket logs, React Flow execution graph, replay scrubber     |
| 🗓️ **Scheduling**                | Cron-based recurring tasks — daily job search, weekly reports             |
| 🔒 **Policy Engine**             | Per-domain allow/deny/require-approval rules you control                  |
| 📈 **Observability**             | Prometheus metrics, structured logs, OpenTelemetry traces                 |

---

## Tech Stack

```
┌─────────────────────────────────────────────────────────────────┐
│  FRONTEND      Next.js 14 + Tailwind + shadcn/ui + React Flow  │
│  BACKEND       NestJS (TypeScript) + Fastify adapter            │
│  AUTOMATION    Playwright (Chromium) — isolated per-user        │
│  AI            OpenAI GPT-4o (planning + repair + embeddings)   │
│  QUEUE         BullMQ on Redis — async execution + retries      │
│  DATABASE      PostgreSQL 16 + pgvector (memory/embeddings)     │
│  STORAGE       S3-compatible — MinIO (dev) / R2 (prod)         │
│  REALTIME      Socket.io — live logs, approvals, updates        │
│  MONITORING    Prometheus + Grafana + Loki                      │
│  INFRA         Docker Compose → VPS → Kubernetes               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
omnitask-ai/                    ← Turborepo monorepo
├── apps/
│   ├── backend/                ← NestJS API (12 domain modules)
│   ├── frontend/               ← Next.js 14 dashboard
│   └── worker/                 ← Standalone Playwright worker process
├── packages/
│   ├── shared-types/           ← Shared TypeScript types (no drift)
│   ├── ui/                     ← Design system tokens
│   └── config/                 ← Shared ESLint/TS configs
├── infra/
│   ├── docker/                 ← Postgres/Redis/MinIO configs
│   ├── nginx/                  ← Reverse proxy config
│   ├── k8s/                    ← Kubernetes manifests (Phase 5+)
│   ├── monitoring/             ← Prometheus/Grafana/Loki
│   └── scripts/                ← Deploy, backup, healthcheck
└── docs/                       ← Architecture, API, agents, deployment
```

---

## Quick Start

### Prerequisites

- **Node.js 20+** — [nodejs.org](https://nodejs.org)
- **Docker Desktop** — [docker.com](https://www.docker.com/products/docker-desktop)
- **pnpm 8+** — `npm install -g pnpm`
- **OpenAI API key** — [platform.openai.com](https://platform.openai.com/api-keys)

### 1. Clone

```bash
git clone https://github.com/noupadasankar/omnitask-ai.git
cd omnitask-ai
pnpm install
```

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

```env
OPENAI_API_KEY=sk-proj-...
JWT_SECRET=<run: openssl rand -base64 64>
JWT_REFRESH_SECRET=<run: openssl rand -base64 64>
```

### 3. Start

```bash
docker-compose up -d
```

### 4. Migrate Database

```bash
docker-compose exec backend npx prisma migrate deploy
docker-compose exec backend npx ts-node prisma/seed.ts   # optional dev seed
```

### 5. Open

| Service           | URL                                                |
| ----------------- | -------------------------------------------------- |
| **App**           | http://localhost:3000                              |
| **API**           | http://localhost:4000/api/v1                       |
| **Swagger**       | http://localhost:4000/api/docs                     |
| **MinIO Console** | http://localhost:9001 (minioadmin / minioadmin123) |

### 6. Run Your First Task

1. Register at http://localhost:3000
2. Press **⌘K** → type your task
3. Enable **Shadow Mode** to preview first
4. Hit **Run Task** and watch it execute live

---

## Development Commands

```bash
# Start all services
docker-compose up -d

# Live logs for all services
docker-compose logs -f

# Live logs for one service
docker-compose logs -f backend
docker-compose logs -f worker

# Restart a service (after code changes in non-hot-reload scenarios)
docker-compose restart backend

# Run all tests
docker-compose exec backend pnpm test

# Run E2E tests
docker-compose exec backend pnpm test:e2e

# Open Prisma Studio (database GUI)
docker-compose exec backend npx prisma studio

# Type check everything
pnpm turbo type-check

# Lint everything
pnpm turbo lint

# Reset dev database
docker-compose exec backend npx prisma migrate reset

# Generate Prisma client after schema change
docker-compose exec backend npx prisma generate
```

---

## Environment Variables

### Required

| Variable             | Description                         |
| -------------------- | ----------------------------------- |
| `OPENAI_API_KEY`     | OpenAI API key for GPT-4o           |
| `JWT_SECRET`         | Access token secret (min 32 chars)  |
| `JWT_REFRESH_SECRET` | Refresh token secret (min 32 chars) |

### Optional (have defaults)

| Variable             | Default                 | Description                |
| -------------------- | ----------------------- | -------------------------- |
| `PORT`               | `4000`                  | Backend port               |
| `POSTGRES_USER`      | `omnitask`              | DB username                |
| `POSTGRES_PASSWORD`  | `omnitask_secret`       | DB password                |
| `REDIS_URL`          | `redis://redis:6379`    | Redis URL                  |
| `S3_ENDPOINT`        | `http://minio:9000`     | S3 endpoint                |
| `WORKER_CONCURRENCY` | `3`                     | Concurrent browser workers |
| `FRONTEND_URL`       | `http://localhost:3000` | For CORS                   |

Full reference in `.env.example`.

---

## Architecture

OmniTask AI is built as a **modular monolith** (not microservices) with a separately deployed browser worker. This gives you clean module boundaries without the operational overhead of service discovery and distributed tracing — perfect for a solo developer.

```
User (Next.js) → NestJS API → BullMQ → Worker (Playwright)
                     ↓                       ↓
                PostgreSQL              S3 / MinIO
                + pgvector
                     ↓
                Socket.io → User (live updates)
```

Full architecture details in [docs/architecture.md](docs/architecture.md).

---

## Build Phases

| Phase                | Weeks | Milestone                                    |
| -------------------- | ----- | -------------------------------------------- |
| **1 — Foundation**   | 1–3   | Auth + Tasks + Browser + WebSocket live logs |
| **2 — Intelligence** | 4–6   | LLM planning + Approvals + Shadow Mode       |
| **3 — Resilience**   | 7–9   | Retry/recovery + Policy engine + Multi-agent |
| **4 — Memory**       | 10–12 | pgvector + Skills + Replay scrubber          |
| **5 — Launch**       | 13–16 | Scheduling + Billing + K8s + Beta            |

See [docs/roadmap.md](docs/roadmap.md) for the full checkable build checklist.

---

## Documentation

| Doc                                  | Description                                          |
| ------------------------------------ | ---------------------------------------------------- |
| [Architecture](docs/architecture.md) | System design, data flow, module boundaries, scaling |
| [API Reference](docs/api.md)         | All REST endpoints with request/response examples    |
| [Agents Guide](docs/agents.md)       | How agents work + how to add new agent types         |
| [Deployment](docs/deployment.md)     | VPS setup, SSL, Docker, Nginx, backups               |
| [Roadmap](docs/roadmap.md)           | Phase-by-phase build checklist                       |

---

## Contributing

This is a solo developer project. Community contributions are welcome in later phases.

Before contributing:

1. Read [CONTRIBUTING.md](CONTRIBUTING.md) — code style, PR process
2. Read [docs/architecture.md](docs/architecture.md) — understand WHY before changing HOW
3. Check existing issues before opening a new one

---

## Security

This system acts as the user — it can browse, click, fill forms, and submit on your behalf. Security is not optional.

- See [SECURITY.md](SECURITY.md) for the security model and vulnerability reporting
- Never commit `.env` files
- All credentials go through the Credential Vault, never stored in plaintext
- Agent actions go through the Policy Engine before execution

---

## License

MIT — use it, build on it, ship products with it.

See [LICENSE](LICENSE) for full text.

---

## Acknowledgments

Built with: NestJS · Next.js · Playwright · BullMQ · pgvector · OpenAI · shadcn/ui · React Flow · Turborepo

---

<div align="center">

**Built with obsession by a solo developer who needed this tool to exist.**

⭐ Star this repo if it helps you · 🐛 [Report bugs](https://github.com/noupadasankar/omnitask-ai/issues) · 💡 [Request features](https://github.com/noupadasankar/omnitask-ai/issues)

</div>

## Prerequisites

- Node.js 20+
- Docker & Docker Compose
- pnpm

## Development Setup

1. Clone the repository
2. Copy `.env.example` to `.env` and fill in values
3. Run `docker-compose up -d`
4. Run `pnpm install`
5. Run `pnpm db:push` to set up the database
6. Start dev servers: `pnpm dev`

## Environment Variables

See `.env.example` for required variables.
