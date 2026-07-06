<div align="center">

<img src="https://img.shields.io/badge/OmniTask-AI-6366f1?style=for-the-badge&logo=robot&logoColor=white" alt="OmniTask AI" />

# OmniTask AI

### _Cognitive Automation Platform_

**Describe a goal in plain English. AI agents open a real browser, execute every step, and report back — live.**

[![CI](https://github.com/noupadasankar/omnitask-ai/actions/workflows/deploy.yml/badge.svg)](https://github.com/noupadasankar/omnitask-ai/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20-green.svg)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB.svg)](https://python.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/noupadasankar/omnitask-ai/issues)

[Report Bug](https://github.com/noupadasankar/omnitask-ai/issues) · [Request Feature](https://github.com/noupadasankar/omnitask-ai/issues)

</div>

---

## What Is OmniTask AI?

OmniTask AI is a **production-grade autonomous agent platform** where you type a natural language goal and coordinated AI agents execute it in a real Chromium browser — navigating websites, filling forms, extracting data, streaming live screenshots, and asking permission before risky actions.

It ships with **12 domain agents** (job search, food ordering, shopping, travel, email, social media, finance, calendar, research, booking, media, file management), a **Cognitive OS** that detects when agents drift off-task, and a **memory system** that learns from every execution.

```
You type:  "Apply to the top 5 remote TypeScript jobs on LinkedIn"

Agent does:
  1. Parses your goal → routes to the Job domain agent
  2. Loads your resume + preferences from memory
  3. Opens LinkedIn Jobs in a real browser
  4. Searches "TypeScript remote", filters by Easy Apply
  5. For each job: reads description → matches against your profile → fills the form
  6. Detects form submission → pauses and asks your approval (shows live screenshot)
  7. You click Approve → agent submits
  8. Stores confirmation as a versioned artifact
  9. Reports: "5 applications submitted" with links and match scores

Total time: ~4 minutes. Your involvement: approval clicks.
```

---

## Features

| Feature | Description |
|---------|-------------|
| **Natural Language Planning** | LLM converts plain English to structured execution plans with risk assessment |
| **Live Browser Automation** | Playwright drives real Chromium — navigate, click, type, scroll, extract, upload |
| **Live Screenshot Streaming** | CDP screencast streams the browser viewport to your dashboard in real time |
| **Approval Gates** | Payment forms, login pages, application submissions, and sensitive fields pause for your approval |
| **6 Specialist Agents** | Browser, Vision, Data Extractor, Form Filler, Verifier, Orchestrator — each with dedicated LLM prompts |
| **12 Domain Agents** | Job, Food, Shopping, Travel, Email, Social, Finance, Calendar, Research, Booking, Media, File |
| **Cognitive OS** | World State tracking, trajectory drift detection, confidence network with abort/pause/warn gates |
| **Self-Healing** | Selector recovery, popup dismissal, workflow recovery, crash recovery with persistent browser profiles |
| **Memory System** | Episodic + semantic + procedural + working memory with pgvector embeddings and consolidation scheduler |
| **Shadow Mode** | Simulate the full plan without real browser actions |
| **Skill Library** | 8 site-specific plugins (LinkedIn, Naukri, Amazon, Zomato, etc.) with learned skill templates |
| **Take Control Mode** | Click into the live browser view and drive it yourself — mouse/keyboard forwarded in real time |
| **Scheduling** | Cron-based recurring tasks with daily limit enforcement |
| **Policy Engine** | Risk assessment (LOW→CRITICAL), compliance rules, per-tier rate limiting |
| **Credential Vault** | AES-256-GCM encrypted credential storage (PBKDF2, 600K iterations) |
| **Observability** | Prometheus metrics, Grafana dashboards, OpenTelemetry traces, Sentry error tracking |
| **GDPR Compliance** | Data export, deletion requests, retention policies, soft deletes |

---

## Tech Stack

```
┌──────────────────────────────────────────────────────────────────────┐
│  FRONTEND      Next.js 14  ·  Tailwind  ·  Radix UI  ·  Zustand    │
│  BACKEND       NestJS 11 (TypeScript)  ·  Express adapter           │
│  AUTOMATION    Playwright (Chromium) — persistent per-user profiles  │
│  AI (CLOUD)    Groq (llama-3.3-70b, free tier) · OpenRouter · OpenAI│
│  AI (LOCAL)    Ollama (qwen2.5:7b) — used by Python cognition engine│
│  QUEUE         BullMQ on Redis — async step execution + retries     │
│  DATABASE      PostgreSQL 16  ·  Prisma ORM  ·  pgvector embeddings │
│  STORAGE       MinIO (dev) — S3-compatible file storage              │
│  REALTIME      Socket.IO — live screenshots, approvals, telemetry   │
│  MONITORING    Prometheus  ·  Grafana  ·  OpenTelemetry  ·  Sentry  │
│  INFRA         Docker Compose  ·  Nginx + Let's Encrypt SSL         │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
omnitask-ai/                        ← pnpm + Turborepo monorepo
├── apps/
│   ├── backend/                    ← NestJS API server (42 modules, port 4000)
│   │   ├── src/
│   │   │   ├── agent/              ← Core brain: execution engine, 6 specialist agents,
│   │   │   │                         cognitive OS, runtime, stages, self-healing
│   │   │   ├── agent-registry/     ← 12 domain agents with canHandle() + buildGraph()
│   │   │   ├── auth/               ← JWT + Google OAuth + refresh token rotation
│   │   │   ├── common/             ← LLM client, embeddings, circuit breaker, logger,
│   │   │   │                         metrics, policy engine, rate limiting
│   │   │   ├── memory/             ← Episodic/semantic/procedural memory + consolidation
│   │   │   ├── queue/              ← BullMQ queues + agent-step processor
│   │   │   ├── websocket/          ← Socket.IO gateway + Python worker event relay
│   │   │   ├── skills/             ← 8 site-specific plugins (LinkedIn, Amazon, etc.)
│   │   │   ├── tasks/              ← Task CRUD + lifecycle
│   │   │   ├── planning/           ← LLM-based plan generation
│   │   │   └── ... (30+ more modules: billing, teams, vault, gdpr, voice, etc.)
│   │   └── prisma/schema.prisma   ← 50+ models, 28 enums
│   │
│   ├── frontend/                   ← Next.js 14 App Router (port 3000)
│   │   └── src/
│   │       ├── app/                ← ~80 page routes (auth + dashboard)
│   │       ├── components/         ← LiveBrowserView, ApprovalPanel, JobWizard,
│   │       │                         NeuralBrainCanvas (Three.js), AppShell
│   │       ├── hooks/              ← useAgentSession (813 lines, 50+ WS events)
│   │       ├── services/           ← 13 typed API services
│   │       └── store/              ← Zustand (auth, agent, runtime)
│   │
│   └── browser-py/                 ← Python Playwright engine (Redis job consumer)
│       ├── main.py                 ← Redis BRPOP loop + health server
│       ├── executor.py             ← Job execution + self-healing + crash recovery
│       ├── browser_manager.py      ← Persistent per-user Chromium profiles
│       ├── streamer.py             ← CDP screencast → Redis pub/sub
│       ├── ai.py                   ← Groq/OpenAI LLM client + vision decisions
│       ├── skills/                 ← 14 skill modules (research, shopping, job, etc.)
│       └── agents/                 ← 10 domain agents (job, social, email, shopping,
│                                     booking, food, calendar, finance, research, travel)
│
├── packages/
│   ├── config/                     ← Shared ESLint + Prettier (@omnitask/config)
│   └── shared-types/               ← Cross-app TypeScript types (@omnitask/shared-types)
│
├── infra/
│   ├── monitoring/                 ← Prometheus config + Grafana dashboards
│   ├── docker/                     ← Postgres/Redis/MinIO init configs
│   └── nginx/                      ← Reverse proxy configs
│
├── docker-compose.yml              ← Dev: PostgreSQL 16 + Redis 7
├── docker-compose.prod.yml         ← Prod: 12 services + monitoring + SSL
├── Makefile                        ← 14 dev convenience targets
└── scripts/
    ├── dev.mjs                     ← One-command stack launcher
    └── deploy.sh                   ← Production deploy script
```

---

## Quick Start

### Prerequisites

- **Node.js 20+** — [nodejs.org](https://nodejs.org)
- **pnpm 8+** — `npm install -g pnpm`
- **Python 3.10+** — [python.org](https://python.org)
- **Docker Desktop** — [docker.com](https://www.docker.com/products/docker-desktop)
- **Groq API key** (free) — [console.groq.com](https://console.groq.com) — or OpenAI/OpenRouter key

### 1. Clone and configure

```bash
git clone https://github.com/noupadasankar/omnitask-ai.git
cd omnitask-ai
cp .env.example .env
```

Edit `apps/backend/.env` and set at minimum:

```env
DATABASE_URL=postgresql://omnitask:omnitask_secret@localhost:5432/omnitask
REDIS_URL=redis://localhost:6379
JWT_SECRET=<run: openssl rand -hex 32>
GROQ_API_KEY=gsk_...
```

### 2. Start infrastructure

```bash
pnpm infra                 # Starts PostgreSQL + Redis in Docker
```

### 3. Install dependencies and set up database

```bash
pnpm install
pip install -r apps/browser-py/requirements.txt
python -m playwright install chromium
pnpm db:push               # Sync Prisma schema to database
```

### 4. Start the stack

```bash
pnpm stack                 # Starts backend + frontend + browser-py
```

Or run services individually:

```bash
pnpm dev:backend           # NestJS on :4000
pnpm dev:frontend          # Next.js on :3000
pnpm dev:browser-py        # Python engine (Redis consumer)
```

### 5. Open the dashboard

| Service | URL |
|---------|-----|
| **Dashboard** | http://localhost:3000 |
| **API** | http://localhost:4000/api |
| **Swagger** | http://localhost:4000/docs |
| **Health** | http://localhost:4000/api/health |

### 6. Run your first task

1. Register at http://localhost:3000/register
2. Type a goal in the command bar: _"Search for remote Node.js jobs on LinkedIn"_
3. Watch the agent execute live with screenshots streaming to your browser
4. Approve any sensitive actions when prompted

---

## Architecture

OmniTask AI uses a **dual execution path** — tasks can run in-process via the NestJS Playwright integration, or be dispatched to the standalone Python engine via Redis for heavier browser automation.

```
User (Next.js Dashboard)
    │
    ▼
NestJS API (planning, routing, orchestration)
    │
    ├──▶ Redis LPUSH "omnitask:py:jobs"  ──▶  browser-py (Playwright)
    │                                              │
    │                                              ▼
    │                                    Redis PUBLISH "omnitask:worker:events"
    │                                              │
    ├──────────────────────────────────────────────◀┘
    │
    ▼
Socket.IO ──▶ Dashboard (live screenshots, step progress, approvals)
    │
    ▼
PostgreSQL (tasks, plans, executions, memory, audit logs)
```

### Execution Flow

1. **Goal parsing** — LLM extracts task type, entities, constraints, ambiguity score
2. **Clarification** — If ambiguous (score > 0.6), asks the user follow-up questions
3. **Domain routing** — AgentRegistryService matches to one of 12 domain agents
4. **Plan building** — Domain agent builds an execution graph (parallel branches if multiple sites)
5. **Policy check** — Risk assessment (LOW/MEDIUM/HIGH/CRITICAL), compliance rules
6. **Automation gate** — Evaluates if approval is needed before browser launch
7. **Dispatch** — Python engine (default) or inline NestJS execution
8. **Step execution** — Each step: CPN confidence gate → browser action → vision validation → self-healing on failure
9. **Verification** — VerifierAgent scores result 0-100 (≥70 accept, 50-69 retry, <50 replan)
10. **Memory** — Stores execution episode, updates strategy + preference learning

---

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Access token secret (min 16 chars, 64+ hex in production) |

### Recommended

| Variable | Default | Description |
|----------|---------|-------------|
| `GROQ_API_KEY` | — | Primary LLM provider (free tier, recommended) |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `FRONTEND_URL` | `http://localhost:3000` | CORS origin |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENROUTER_API_KEY` | — | Fallback LLM provider |
| `OPENAI_API_KEY` | — | Fallback LLM + embeddings |
| `PORT` | `4000` | Backend listen port |
| `JWT_REFRESH_SECRET` | — | Refresh token secret (required in prod) |
| `CSRF_SECRET` | — | CSRF token secret (required in prod) |
| `VAULT_MASTER_KEY` | — | 64 hex chars for credential encryption |
| `STRIPE_SECRET_KEY` | — | Billing integration |
| `GOOGLE_CLIENT_ID` | — | Google OAuth |
| `SENDGRID_API_KEY` | — | Email sending |
| `SENTRY_DSN` | — | Error tracking |
| `LOG_LEVEL` | `info` | `fatal`/`error`/`warn`/`info`/`debug`/`trace` |

Full reference in `.env.example`.

---

## Development Commands

```bash
# Full stack (infra + all services)
pnpm stack

# Infrastructure only
pnpm infra                 # Start PostgreSQL + Redis
pnpm infra:down            # Stop infrastructure

# Individual services
pnpm dev:backend           # NestJS on :4000
pnpm dev:frontend          # Next.js on :3000
pnpm dev:browser-py        # Python engine

# Database
pnpm db:push               # Sync schema to DB (dev only)
pnpm db:generate           # Regenerate Prisma client
pnpm db:studio             # Open Prisma Studio GUI

# Quality
pnpm lint                  # ESLint across all packages
pnpm test                  # Run all tests

# Backend tests (needs extra memory)
cd apps/backend
NODE_OPTIONS="--max-old-space-size=6144" npx jest --forceExit --maxWorkers=1

# Frontend tests
cd apps/frontend
npx vitest
```

---

## Deployment

### Docker Compose (Production)

```bash
# Build and start all 12 services (app + monitoring + SSL)
docker compose -f docker-compose.prod.yml up -d
```

Production stack includes: frontend, backend, PostgreSQL, Redis (password-protected), worker, Nginx (SSL via Let's Encrypt + Certbot), Prometheus, Grafana, node-exporter, postgres-exporter, redis-exporter.

### Production Checklist

- [ ] Run `prisma migrate deploy` (never `db push` in prod)
- [ ] Set `NODE_ENV=production`
- [ ] Set strong `JWT_SECRET` (64+ hex chars)
- [ ] Set `JWT_REFRESH_SECRET`, `CSRF_SECRET`, `VAULT_MASTER_KEY`
- [ ] Configure `FRONTEND_URL` for CORS
- [ ] Run pgvector index creation post-deploy
- [ ] Configure Stripe webhook endpoint for billing
- [ ] Set up Sentry DSN for error tracking

### CI/CD

GitHub Actions pipeline (`.github/workflows/deploy.yml`):
1. **Lint** — ESLint on backend + frontend
2. **Test** — Jest + Vitest + pytest against Postgres/Redis service containers
3. **Build & Push** — Docker images to Docker Hub (on push to `main`)
4. **Deploy** — SSH to prod, pull images, run deploy script (on push to `main`)

---

## Security

This system acts as the user — it browses, clicks, fills forms, and submits on your behalf. Security is built into every layer:

- **Authentication** — JWT with refresh token rotation, Google OAuth, bcrypt hashing, timing-equalized login
- **CSRF** — Double-submit cookie with Bearer token bypass
- **Rate limiting** — Per-tier throttling (FREE: 30 req/min, ENTERPRISE: 500 req/min)
- **Credential vault** — AES-256-GCM encryption (PBKDF2 SHA-512, 600K iterations)
- **Approval gates** — Payment forms, login pages, application submissions pause for user confirmation
- **Agent firewalls** — Hard block on credit card, SSN, CVV fields; passwords never auto-filled
- **Browser stealth** — navigator.webdriver override, fake Chrome object, plugin spoofing
- **Policy engine** — Per-action risk assessment with compliance rule evaluation
- **Audit logging** — Every sensitive operation recorded
- **Soft deletes** — GDPR-compliant data lifecycle
- **Input validation** — class-validator (global) + Zod (per-endpoint)
- **Security headers** — Helmet, HSTS, X-Frame-Options, X-Content-Type-Options

Never commit `.env` files. All credentials must go through the vault or environment variables.

---

## Contributing

Contributions are welcome. Before contributing:

1. Check existing issues before opening a new one
2. Read `CLAUDE.md` for architecture details and conventions
3. Run `npx tsc --noEmit` — zero errors before submitting a PR
4. Run tests — test count must not decrease

---

## License

MIT — use it, build on it, ship products with it.

See [LICENSE](LICENSE) for full text.

---

## Acknowledgments

Built with: [NestJS](https://nestjs.com) · [Next.js](https://nextjs.org) · [Playwright](https://playwright.dev) · [Prisma](https://prisma.io) · [BullMQ](https://bullmq.io) · [pgvector](https://github.com/pgvector/pgvector) · [Groq](https://groq.com) · [Radix UI](https://radix-ui.com) · [Tailwind CSS](https://tailwindcss.com) · [Socket.IO](https://socket.io) · [Turborepo](https://turbo.build)

---

<div align="center">

**Built with obsession by a solo developer who needed this tool to exist.**

</div>
