# Changelog — OmniTask AI

> All notable changes to this project are documented here.
> Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
> Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Planned for v1.1.0

- EmailAgent — Gmail/Outlook automation via OAuth2
- Voice task creation — Web Speech API integration
- Chrome Extension — inject agent context into active tab
- Mobile app foundation — React Native with shared Zustand stores

---

## [1.0.0] — 2025-01-15 — Initial Production Release

### Summary

First full production release. All five phases complete. The system can autonomously execute browser tasks, generate plans with GPT-4o, approve risky actions, store artifacts, and recall past behavior via semantic memory.

### Added

#### Core System

- Turborepo monorepo with three deployable apps: `backend`, `frontend`, `worker`
- Docker Compose stack with 6 services: PostgreSQL 16 (pgvector), Redis 7, MinIO, backend, worker, frontend
- Shared types package (`@omnitask/shared-types`) eliminating frontend/backend type drift
- Production Docker Compose with resource limits and internal network isolation

#### Backend (NestJS + Fastify)

- **Auth module** — JWT access/refresh tokens, bcrypt hashing, Google OAuth2, GitHub OAuth, MFA stub
- **Users module** — Profile management, preferences (theme, timezone, notification settings), quota enforcement
- **Tasks module** — Full CRUD, status tracking, pagination, filtering, statistics endpoint
- **Planning module** — GPT-4o plan generation, Zod schema validation, SHA-256 plan hashing, plan caching, plan repair on validation failure
- **Execution module** — State machine (QUEUED→PLANNING→RUNNING→DONE/FAILED), step executor, checkpoint save/resume, compensation service, circuit breaker, retry with exponential backoff
- **Browser module** — Playwright Chromium pool, per-user isolated contexts, anti-detection (navigator.webdriver evasion), resource blocking, screenshot service, DOM snapshot service, CAPTCHA detector
- **Files module** — S3/MinIO upload, presigned URL generation, file deduplication via SHA-256, metadata storage
- **Approvals module** — Human-in-the-loop gate, WebSocket-based approval flow, 10-minute expiry auto-deny
- **Memory module** — pgvector storage, OpenAI ada-002 embeddings, cosine similarity retrieval, episodic/semantic/working memory layers, memory pruner
- **Agents module** — IAgent interface, AgentRegistry, AgentRouter, BrowserAgent, APIAgent, FileAgent, ResearchAgent, DataAgent, NotificationAgent, SupervisorAgent
- **Skills module** — Skill candidate detection (planHash reuse tracking), confidence scoring, one-click promotion, skill invocation with overrides, versioning
- **Scheduler module** — node-cron integration, cron expression parser, schedule CRUD, run history
- **Policies module** — Policy engine with built-in block rules, user-configurable allow/deny/require-approval rules, domain matching with wildcard support
- **Billing module** — Stripe integration, subscription management, usage tracking, quota enforcement, webhook handling
- **Notifications module** — Email templates (task complete, failed, approval required), push notification stub
- Shared: BullMQ queue setup with 4 queues (tasks, planning, memory, notifications), Socket.io WebSocket gateway with JWT auth, Redis cache service, Prometheus metrics, health controller, OpenTelemetry tracing stub

#### Frontend (Next.js 14)

- App Router with route groups: `(auth)` and `(dashboard)`
- Command Center — natural language input with shadow mode toggle, character count, submission
- Dashboard — stats cards (total/done/failed/running, success rate), recent tasks list
- Execution Room — React Flow graph of plan steps, live node coloring via WebSocket, click-to-screenshot
- Execution Log — real-time Socket.io log stream, auto-scroll, level filtering (info/success/warn/error)
- Approval Modal — full-screen gate with screenshot, risk indicator, approve/deny buttons, countdown timer
- File Vault — grid/list toggle, image preview, PDF viewer, semantic search
- Memory Search — semantic query UI, similarity scores, one-click reuse
- Skills Library — skill cards, candidate promotion UI, usage stats, one-click invocation
- Schedules — cron expression builder, human-readable preview, run history
- Settings — profile, API keys management, policy editor, billing (connected to Stripe)
- Zustand stores: auth, tasks, execution, approvals, notifications, ui, websocket
- CommandPalette (⌘K) — search tasks, quick shortcuts, voice input (Web Speech API)
- ThemeProvider — dark/light mode, system preference detection

#### Worker Process

- Standalone NestJS app (no HTTP server, BullMQ consumer only)
- Playwright browser lifecycle management
- Shadow task processor (read-only dry-run mode)
- Cleanup processor (delete expired screenshots, orphaned files)
- Prometheus metrics endpoint
- Health check endpoint (for K8s liveness/readiness probes)

#### Infrastructure

- GitHub Actions CI/CD: lint, type-check, test, security scan, Docker build/push
- Nginx configuration with rate limiting and security headers
- Kubernetes manifests with HPA for worker scaling
- Prometheus + Grafana + Loki observability stack
- Scripts: deploy.sh, backup-db.sh, restore-db.sh, healthcheck.sh

#### Documentation

- `README.md` — Quick start, tech stack, architecture overview
- `ARCHITECTURE.md` — Complete system design with diagrams and decision rationale
- `CONTRIBUTING.md` — Code standards, PR process, agent contribution guide
- `SECURITY.md` — Threat model, security layers, vulnerability reporting
- `CHANGELOG.md` — This file
- `docs/architecture.md` — Deep-dive system architecture
- `docs/api.md` — Full REST + WebSocket API reference
- `docs/agents.md` — Agent system and how to add new agents
- `docs/deployment.md` — VPS deployment, SSL, Nginx, backups
- `docs/roadmap.md` — Phase-by-phase build checklist

### Database Schema

Initial schema with models: User, UserPreferences, UserQuota, OAuthAccount, Session, Task, Plan, Execution, ExecutionStep, Approval, Memory, Skill, File, Schedule, AuditLog, Notification

### Security

- JWT with refresh token rotation
- bcrypt password hashing (12 rounds)
- AES-256-GCM credential encryption
- Plan validation (Zod schema rejects hallucinated actions)
- Policy engine with built-in BLOCK rules for banking/payment domains
- Browser context isolation per user
- Immutable audit log
- Rate limiting (100 req/min general, 10 req/min auth endpoints)

---

## [0.5.0-beta] — 2024-11-20 — Memory & Skills Beta

### Added

- pgvector integration with episodic, semantic, and working memory layers
- Memory retrieval and context injection into GPT-4o planning prompts
- Skill candidate auto-detection based on plan hash reuse
- Skill confidence scoring: `successCount / (successCount + failCount)`
- Skill promotion UI and one-click invocation
- Replay scrubber — timeline slider with screenshots at each step
- Shadow mode with risk classification per step (safe/mutation/destructive)
- ShadowDiff component — side-by-side before/after visualization
- Memory search page with semantic query UI

### Changed

- Planning service now injects top-5 similar past plans as context (improved plan quality ~40%)
- Execution engine now saves checkpoints every step (enables reliable resume)
- Screenshot frequency reduced from every step to every 5 steps + failure + approval (50% storage reduction)

### Fixed

- Browser context not properly released after task failure (memory leak in long-running deployments)
- Approval expiry not emitting WebSocket event to unblock UI
- PlanHasher canonical serialization inconsistency when plan contained arrays

---

## [0.4.0-beta] — 2024-09-15 — Resilience & Multi-Agent

### Added

- RetryService with exponential backoff (attempts: 3, delays: 2s → 4s → 8s)
- CompensationService — undo completed steps in reverse on task failure
- CircuitBreakerService — per-user domain circuit breaker (5 failures → 5min block)
- CheckpointService — resume failed task from last successful step
- BrowserAgent, APIAgent, FileAgent, ResearchAgent as distinct injectable services
- AgentRegistry and AgentRouter for automatic step → agent routing
- PolicyEngine with domain wildcard matching and priority ordering
- DOM snapshot capture on step failure (for debugging)
- PlanRepairService — LLM suggests alternative selectors when step fails
- Executive summary generation after task completion

### Changed

- ExecutionService refactored to use AgentOrchestrator instead of direct Playwright calls
- Task status machine now has AWAITING_APPROVAL state between PLANNING and RUNNING
- Worker now emits heartbeat to Redis every 30s (enables stall detection)
- BrowserPool now implements lazy context creation (no browser launch until first task)

### Fixed

- Race condition where two workers could pick the same BullMQ job (fixed via BullMQ job locking)
- WebSocket disconnection during approval flow could leave task permanently paused (added auto-expire)
- Playwright page.close() not called on task failure (fixed in finally block)

---

## [0.3.0-beta] — 2024-07-10 — LLM Planning + Approvals

### Added

- PlanningService with GPT-4o, Zod validation, plan hashing, plan caching
- IntentClassifier — GPT-3.5 based pre-classification (cheap, fast)
- AmbiguityResolver — prompts user for clarification when task is unclear
- RiskScorer — calculates risk score per step and aggregate plan risk
- CaptchaDetector — detects hCaptcha, reCAPTCHA, Cloudflare challenges
- ApprovalsService with WebSocket-based approval flow
- ApprovalModal frontend component with screenshot, countdown timer, approve/deny
- Shadow mode execution — read-only browser run showing predicted clicks
- Plan validation with few-shot examples in system prompt
- Plan repair — 2 self-repair attempts before failing

### Changed

- Task creation now triggers planning pipeline before queuing for execution
- All browser actions now emit real-time WebSocket log events
- Frontend ExecutionRoom now shows React Flow graph of actual plan

### Removed

- Hardcoded Playwright test scripts (replaced by dynamic LLM-generated plans)

---

## [0.2.0-alpha] — 2024-05-05 — File Storage + Live Logs

### Added

- MinIO integration with automatic bucket creation on startup
- FilesService with upload, presigned URL, metadata storage
- Screenshot service — captures and uploads every 5 steps
- WebSocket gateway with JWT authentication and user rooms
- Real-time log stream in frontend (Socket.io)
- File Vault page with image/PDF preview
- Task detail page with step-by-step timeline

### Changed

- Worker process separated from backend API (previously inline)
- BullMQ jobs now emit WebSocket events on each step start/completion

### Fixed

- Worker crashing when Playwright browser disconnected unexpectedly

---

## [0.1.0-alpha] — 2024-03-01 — Foundation

### Added

- Turborepo monorepo structure
- Docker Compose with PostgreSQL, Redis, MinIO, Backend, Frontend, Worker
- NestJS backend with Fastify adapter
- JWT authentication (register, login, refresh, logout)
- Basic task CRUD (create, list, get, cancel)
- Hardcoded Playwright script (navigate to Hacker News, screenshot)
- BullMQ task queue with Redis
- Next.js 14 frontend with App Router
- Basic dashboard with task list
- Task creation form

---

## Versioning Policy

**MAJOR** (x.0.0): Breaking API changes, database schema migrations requiring manual steps, fundamental architecture changes

**MINOR** (0.x.0): New features, new endpoints, new agent types, new UI pages — backward compatible

**PATCH** (0.0.x): Bug fixes, security patches, dependency updates — backward compatible

## Upgrade Guide

### Upgrading to v1.0.0 from 0.5.0-beta

1. Pull latest code
2. Run database migration: `npx prisma migrate deploy`
3. New required env vars: `STRIPE_SECRET_KEY`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`
4. Rebuild Docker images: `docker-compose build`
5. Restart: `docker-compose up -d`

No breaking API changes from 0.5.0-beta to 1.0.0.

---

_For older release notes, see the git history._
