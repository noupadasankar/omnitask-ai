# OmniTask AI — Senior Developer Project Audit

> Written from a senior architect perspective after reading the full CLAUDE.md and project documentation.  
> Date: 2026-07-08

---

## Table of Contents

1. [Project Summary](#1-project-summary)
2. [Full Folder & File Structure with Purpose](#2-full-folder--file-structure-with-purpose)
3. [What Every Key File Does](#3-what-every-key-file-does)
4. [Data Flow — End to End](#4-data-flow--end-to-end)
5. [What Is Good (Strengths)](#5-what-is-good-strengths)
6. [What Is Bad (Weaknesses & Risks)](#6-what-is-bad-weaknesses--risks)
7. [Technical Debt — Prioritized](#7-technical-debt--prioritized)
8. [Security Audit](#8-security-audit)
9. [Performance Bottlenecks](#9-performance-bottlenecks)
10. [Senior Dev Recommendations](#10-senior-dev-recommendations)

---

## 1. Project Summary

OmniTask AI is a **cognitive browser automation platform**. Users type a goal in natural language ("apply to 10 backend jobs on LinkedIn") and the system autonomously plans, executes, and verifies each action in a real browser.

### Technology Stack at a Glance

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 App Router, Zustand, Radix UI, Tailwind CSS, Socket.IO client |
| Backend | NestJS 11, REST + WebSocket (Socket.IO), BullMQ, Prisma ORM |
| Database | PostgreSQL 16 + pgvector extension |
| Cache / Queue | Redis 7 (BullMQ + pub/sub + in-memory state) |
| Browser Engine | Python + Playwright (Chromium) |
| LLM | Groq (primary), OpenRouter (fallback), OpenAI (fallback), local Ollama |
| Monorepo | pnpm + Turborepo |
| Infra | Docker Compose (dev), Docker Compose (prod 12 services), GitHub Actions CI/CD |

### Ports
- Frontend: `3000`
- Backend: `4000`
- Python engine: `8000`
- PostgreSQL: `5432` (default)
- Redis: `6379` (default)

---

## 2. Full Folder & File Structure with Purpose

```
omnitask-ai/
│
├── apps/
│   ├── backend/                    # NestJS API — the main brain
│   │   └── src/
│   │       ├── main.ts             # Bootstrap: OpenTelemetry, Sentry, security stack
│   │       ├── app.module.ts       # Registers 42 feature modules
│   │       ├── config/
│   │       │   └── env.validation.ts  # Zod schema — crashes app on missing required env
│   │       │
│   │       ├── agent/              # CORE EXECUTION ENGINE (most complex module)
│   │       │   ├── browser-agent.service.ts     # Playwright bridge — 21 browser actions
│   │       │   ├── vision-agent.service.ts      # Screenshot analysis, blocker detection
│   │       │   ├── data-extractor-agent.service.ts  # DOM → structured data
│   │       │   ├── form-agent.service.ts        # Form field detection + autofill
│   │       │   ├── verifier-agent.service.ts    # Step success validation (0-100 score)
│   │       │   ├── multi-agent-coordinator.service.ts  # Orchestrates agent roles
│   │       │   ├── planner-agent.service.ts     # LLM → execution plan
│   │       │   ├── execution-pipeline.service.ts    # 8-stage pipeline runner
│   │       │   ├── cognitive-circuit-breaker.service.ts  # Pre-step safety gates
│   │       │   ├── cognitive-os.service.ts      # World state + drift + CPN
│   │       │   ├── runtime/                     # Stage implementations
│   │       │   │   ├── stages/
│   │       │   │   │   ├── goal-planning.stage.service.ts
│   │       │   │   │   ├── policy-check.stage.service.ts
│   │       │   │   │   ├── automation-gate.stage.service.ts
│   │       │   │   │   ├── worker-dispatch.stage.service.ts
│   │       │   │   │   ├── step-execution.stage.service.ts
│   │       │   │   │   ├── verification.stage.service.ts
│   │       │   │   │   ├── memory.stage.service.ts
│   │       │   │   │   └── reflection.stage.service.ts
│   │       │   ├── tools/                       # Agent tool implementations
│   │       │   ├── message-bus/                 # Inter-agent communication
│   │       │   └── prompts/
│   │       │       └── agent-prompts.ts         # All LLM prompt templates
│   │       │
│   │       ├── agent-registry/     # Domain routing (12 domain agents)
│   │       │   ├── agent-registry.service.ts    # canHandle() → DomainAgent lookup
│   │       │   └── agents/
│   │       │       ├── job-domain.agent.ts
│   │       │       ├── food-domain.agent.ts
│   │       │       ├── shopping-domain.agent.ts
│   │       │       ├── travel-domain.agent.ts
│   │       │       ├── research-domain.agent.ts
│   │       │       ├── social-domain.agent.ts
│   │       │       ├── email-domain.agent.ts
│   │       │       ├── media-domain.agent.ts
│   │       │       ├── booking-domain.agent.ts
│   │       │       ├── finance-domain.agent.ts
│   │       │       ├── file-domain.agent.ts
│   │       │       └── calendar-domain.agent.ts
│   │       │
│   │       ├── auth/               # Auth system
│   │       │   ├── auth.controller.ts           # /auth/* routes
│   │       │   ├── auth.service.ts              # Login, register, refresh, OAuth
│   │       │   ├── jwt.strategy.ts              # Passport JWT validation
│   │       │   ├── google.strategy.ts           # Passport Google OAuth
│   │       │   ├── guards/
│   │       │   │   ├── jwt-auth.guard.ts
│   │       │   │   └── roles.guard.ts           # RBAC via @Roles()
│   │       │   └── password.validator.ts        # 8-128 chars, complexity rules
│   │       │
│   │       ├── common/             # Shared utilities
│   │       │   ├── llm/
│   │       │   │   └── llm.service.ts           # Groq→OpenRouter→OpenAI fallback chain
│   │       │   ├── embedding/
│   │       │   │   └── embedding.service.ts     # Local MiniLM or OpenAI embeddings
│   │       │   ├── circuit-breaker/
│   │       │   │   └── circuit-breaker.service.ts  # CLOSED/OPEN/HALF_OPEN state machine
│   │       │   ├── guards/
│   │       │   ├── pipes/
│   │       │   │   └── zod-validation.pipe.ts
│   │       │   ├── filters/
│   │       │   │   └── all-exceptions.filter.ts  # Never leaks stack traces
│   │       │   ├── logger/
│   │       │   │   └── pino-logger.service.ts   # Structured JSON, redacts secrets
│   │       │   ├── metrics/
│   │       │   │   └── prometheus.service.ts    # 5 custom metrics
│   │       │   └── policy/
│   │       │       └── policy.service.ts        # Risk scoring (LOW/MED/HIGH/CRITICAL)
│   │       │
│   │       ├── memory/             # Unified memory subsystem
│   │       │   ├── memory.service.ts            # CRUD + text search + cursor pagination
│   │       │   ├── memory-consolidation.service.ts  # Hourly decay, daily prune
│   │       │   ├── episodic-memory.service.ts   # Execution episodes
│   │       │   ├── semantic-memory.service.ts   # Facts + contradiction detection
│   │       │   ├── procedural-memory.service.ts # Workflows with trigger patterns
│   │       │   ├── session-context.service.ts   # Active session working memory
│   │       │   └── preference-memory.service.ts # Per-user domain preferences
│   │       │
│   │       ├── tasks/              # Task lifecycle
│   │       │   ├── tasks.controller.ts          # GET/POST /tasks, cancel
│   │       │   └── tasks.service.ts             # CRUD, QUEUED→COMPLETED lifecycle
│   │       │
│   │       ├── queue/              # BullMQ wiring
│   │       │   ├── queue.module.ts              # 4 queues: tasks, agent-steps, files, failed
│   │       │   └── processors/
│   │       │       └── agent-step.processor.ts  # 5 named handlers per agent type
│   │       │
│   │       ├── execution/          # Execution session management
│   │       ├── execution-service/  # Orchestrates ExecutionPipelineService
│   │       ├── planning/           # LLM plan generation from NL
│   │       │
│   │       ├── websocket/          # Real-time layer
│   │       │   ├── agent.gateway.ts             # Socket.IO /agent namespace, JWT auth
│   │       │   ├── worker-event-relay.service.ts  # Redis→WebSocket bridge
│   │       │   └── handlers/
│   │       │       ├── step.handler.ts
│   │       │       ├── interaction.handler.ts
│   │       │       └── data.handler.ts
│   │       │
│   │       ├── event-bus/
│   │       │   └── execution-event-bus.service.ts  # 50+ typed events → Socket.IO
│   │       │
│   │       ├── vault/
│   │       │   └── vault.service.ts             # AES-256-GCM credential encryption
│   │       │
│   │       ├── billing/            # Stripe subscription
│   │       ├── teams/              # Team CRUD + invitations
│   │       ├── gdpr/               # Data export + deletion + retention
│   │       ├── voice/              # STT (Groq Whisper) + TTS (ElevenLabs/OpenAI)
│   │       ├── calendar/           # Google/Outlook calendar sync
│   │       ├── email/              # Gmail/Outlook/SMTP sending
│   │       ├── media/              # YouTube/Spotify stubs
│   │       ├── food/               # Restaurant search, recipes, orders
│   │       ├── travel/             # Flight/hotel stubs
│   │       ├── shopping/           # Product scoring, price tracking
│   │       ├── job/                # Job matching, resume storage
│   │       ├── social/             # LinkedIn/Twitter stubs
│   │       ├── digital-twin/       # Versioned artifact store
│   │       ├── learning/           # Per-site performance tracking
│   │       ├── feedback/           # Task ratings
│   │       ├── ab-testing/         # Strategy A/B with z-score significance
│   │       ├── plugins/            # 8 site plugins (LinkedIn, Zomato, Amazon, etc.)
│   │       ├── skills/             # 8 domain skill templates
│   │       ├── training/           # QLoRA fine-tuning trajectory export
│   │       ├── admin/              # System admin (ADMIN/SUPERADMIN only)
│   │       ├── users/              # User profile CRUD (5-min cache TTL)
│   │       ├── session/            # In-memory session state machine
│   │       ├── places/             # Google Places + Yelp
│   │       ├── idempotency/        # Duplicate request guard (24h TTL)
│   │       ├── cache/              # Cache-manager + circuit breaker
│   │       ├── audit/              # Fire-and-forget audit logging
│   │       ├── webhook/            # HMAC-SHA256 signed outbound webhooks
│   │       ├── health/             # /health (liveness) + /health/ready (readiness)
│   │       ├── prisma/             # PrismaService (@Global, pg driver adapter)
│   │       └── shared/             # Cross-module interfaces, constants, DTOs
│   │
│   ├── frontend/                   # Next.js 14 App Router
│   │   └── src/
│   │       ├── app/
│   │       │   ├── (auth)/         # Login, register, forgot-password, OAuth callback
│   │       │   └── (dashboard)/    # Auth-guarded, AppShell layout
│   │       │       ├── dashboard/  # Main command center + live browser view
│   │       │       ├── tasks/      # CRUD + detail (logs/replay/approvals/screenshots)
│   │       │       ├── agents/     # Agent list + detail (logs/memory/metrics)
│   │       │       ├── workflows/  # CRUD + templates + analytics
│   │       │       ├── analytics/  # Usage, costs, tokens, agents
│   │       │       ├── memory/     # Embeddings, semantic-search, vector-store
│   │       │       ├── health/     # Runtime, queues, workers, websocket, DB
│   │       │       ├── approvals/  # Pending/approved/rejected approval management
│   │       │       ├── execution/  # History, schedules, replay
│   │       │       ├── settings/   # Profile, API keys, billing, vault, voice, team
│   │       │       ├── admin/      # User management, logs, policies
│   │       │       └── jobs/email/media/monitor/
│   │       │
│   │       ├── components/
│   │       │   ├── LiveBrowserView.tsx      # 760 lines — RAF rendering, "Take Control"
│   │       │   ├── NeuralBrainCanvas.tsx    # 929 lines — Three.js 6100-node brain
│   │       │   ├── JobWizardModal.tsx       # 764 lines — 4-step job launch wizard
│   │       │   ├── Sidebar.tsx              # 293 lines — collapsible nav
│   │       │   ├── ApprovalPanel.tsx        # 179 lines — countdown + keyboard shortcuts
│   │       │   ├── ExecutionTimeline.tsx    # Auto-scrolling step timeline
│   │       │   ├── ExecutionReplay.tsx      # Frame-by-frame replay, 0.5x-4x speed
│   │       │   └── ClarificationModal.tsx  # Numbered Q&A modal
│   │       │
│   │       ├── stores/
│   │       │   ├── auth.store.ts            # User + loading, JWT in localStorage
│   │       │   ├── agent.store.ts           # 333 lines — full session + 37 actions
│   │       │   └── runtime.store.ts         # Connected flag, sidebar state
│   │       │
│   │       ├── hooks/
│   │       │   └── useAgentSession.ts       # 813 lines — subscribes to 50+ WS events
│   │       │
│   │       └── services/
│   │           ├── api.ts                   # Axios + CSRF + 401 refresh queue
│   │           └── [13 domain services]     # auth, task, agent, job, voice, vault...
│   │
│   └── browser-py/                 # Python Playwright engine
│       ├── main.py                 # 382 lines — Redis BRPOP loop + health server
│       ├── executor.py             # 708 lines — Job dispatch + step execution
│       ├── browser_manager.py      # 321 lines — Per-user Chromium profiles
│       ├── dom.py                  # 57 lines — Interactive DOM extraction
│       ├── streamer.py             # 193 lines — CDP screencast → Redis
│       ├── ai.py                   # 199 lines — LLM client (Groq/OpenAI)
│       ├── events.py               # 88 lines — Redis event publisher
│       ├── input_control.py        # 146 lines — Remote mouse/keyboard forwarding
│       ├── skills/                 # 14 canonical skills (research, job, shopping...)
│       └── agents/
│           ├── job_agent/          # ~60 files — Full job application cognition
│           │   ├── task_agent.py   # 565 lines — observe→reason→act→verify→learn
│           │   ├── memory.py       # LongMemory + SelectorMemory + VectorMemory
│           │   ├── resume_parser.py  # 415 lines — PDF/DOCX parser
│           │   ├── portals/
│           │   │   ├── linkedin.py   # 651 lines — Easy Apply multi-step
│           │   │   ├── naukri.py     # 560 lines
│           │   │   ├── instahyre.py  # 590 lines
│           │   │   ├── hirist.py     # 459 lines
│           │   │   └── cutshort.py   # 404 lines
│           │   └── llm_clients/
│           │       ├── local_llm.py  # Ollama / llama-cpp-python
│           │       └── model_registry.py  # GGUF tracking, SHA-256 integrity
│           ├── booking_agent/      # 1291 lines — OpenTable, Booking, Ticketmaster
│           ├── calendar_agent/     # 1195 lines — Google Calendar, Outlook
│           ├── email_agent/        # 652 lines — Gmail, Outlook
│           ├── finance_agent/      # 652 lines — SBI, HDFC, PayTM, GooglePay
│           ├── food_agent/         # 1214 lines — DoorDash, UberEats, Yelp
│           ├── research_agent/     # 688 lines — Google, Bing, 5-source synthesis
│           ├── shopping_agent/     # 893 lines — Amazon, eBay, Walmart
│           ├── social_agent/       # 852 lines — Twitter/X, LinkedIn
│           └── travel_agent/       # 1030 lines — Flights, Kayak, Booking.com
│
├── packages/
│   ├── config/                     # Shared ESLint + Prettier (@omnitask/config)
│   └── shared-types/               # Cross-app TypeScript types (@omnitask/shared-types)
│
├── scripts/
│   ├── dev.mjs                     # Stack launcher — starts all 3 services
│   ├── deploy.sh                   # Prod: stop → rebuild → start (NO ROLLBACK)
│   └── loadtest/                   # Load testing scripts
│
├── infra/
│   ├── k8s/                        # Kubernetes SCAFFOLDED ONLY — not implemented
│   ├── monitoring/
│   │   ├── prometheus.yml          # Scrapes backend + node/postgres/redis exporters
│   │   └── grafana/                # 7-panel dashboard config
│   ├── docker/                     # Redis/Postgres/MinIO init configs
│   └── nginx/
│       └── nginx.conf              # Prod: SSL, rate limiting, WS proxy, gzip
│
├── docker-compose.yml              # Dev: PostgreSQL + Redis + Worker
├── docker-compose.prod.yml         # Prod: 12 services + nginx + certbot + monitoring
├── turbo.json                      # Turborepo task pipeline
├── pnpm-workspace.yaml             # Workspace definition
├── Makefile                        # 14 convenience targets
├── vercel.json                     # Frontend Vercel config
└── .github/
    └── workflows/
        └── deploy.yml              # Lint → Test → Build+Push → Deploy (SSH)
```

---

## 3. What Every Key File Does

### Backend — Critical Files

| File | Purpose | Criticality |
|------|---------|-------------|
| `main.ts` | Bootstraps NestJS in exactly this order: OpenTelemetry → Sentry → Pino logger → secret validation → `/api` prefix → Helmet → body parser → CSRF → CORS → ValidationPipe → ExceptionFilter → EtagInterceptor → Swagger. Order matters — changing it breaks security. | CRITICAL |
| `app.module.ts` | Imports all 42 modules. Single registration point. Missing a module here = dead service, no error until runtime. | CRITICAL |
| `env.validation.ts` | Zod schema that validates all env vars at startup. In dev, warns. In prod, throws and crashes app. Fail-fast pattern. | CRITICAL |
| `execution-pipeline.service.ts` | The 8-stage pipeline. Every task runs through this. Any bug here affects every execution. | CRITICAL |
| `agent.gateway.ts` | WebSocket gateway. JWT auth on connection. Handles pause/resume/cancel/approval/clarification. Bridges Redis pub/sub to browser clients. | CRITICAL |
| `worker-event-relay.service.ts` | Redis → WebSocket bridge. Python publishes events, this service routes them to clients via Socket.IO. The glue between NestJS and Python. | CRITICAL |
| `memory-consolidation.service.ts` | Runs hourly (decay) + daily 3AM (prune). If this crashes, memory bloats forever. | HIGH |
| `llm.service.ts` | Provider cascade: Groq → OpenRouter → OpenAI. Token cost tracking. Circuit breaker integration. The single LLM access point for all of NestJS. | HIGH |
| `vault.service.ts` | AES-256-GCM with PBKDF2 600K iterations. Stores credentials. If master key is lost, all stored credentials are unrecoverable. | HIGH |
| `policy.service.ts` | Classifies browser actions by risk. Gates HIGH/CRITICAL actions to user approval. Foundational for safe automation. | HIGH |

### Python — Critical Files

| File | Purpose | Criticality |
|------|---------|-------------|
| `main.py` | Redis BRPOP loop (5s timeout). Health HTTP server on :8000. Heartbeat key `PY_ALIVE_KEY` with 10s TTL. If this crashes, all browser automation stops silently. | CRITICAL |
| `executor.py` | Dispatches jobs to skills/agents, runs step execution, self-healing (max 2 recoveries), crash recovery. The equivalent of NestJS's execution pipeline, in Python. | CRITICAL |
| `browser_manager.py` | Per-user Chromium profiles with 750MB quota, 30-min idle eviction, GC loop. Memory leak risk if GC loop fails. | HIGH |
| `streamer.py` | CDP `Page.startScreencast` → Redis pub/sub. If this falls behind, users see stale screenshots. Falls back to 500ms interval screenshots. | HIGH |
| `task_agent.py` | The JobAgent's observe→reason→act→verify→learn loop. Most complex Python file (565 lines). Cache-first selector lookup, confidence gate, critic LLM, approval gate. | HIGH |
| `resume_parser.py` | PDF (pdfplumber/PyPDF2) + DOCX parser. Extracts 40+ skills, experience years (3-tier detection). Used by all job portals. | MEDIUM |

### Frontend — Critical Files

| File | Purpose | Criticality |
|------|---------|-------------|
| `useAgentSession.ts` | 813-line hook. Subscribes to 50+ WebSocket events. Drives the entire live session UI. Any event subscription missed here = feature missing in UI. | CRITICAL |
| `agent.store.ts` | 333-line Zustand store. Holds ALL session state (phase, screenshots, timeline, approvals, cognitive OS telemetry, routing). Single source of truth for the UI. | CRITICAL |
| `LiveBrowserView.tsx` | 760 lines. RAF rendering loop using refs (not React state) for performance. "Take Control" mouse/keyboard forwarding. Crash recovery UI. Most performance-critical component. | CRITICAL |
| `api.ts` | Axios instance. CSRF cookie handling. 401 refresh queue that serializes concurrent 401s to prevent token refresh storms. If the queue logic breaks → infinite 401 loops. | HIGH |
| `auth.store.ts` | Stores JWT in localStorage. Auto-fetches user on module load. | HIGH |
| `NeuralBrainCanvas.tsx` | 929 lines. Three.js scene: 6100 nodes, spatial hash, bloom pass. Hero animation. Performance-sensitive on low-end GPUs. | MEDIUM |

---

## 4. Data Flow — End to End

### Step 1: User types a goal
```
Frontend: user types "apply to 10 backend jobs on LinkedIn"
  → POST /api/agent/start-goal
  → JwtAuthGuard passes → TierThrottlerGuard checks rate → IdempotencyGuard dedupes
```

### Step 2: Goal parsing
```
GoalUnderstandingService.parseGoal()
  → LLM (llama-3.3-70b) → ParsedGoal { taskType, entities, constraints, ambiguityScore }
  → if ambiguityScore > 0.6: ClarificationGateService polls Redis every 2s (5min timeout)
     → WebSocket: 'clarification:required' → ClarificationModal shown to user
```

### Step 3: Planning
```
PlanOrchestratorService.buildExecutionPlan()
  → AgentRegistryService.resolve() → JobDomainAgent.canHandle() → true
  → JobDomainAgent.buildGraph() → PluginRegistryService → LinkedInSkill.buildPlan()
  → ExecutionGraphService.mergeBranchPlans()
  → StrategyMemoryService.recallStrategies() → past successful strategies injected
  → PreferenceMemoryService.getPreferences() → preferred portals injected
```

### Step 4: Policy + Gate
```
PolicyEngineService.checkPlan() → APPROVED (job application = HIGH risk)
AutomationGateService.evaluate() → proceed (or: approval_needed, simulation, adapter)
```

### Step 5: Dispatch
```
WorkerDispatcherService.dispatch()
  → LPUSH to Redis list 'omnitask:py:jobs'
  → Python main.py BRPOP picks it up
  → executor.py routes to job skill → JobAgent (LinkedIn portal)
```

### Step 6: Browser execution (Python)
```
TaskAgent.observe→reason→act→verify→learn loop:
1. Screenshot → Playwright CDP screencast → Redis pub/sub → Frontend LiveBrowserView
2. DOM extraction (dom.py) → 60 visible nodes → LLM decides next action
3. Action executed (click/type/scroll) via Playwright
4. VisionAgent validates completion (before/after screenshot compare)
5. SelfHealing if failure (up to 2 recoveries)
6. Events published to 'omnitask:worker:events'
```

### Step 7: NestJS routes events to frontend
```
WorkerEventRelayService subscribes to 'omnitask:worker:events'
  → Routes: screenshot → 'screenshot:frame', step complete → 'execution:step:completed'
  → AgentGateway emits to all sockets in room sessionId
  → Frontend useAgentSession.ts receives → updates agent.store.ts
  → React renders: LiveBrowserView, ExecutionTimeline, ApprovalPanel
```

### Step 8: Approval gate (if triggered)
```
Python detects HIGH risk action (e.g., "Submit Application")
  → Publishes 'approval_required' to 'omnitask:worker:events'
  → WorkerEventRelay stores in Redis 'omnitask:approval:{sessionId}:{stepIndex}' (300s TTL)
  → Frontend: 'approval:requested' → ApprovalPanel shown (countdown timer)
  → User clicks Approve → POST /api/agent/approval/:id/respond
  → Redis key updated → Python polls (events.py) → resumes
```

### Step 9: Memory & Reflection
```
MemoryStage: EpisodicMemoryService stores execution episode (quality 0.85 success)
           + StrategyMemoryService updates strategy effectiveness
           + PreferenceMemoryService: if ≥3 successes + ≥75% → mark portal as preferred

ReflectionStage (async): SelfReflectionService → negative_invariants (failed selectors)
                        → optimal_shortcuts (successful paths)
                        → stored in Memory table with pgvector embeddings
```

---

## 5. What Is Good (Strengths)

### Architecture & Design

**1. The 8-Stage Execution Pipeline is brilliant**
The pipeline has clean separation of concerns. Each stage is a separate service (GoalPlanningStage, PolicyCheckStage, etc.) with its own `run()` method. The `ExecutionContext` object carries state across stages. Easy to test, easy to insert new stages. This is production-grade design.

**2. Cognitive OS is genuinely novel**
The CPN (Confidence Propagation Network) using log-space weighted geometric mean of 8 confidence sources (planner, DOM sensor, vision, drift, WSO, verifier, strategy, policy) is real ML-influenced engineering. The drift detection using EMA on embeddings with phase-specific thresholds (research=0.40, transaction=0.85) shows deep domain thinking.

**3. The LLM fallback cascade (Groq → OpenRouter → OpenAI) is resilient**
Circuit breaker per provider. The system can degrade gracefully if Groq is down. This prevents total failures during LLM outages.

**4. Security is comprehensive**
- CSRF double-submit (64-byte token)
- PBKDF2 600K iterations for vault (higher than OWASP minimum)
- Timing-equalized login (prevents user enumeration)
- SHA-256 hashed refresh tokens (DB leak doesn't reveal tokens)
- Token rotation on refresh (prevents replay)
- Force-logout on password reset
- Hard-block for CC/SSN/CVV fields (never auto-filled)
- AES-256-GCM for credential vault

**5. Memory architecture is thoughtful**
4-tier memory (EPISODIC/SEMANTIC/PROCEDURAL/WORKING) mirrors cognitive science. Hourly decay (×0.95) + daily consolidation + pgvector cosine similarity for retrieval. The contradiction detection in SemanticMemoryService prevents conflicting facts from coexisting.

**6. Agent firewalls are safety-critical and correct**
`hard_block()` in task_agent.py unconditionally rejects credit-card/SSN/CVV fields. Approval gates for all financial, login-credential, and application-submit actions. This is the right design for a system that autonomously controls a browser.

**7. Self-healing is systematic, not just retry**
Priority-ordered recovery: Navigation → Popup dismiss → Selector recovery (vision ≥ 0.6) → Workflow recovery → Navigation + recovery steps → Best-confidence fallback. Not just "retry" — it's a decision tree.

**8. Per-user persistent browser profiles are the right approach**
Chromium profiles per-user with 750MB quota and 30-min idle eviction. Sessions feel stateful. Users stay logged in across tasks. The GC loop prevents disk runaway.

**9. pgvector integration is smart dependency reduction**
Using PostgreSQL with pgvector instead of a separate vector DB (Pinecone, Weaviate) keeps the stack lean. One fewer moving part. The `Float[] in Prisma but vector(1536) in DB` pattern is necessary and is documented.

**10. Training data pipeline is a real competitive moat**
The trajectory export to ChatML JSONL for QLoRA fine-tuning is a serious production feature. Most automation platforms discard execution data. OmniTask learns from it. This compounds over time.

**11. Real-time architecture is correct**
WebSocket + Redis pub/sub bridge is the right pattern. NestJS subscribes to `omnitask:worker:events`, Python publishes to it. Clean decoupling between the two runtimes. The `LiveBrowserView` using RAF with refs (not React state) is the right performance choice for high-frequency screenshot updates.

**12. Approval gates are complete and thoughtful**
The 300-second Redis TTL on approval keys + countdown timer in UI + keyboard shortcuts (Enter/Escape) is a complete, user-safe approval flow.

**13. Observability stack is solid**
Prometheus + Grafana + OpenTelemetry + Pino structured logging covers the full observability triangle (metrics, traces, logs). 5 custom metrics are domain-relevant (queue depth, active connections, DB query duration).

**14. A/B testing with z-score significance**
Having statistical significance testing built into strategy evaluation (not just "which strategy has more runs") is a data-science-level feature. This prevents falsely promoting lucky strategies.

---

## 6. What Is Bad (Weaknesses & Risks)

### Critical Issues

**1. Python process death is invisible to users and to NestJS**
`PY_ALIVE_KEY` has a 10-second TTL. If `main.py` crashes, NestJS has no automatic detection or failover — jobs just pile up in the Redis list silently. There is no supervisor process (systemd/supervisord), no `restart: always` in `docker-compose.yml` for the Python service. Tasks will silently queue forever with no user feedback.

**RISK: CRITICAL** — Every live execution fails silently if Python dies.

**2. JWT stored in localStorage**
`auth.store.ts` stores the JWT in localStorage. This makes the token vulnerable to XSS. If any component, dependency, or injected content runs JavaScript, the token is stolen. The backend uses httpOnly cookies for refresh tokens (correct) but the access token in localStorage defeats the CSRF protection purpose.

**RISK: HIGH** — XSS = session hijack.

**3. 33 failing test cases are core tests, not cosmetic**
The `ExecutionEngineService` constructor mismatch affecting 33 tests means the execution engine's DI contract is broken. These are not cosmetic tests — they test the core pipeline. Running CI with 33 known failures means the test suite cannot be trusted to catch regressions in the most critical code.

**RISK: HIGH** — Broken tests give false confidence in the core pipeline.

**4. `deploy.sh` has no rollback and no health check gate**
`scripts/deploy.sh` does a simple `git pull → rebuild → restart`. No rollback, no atomic swap, no health check before cutting traffic. If a bad build reaches production, the only recovery is a manual `git revert` + re-deploy. During the build window, the service is down.

**RISK: HIGH** — Zero-downtime deploys are not possible. Bad deploy = site down until manual fix.

**5. Redis has no persistence configuration mentioned**
Redis is used for: BullMQ queues, pub/sub, approval keys, clarification keys, healing keys, session state, selector cache, heartbeat. If Redis restarts without persistence (no `appendonly yes`, no RDB), all in-flight jobs, pending approvals, and active clarifications are lost. The docker-compose configs don't show any persistence settings.

**RISK: HIGH** — Redis restart during task execution = silent data loss.

**6. Memory OOM in the test suite is a design smell**
Jest requiring 6GB RAM (`--max-old-space-size=6144`) for 54 spec files is not normal. It means services are loading too much in test context (entire DB clients, real Redis connections, full module graphs). This will fail on standard GitHub Actions runners (2-7GB RAM). Your CI is fragile.

**RISK: MEDIUM** — CI cannot run reliably on standard cloud runners.

### Architecture Issues

**7. 42 modules all initialize at startup — no lazy loading**
Media stubs, GDPR, A/B testing, training — all start their services at boot even if unused. NestJS doesn't lazy-load by default. This makes cold start slow (estimated 5-10 seconds in prod) and increases base memory footprint significantly.

**8. Circular dependencies (8 forwardRef remaining)**
`forwardRef` is a code smell in NestJS. 4 intentional `AgentModule ↔ ToolsModule` cycles are documented — but circular module graphs are fragile. Each one makes initialization order unpredictable and tests harder to isolate.

**9. Domain service stubs are invisible to users**
Media (YouTube/Spotify), Travel (flights/hotels), and some Shopping results are hardcoded stubs. The architecture presents these as real features. Users hitting these get fake data with no indication it's not real. This is a user-trust risk beyond just tech debt.

**10. pgvector type mismatch between Prisma and DB is a trap for new developers**
`Memory.embedding` is `Float[]` in Prisma but `vector(1536)` in the actual DB. Any developer who runs `prisma migrate` without knowing this convention will corrupt the embedding column. The convention is documented in CLAUDE.md but not enforced in code.

**11. No rate limiting on WebSocket connections or messages**
`agent.gateway.ts` uses JWT auth on connect but there's no rate limit on WebSocket messages. A single authenticated user can flood the gateway with `browser:input` mouse move events, overwhelming Redis pub/sub. The HTTP `TierThrottlerGuard` doesn't apply to WebSocket frames.

**12. Browser stealth is insufficient against modern bot detection**
`STEALTH_JS` hides `navigator.webdriver` and fakes `window.chrome`. LinkedIn and Amazon use behavioral analysis (mouse movement patterns, timing, scroll velocity, canvas fingerprinting) that isn't addressed. This will be caught by PerimeterX, DataDome, and Cloudflare Turnstile on high-volume runs.

**13. Python and NestJS retry budgets are independent, creating retry storms**
Python tries to recover 2 times (`_MAX_RECOVERIES=2`). NestJS's `RetryManagerService` retries 3 times. If Python's executor recovers twice and still fails, NestJS may retry the whole dispatch 3 more times, causing the Python engine to attempt 6 total healing cycles. No coordinated retry budget between the two systems.

**14. Audit logging is fire-and-forget — not suitable for compliance**
`audit.service.ts` logs are non-blocking. In a GDPR audit or security incident, you need guaranteed delivery. Fire-and-forget means audit logs can be silently lost under load. This is a compliance liability.

**15. `EmbeddingService` runs synchronously on the NestJS event loop**
Local MiniLM embedding generation is a CPU-bound task. Running it synchronously in a NestJS handler blocks the event loop for the duration of the embedding computation. Under any load, this degrades API response times across the entire backend.

### Frontend Issues

**16. NeuralBrainCanvas (929 lines, Three.js) runs on the main thread**
6100 nodes, spatial hash, white matter tracts, and UnrealBloomPass run on the main JavaScript thread. On low-end devices or when the execution pipeline is flooding the UI with WebSocket events, this causes jank. Should be moved to a Web Worker with OffscreenCanvas.

**17. `useAgentSession.ts` is 813 lines — unmaintainable as a single file**
50+ event subscriptions in one hook. When one event handler has a bug, you're debugging 813 lines. Event handlers for completely unrelated domains (browser input, cognitive OS telemetry, approval flow) share the same scope and closure.

**18. Screenshots accumulate 7-15MB in Zustand memory per session**
`screenshotHistory` is capped at 50 frames. At 150-300KB each (base64 JPEG), that's 7.5-15MB in a Zustand store. No explicit cleanup on session end. If users run multiple sessions in a browser tab (SPA), this accumulates.

---

## 7. Technical Debt — Prioritized

| Priority | Issue | Effort | Impact |
|----------|-------|--------|--------|
| P0 | Fix Python process death — add `restart: always` to docker-compose + NestJS `PY_ALIVE_KEY` monitor | Small | Prevents silent task failures |
| P0 | Fix 33 failing ExecutionEngine tests | Medium | Restores test suite reliability |
| P1 | Move JWT to httpOnly cookie (eliminate localStorage storage) | Medium | Eliminates XSS session hijack vector |
| P1 | Add Redis persistence (`appendonly yes` + `save 60 1`) | Small | Prevents data loss on restart |
| P1 | Add health-check gate + rollback to deploy.sh | Medium | Prevents site downtime on bad deploy |
| P2 | Split `useAgentSession.ts` into domain-specific sub-hooks | Large | Maintainability |
| P2 | Add `isolatedModules: true` globally in ts-jest config | Small | Fixes test OOM, enables CI on standard runners |
| P2 | Return 501 Not Implemented for stub services (media, travel) | Small | User-trust |
| P2 | Add WebSocket message rate limiting (per-user budget) | Medium | DoS prevention |
| P2 | Move embedding generation to a worker thread or queue | Medium | Prevents event loop blocking |
| P3 | Move NeuralBrainCanvas to Web Worker + OffscreenCanvas | Large | Performance on low-end devices |
| P3 | Resolve remaining 8 forwardRef circular dependencies | Large | Module graph clarity |
| P3 | Add coordinated retry budget between Python and NestJS | Medium | Prevents retry storms |
| P4 | Audit log guaranteed delivery (queue-backed, not fire-and-forget) | Medium | GDPR compliance |
| P4 | K8s manifests (infra/k8s/ is scaffolded only) | Large | Production scalability |

---

## 8. Security Audit

### What's Right
- CSRF double-submit cookie (64-byte token, sameSite:strict, secure in prod) ✅
- Helmet security headers ✅
- AES-256-GCM vault with PBKDF2 SHA-512, 600K iterations ✅
- Timing-equalized login (prevents user enumeration) ✅
- SHA-256 hashed refresh tokens in DB ✅
- Token rotation on refresh (old session deleted) ✅
- Force-logout on password reset ✅
- Hard-block for CC/SSN/CVV in task_agent.py ✅
- Input validation (class-validator + Zod, global ValidationPipe) ✅
- No stack trace leaks (AllExceptionsFilter) ✅
- RBAC with @Roles() decorator ✅
- Idempotency guard prevents replay attacks ✅
- Rate limiting per billing tier ✅
- Secrets redacted in Pino logs ✅
- HMAC-SHA256 signed outbound webhooks ✅
- Correlation ID on every request ✅

### What's Risky
- **JWT in localStorage** — XSS target. Must move to httpOnly cookie. HIGH
- **No WebSocket rate limiting** — authenticated users can flood. MEDIUM
- **Browser stealth insufficient** — behavioral fingerprinting unaddressed. MEDIUM
- **Fire-and-forget audit logs** — compliance liability under GDPR audits. MEDIUM
- **Redis without persistence** — in-flight approval/job data lost on restart. HIGH
- **K8s network policies absent** — infra/k8s/ is scaffolded only. LOW (not in prod yet)
- **VAULT_MASTER_KEY loss = total credential loss** — no documented key rotation or escrow. HIGH
- **`_MAX_RECOVERIES` in Python is env-configurable** — misconfiguration can loop indefinitely at wrong values. LOW

---

## 9. Performance Bottlenecks

### Database
- pgvector cosine distance (`<=>`) on `Memory` table degrades without hnsw/ivfflat indexes. Hand-written migrations must ensure these exist — no automated check enforces this.
- No connection pooling (PgBouncer) mentioned. NestJS + 42 modules + Prisma under real traffic will exhaust PostgreSQL's default connection limit (100).
- `Memory` table will grow unboundedly without the consolidation job running. If consolidation fails silently, query performance degrades over time.

### Redis
- All screenshot frames flow through Redis pub/sub as JPEG strings. At 60 quality, each frame is ~20-50KB. With 10 concurrent users streaming screenshots = 200-500KB/s continuous through Redis. Redis is single-threaded. This is the primary bottleneck at scale.
- BullMQ + pub/sub + approval keys + clarification keys + selector cache + heartbeat all share one Redis instance with no logical separation.

### Backend
- 42 modules all initialize at startup → slow cold start (estimated 5-10 seconds).
- `MemoryConsolidationService` runs hourly on the same process as request handling. Large memory tables → long-running consolidation → potential GC pressure on NestJS event loop.
- `EmbeddingService` with local MiniLM generates embeddings synchronously — CPU-bound operation in the async event loop.

### Python
- Per-user Chromium profiles: up to 750MB each × concurrent users. 10 concurrent users = potential 7.5GB disk pressure.
- CDP screencast is CPU-intensive. `streamer.py` shares a process with `executor.py`. High-frequency screencasts during complex pages = CPU contention within the same Python process.
- `task_agent.py` makes 2-3 LLM calls per step (reason + critic + verify). At 30 steps per task, that's 60-90 LLM calls per task. Groq free tier limits will be hit quickly under load.

### Frontend
- `NeuralBrainCanvas` (6100 Three.js nodes + bloom pass) on main thread.
- 50+ WebSocket event subscriptions in a single closure.
- Screenshots in Zustand: up to 15MB of base64 strings in memory.
- `ExecutionTimeline` and `logs` are not virtualized (500 DOM nodes cap — still heavy without virtualization).

---

## 10. Senior Dev Recommendations

### Immediate (This Week)

**1. Add `restart: always` to Python in docker-compose and monitor PY_ALIVE_KEY**
```yaml
# docker-compose.yml
browser-py:
  restart: always
```
And in NestJS, add a health check that watches `PY_ALIVE_KEY`:
```typescript
// health.service.ts
const alive = await redis.get('PY_ALIVE_KEY')
if (!alive) emit('worker:unavailable') to all active sessions
```
This is 30 minutes of work that prevents the most visible production failure.

**2. Fix the 33 failing tests before any new feature work**
Mark these as P0. Every new feature added while the execution engine tests are broken creates hidden regression risk. Fix the constructor mismatch first — it's a DI configuration issue, not a logic rewrite.

**3. Add Redis persistence**
```
# redis.conf
appendonly yes
appendfsync everysec
save 60 1
```
Five minutes to add, prevents job loss on every Redis restart.

**4. Mark stub endpoints honestly**
For every stubbed service (media, travel, some shopping), return:
```json
{ "status": 501, "message": "This feature is coming soon" }
```
This is better than returning fake data silently.

### Short Term (This Month)

**5. Move JWT access token to httpOnly cookie**
This eliminates the XSS session hijack surface. The CSRF protection you built is most effective when the JWT itself is also in a cookie. Pattern:
- Access token: httpOnly + SameSite=Strict + Secure cookie (15 min TTL)
- Refresh token: httpOnly + SameSite=Strict + Secure + `/auth/refresh` path cookie
- CSRF token: readable cookie for double-submit

**6. Blue/green deploy or health-checked cutover**
Minimum viable: before restarting nginx, poll `/api/health/ready` until 200. If not ready in 60s, restore previous build. Shell script, no k8s needed:
```bash
# deploy.sh
git pull && docker compose build backend && docker compose up -d backend
until curl -f http://localhost:4000/api/health/ready; do sleep 2; done
echo "healthy — cutting traffic"
```

**7. Split `useAgentSession.ts` into focused hooks**
- `useBrowserEvents()` — screenshot, navigation, DOM, network events
- `useCognitiveOsEvents()` — drift, CPN gate, world state
- `useApprovalFlow()` — approval requested/resolved
- `useSessionLifecycle()` — session phase transitions, pause/resume/cancel

Each hook is independently testable and debuggable.

**8. Add `isolatedModules: true` to ts-jest globally**
```json
// jest.config.ts
globals: {
  'ts-jest': { isolatedModules: true }
}
```
Cuts test RAM from 6GB to ~1-2GB. Enables standard CI runners.

### Medium Term (This Quarter)

**9. Screenshot streaming via dedicated channel, not Redis**
Redis pub/sub for video-rate screenshots is the wrong architecture. Consider:
- Option A: WebRTC data channel from Python directly to frontend (lowest latency, most complex)
- Option B: Dedicated WebSocket connection from Python streamer to a NestJS SSE endpoint (simpler)
- Option C: MinIO/S3 for screenshots + signed URLs (lowest bandwidth, acceptable latency for ~1s updates)

**10. PgBouncer in transaction mode**
Add PgBouncer in `docker-compose.prod.yml` between NestJS and PostgreSQL. This multiplexes dozens of NestJS connections into a small Postgres connection pool. Required before any meaningful traffic.

**11. Coordinate Python + NestJS retry budgets**
Add a `maxRetries` field to the job payload pushed to Redis. Python decrements it on each recovery attempt and refuses to retry when zero. NestJS reads the remaining budget from the job result before deciding to re-dispatch.

**12. Behavioral browser stealth**
Beyond `navigator.webdriver`:
- Mouse movement: Bezier curve paths between points (not straight lines)
- Scroll: velocity ramp-up/ramp-down, not instant jumps
- Type: per-character timing variance with occasional typo+correction
- Consider using `rebrowser-patches` or `puppeteer-extra-plugin-stealth` equivalents for Playwright

### Long Term (Next 6 Months)

**13. Fine-tune a small model on your trajectory data**
The `training/` module exports ChatML JSONL. Build a fine-tuning loop:
- Weekly: export last N successful trajectories → QLoRA fine-tune Llama 3.1 8B → evaluate on held-out tasks → promote if better
- Deploy the fine-tuned model as `PY_LLM_MODEL` for the cognition loop
- This reduces Groq API calls (cost) and improves domain performance (accuracy)

**14. Real K8s manifests**
The `infra/k8s/` directory is scaffolded but empty. For true horizontal scaling:
- Backend: Deployment (3 replicas) + HPA on CPU + PodDisruptionBudget
- Python: StatefulSet (per-user profiles need stable storage) + PVC per pod
- Redis: Redis Sentinel or Redis Cluster
- PostgreSQL: CloudNativePG operator or managed (RDS, Cloud SQL)

**15. The A/B testing → strategy promotion loop should be automatic**
You have z-score significance testing. Wire it to:
- Automatically promote strategies with p < 0.05 to `strategy_memory` as preferred
- Automatically retire strategies after 30 days without a win
- This makes the system genuinely self-improving without human intervention

---

## Summary Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Architecture Design | 9/10 | 8-stage pipeline + Cognitive OS is genuinely impressive engineering |
| Security | 8/10 | Comprehensive, but JWT in localStorage is a real gap |
| Code Quality | 7/10 | Well-structured modules, but 42 eager-loads + 8 forwardRef + 33 failing tests |
| Testing | 5/10 | 688 test cases but 33 core failures, 6GB RAM requirement |
| Observability | 8/10 | Prometheus + Grafana + OpenTelemetry + Pino is a solid production stack |
| Reliability | 6/10 | Python death invisible, Redis no persistence, no rollback in deploy |
| Scalability | 5/10 | Single Redis, no PgBouncer, Docker Compose prod, K8s only scaffolded |
| Developer Experience | 8/10 | CLAUDE.md is exceptional, Makefile, Turborepo, pnpm workspaces |
| Feature Completeness | 6/10 | Job, food, shopping real. Media, travel, social are stubs |
| Innovation | 10/10 | CPN, drift detection, trajectory fine-tuning, cognitive OS — rare in a side project |

**Overall: 7.2/10**

This is a serious, architecturally thoughtful platform with genuine innovation in the Cognitive OS layer. The CPN confidence network and drift-based goal tracking are not things you see in typical automation projects. The gaps are entirely operational — not design flaws. Fix Python process death detection (P0), the 33 failing tests (P0), JWT storage (P1), and Redis persistence (P1), and this becomes a production-ready system.

The training data flywheel (trajectory → QLoRA fine-tune → deploy) is the highest-value long-term investment. If executed, it creates a compounding advantage: more tasks → better model → more successful tasks → more data.

---

*Senior developer audit — OmniTask AI codebase — July 2026*

---

---

# PART 2 — FILE STRUCTURE DEEP DIVE: What Every File/Folder Uses and WHY

> This section explains every directory and file: what technology it uses, why that technology was chosen over alternatives, and what would break if it were removed.

---

## MONOREPO ROOT

### `pnpm-workspace.yaml`
**What it uses:** pnpm workspaces  
**Why pnpm over npm/yarn:** pnpm uses a content-addressable store with hard links — installs are 3-5x faster and use 60-80% less disk than npm because packages are not duplicated per project. In a monorepo with `apps/backend` + `apps/frontend` sharing packages like `@omnitask/shared-types`, pnpm avoids installing the same dependency twice. Yarn workspaces would work but pnpm's strict isolation (no phantom dependencies) catches import errors earlier.  
**What breaks without it:** Each app would need its own `package.json` + `node_modules`. Shared types in `packages/shared-types` couldn't be imported by both apps without publishing to npm.

---

### `turbo.json`
**What it uses:** Turborepo task runner  
**Why Turborepo:** Turborepo adds a build cache and dependency-aware task pipeline on top of pnpm workspaces. When you run `pnpm build`, Turborepo knows that `apps/frontend` depends on `packages/shared-types` being built first — it enforces that order. It also caches build outputs: if `packages/config` hasn't changed, it skips rebuilding it. This makes CI 2-4x faster.  
**Why not Nx/Lerna:** Turborepo has zero config overhead and works natively with pnpm. Nx requires more setup. Lerna is deprecated.  
**What breaks without it:** Build order becomes manual. CI has to build everything every time. Shared package changes won't trigger dependent app rebuilds automatically.

---

### `docker-compose.yml` (Development)
**What it uses:** Docker Compose v3, PostgreSQL 16 Alpine, Redis 7 Alpine  
**Why these versions:**
- PostgreSQL 16: adds logical replication improvements and query planning enhancements. pgvector extension is well-supported on 16.
- Redis 7: introduces Redis Functions (replaces Lua scripting) and better ACL support. BullMQ requires Redis 5+; version 7 gives headroom.
- Alpine images: ~50MB vs ~400MB for full Debian images. Acceptable for dev.

**Why separate dev compose:** Dev only needs infrastructure (Postgres + Redis). App code runs via `pnpm dev` locally for hot-reload. Running the app inside Docker in dev kills HMR and makes debugging harder.  
**What breaks without it:** Developers need to install PostgreSQL and Redis locally. Version mismatches cause hard-to-debug schema or connection errors.

---

### `docker-compose.prod.yml` (Production — 12 services)
**What it uses:** Docker Compose, Nginx 1.27, Certbot, Prometheus v2.52, Grafana v11, node-exporter, postgres-exporter, redis-exporter  
**Why Nginx over direct exposure:**
- Nginx handles SSL termination (TLS 1.2/1.3 via Certbot/Let's Encrypt). The NestJS app serves plain HTTP internally — Nginx adds HTTPS.
- Rate limiting at the reverse proxy layer (10r/s general, 30r/s API) before requests reach Node.js. This protects against DDoS without NestJS consuming resources.
- WebSocket `proxy_read_timeout 86400` (24h): browser automation sessions can run for hours. Without this, Nginx would kill WebSocket connections after 60 seconds (default).
- Gzip compression level 6: reduces JSON payload sizes ~70% for API responses.

**Why Certbot:** Free SSL via Let's Encrypt. 12-hour renewal loop (certbot docker) handles certificate rotation automatically.  
**Why exporters (node-exporter, postgres-exporter, redis-exporter):** Prometheus can't scrape OS metrics, PostgreSQL internal stats, or Redis keyspace info directly. Each exporter translates native metrics into Prometheus format. This is the standard sidecar pattern.  
**What breaks without it:** No SSL (browsers block WebSocket connections over ws:// on HTTPS pages). No monitoring. Manual certificate renewal.

---

### `Makefile`
**What it uses:** GNU Make with 14 phony targets  
**Why a Makefile:** Make is universally available on Linux/Mac. It's a single source of truth for "how do I run this project" — better than a README with copy-paste commands. `make setup` chains `install + infra + db` in the right order. New developers don't need to know the underlying commands.  
**Why not a shell script or npm scripts:** Make targets are self-documenting (`make help`), composable, and don't require Node.js to be installed first. npm scripts require Node.js — which you might not have yet during initial setup.  
**What breaks without it:** Nothing technically breaks. Developer onboarding is slower.

---

### `.github/workflows/deploy.yml`
**What it uses:** GitHub Actions, Docker Buildx, SSH deploy  
**Why 4 jobs (Lint → Test → Build+Push → Deploy):**
- **Lint first:** fastest check, catches most common errors in <2 minutes. Fails fast before running 15-minute tests.
- **Test with service containers:** GitHub Actions spins up a real PostgreSQL 16 + Redis 7 for tests. This catches DB migration issues and Redis connection errors that mocks would miss.
- **Docker Buildx:** enables multi-platform builds (amd64/arm64) and build caching via GitHub Actions cache. Without Buildx, each build downloads all layers from scratch.
- **SSH deploy (not k8s):** The production server is a single VPS (current scale). SSH + git pull is the simplest deploy that works. The concurrency group `production-deploy` prevents two deploys running simultaneously.

**Why Dependabot on 4 ecosystems:** github-actions, npm backend, npm frontend, pip browser-py — each has separate vulnerabilities. Grouping by ecosystem lets you review related updates together. Weekly schedule prevents PR flood.  
**What breaks without it:** Manual deploys. No automated security updates. PRs merged without tests passing.

---

## `packages/`

### `packages/config/` — `@omnitask/config`
**What it uses:** Shared ESLint config, shared Prettier config  
**Why a shared package:** ESLint and Prettier rules defined once, consumed by `apps/backend` and `apps/frontend` as `"extends": "@omnitask/config/eslint"`. Without this, rules drift between apps — backend might allow `any` while frontend forbids it.  
**Why not put rules in root:** Turborepo's caching operates per-package. Separate config package means lint cache is invalidated only when rules change, not when app code changes.

---

### `packages/shared-types/` — `@omnitask/shared-types`
**What it uses:** TypeScript type declarations only (no runtime code)  
**Why shared types exist:** The frontend calls backend REST APIs and receives WebSocket events. Both sides need the same TypeScript types for `Task`, `ExecutionStep`, `AgentStatus`, etc. Without shared types, frontend and backend can silently diverge — backend adds a field, frontend doesn't know it exists.  
**Why TypeScript types only (no runtime):** Runtime code in shared packages creates dependency chains. If shared-types imported `prisma`, the frontend would need to bundle Prisma. Types are erased at compile time — zero runtime cost.  
**What breaks without it:** Frontend and backend types diverge silently. `any` creeps in at API boundaries.

---

## `apps/backend/` — NestJS

### `src/main.ts`
**What it uses:** NestJS bootstrap, OpenTelemetry, Sentry, Pino, Helmet, cookie-parser, CSRF (csurf or custom), CORS  
**Why this exact bootstrap order:**
1. **OpenTelemetry first:** Must instrument before any HTTP handlers are registered. If you add OTel after creating the NestJS app, it misses the first requests.
2. **Sentry second:** Needs to be initialized before any async operations so it captures early errors.
3. **PinoLogger:** Replace NestJS's default console logger with structured JSON as early as possible so all subsequent startup logs are in the right format.
4. **Fail-fast secret validation:** Crash before binding to a port if secrets are missing. A server that starts without `JWT_SECRET` is worse than one that refuses to start.
5. **Helmet before routes:** Security headers must apply to all routes including `/health`.
6. **CSRF after body parser:** CSRF middleware needs to read the request body (for the CSRF token). Body parser must run first.
7. **ValidationPipe last:** Applied globally, runs on every incoming request body.

**What breaks if order changes:** OpenTelemetry added after app creation misses traces. CSRF before body parser crashes on POST requests. Secret validation after startup means the app binds to port 4000 with missing config.

---

### `src/app.module.ts`
**What it uses:** NestJS `@Module()`, 42 feature module imports  
**Why 42 modules (not one big module):** NestJS's module system is its Dependency Injection container. Each module declares its providers, exports, and imports. Splitting into 42 modules means:
- Each module can be tested in isolation by importing only what it needs
- `forwardRef()` usage is visible and limited (circular deps are explicit, not hidden)
- New developers find code by domain (want to understand billing? go to `billing/`)

**Why not lazy-load modules:** NestJS supports `LazyModuleLoader` but it's not used here. Lazy loading adds complexity (you must check if the module is loaded before using it). The tradeoff is slower startup for simpler runtime code. This is a valid choice now but becomes a problem at scale (see Section 6, issue 7).  
**What breaks without proper module registration:** Services that are not in a module's `providers[]` array cannot be injected. NestJS throws `Nest can't resolve dependencies` at runtime with no compile-time error.

---

### `src/config/env.validation.ts`
**What it uses:** Zod v3 for schema validation  
**Why Zod over class-validator or joi:**
- Zod is TypeScript-first: the inferred type from `z.object({...})` is the exact TypeScript type you use in code. No decorator duplication.
- Zod errors are structured objects, not strings — easier to format for logs.
- class-validator requires decorators on classes (more boilerplate). Joi is JavaScript-first (no TypeScript inference).

**Why crash on missing vars in prod:** A server running without `JWT_SECRET` will accept any JWT (or crash with unclear errors when `sign()` is called). Failing at startup with a clear message ("missing JWT_SECRET") is far better than failing at runtime with "Cannot read property 'sign' of undefined".  
**What breaks without it:** Missing env vars cause cryptic runtime errors instead of clear startup failures.

---

### `src/agent/` — The Core Execution Engine

#### `browser-agent.service.ts`
**What it uses:** NestJS injectable service, communicates with Playwright (via Python bridge or directly)  
**Why 21 actions not more/fewer:** The 21 actions (`navigate, click, type, select, scroll, hover, screenshot, wait, press_key, upload_file, extract_text, extract_data, solve_captcha, switch_tab, close_tab, go_back, go_forward, refresh, evaluate, drag_drop, right_click, double_click`) cover every browser interaction needed for automation without overlapping. `evaluate` (run arbitrary JS) is the escape hatch for anything not covered.  
**Why selector priority (role+name > visible text > data-attributes > ARIA > placeholder > CSS class):** CSS classes are the most brittle selector — sites change classes between deploys. ARIA labels and roles are stable because they're semantic. This ordering matches what accessibility tooling uses, making selectors more resilient to UI redesigns.  
**Why `safeType()` with 30-100ms per character:** Typing too fast triggers bot detection on most sites. Human typing speed is 40-120ms per character with variance. The random range mimics human behavior.

---

#### `vision-agent.service.ts`
**What it uses:** Groq `llama-4-scout-17b-16e-instruct` (vision model), screenshot base64 encoding  
**Why a separate vision agent:** The browser agent performs actions. The vision agent understands what's on screen. Separation of concerns: browser-agent is deterministic (call Playwright API), vision-agent is probabilistic (ask LLM what it sees). Mixing them would make the browser-agent non-deterministic.  
**Why llama-4-scout for vision:** It's a multimodal model available on Groq's free tier with fast inference. GPT-4o is more accurate but costs $10/1K output tokens vs near-zero for Groq.  
**Why 7 blocker types (captcha/login/error/cookie/paywall/rate_limit/popup):** These are the 7 failure modes that stop automation dead. Each needs a different recovery strategy: captcha → solve_captcha action, login → credential injection, popup → dismiss, rate_limit → wait + retry. Knowing the specific blocker type enables targeted recovery.

---

#### `execution-pipeline.service.ts`
**What it uses:** NestJS service, `ExecutionContext` object pattern, 8 stage services  
**Why 8 stages not a single execute() method:** Each stage has a clear exit condition:
- PolicyCheckStage exits with `POLICY_FAILED` — task never starts
- AutomationGateStage exits with `SIMULATION_COMPLETED` — dry run done
- WorkerDispatchStage exits with `WORKER_DISPATCHED` — Python takes over

A single method would need nested if-else for every exit condition. Stages make each exit explicit and testable independently.  
**Why `ExecutionContext` as a mutable carrier object:** Stages need to communicate. GoalPlanningStage produces a plan that StepExecutionStage needs. Passing it through function returns would require each stage to return the full context, making signatures complex. A mutable context object (common in Express middleware and NestJS interceptors) is the idiomatic pattern.

---

#### `cognitive-os.service.ts` + subdirectories
**What it uses:** EMA (Exponential Moving Average), pgvector embeddings, log-space arithmetic  
**Why EMA for drift detection (α=0.6):** EMA gives more weight to recent steps (weight 0.6 to current, 0.4 to historical). A goal that starts as "research laptops" but drifts to "buy accessories" should be caught by recent steps, not averaged over all 30 steps. α=0.6 means ~3 recent steps dominate the signal.  
**Why log-space for CPN geometric mean:** The Confidence Propagation Network computes `exp(sum(w_i * log(C_i)) / sum(w_i))`. Log-space prevents numerical underflow when multiplying 8 small probabilities together. `0.7^8 = 0.057` is fine, but `0.3^8 = 0.0007` approaches float precision limits. Log-space is the standard solution.  
**Why 3 profiles (conservative/balanced/aggressive):** Different task types need different risk tolerances. A research task (no money involved) can use aggressive thresholds. A payment task must use conservative thresholds. Users or the policy engine selects the profile per task type.

---

#### `cognitive-circuit-breaker.service.ts`
**What it uses:** Pre-step gate combining DriftDetector + CPN + WorldState  
**Why a circuit breaker before each step (not just at the start):** Browser automation is non-deterministic. The page state after step 3 may be completely different from what was planned. The circuit breaker re-evaluates confidence before every step — not just once at planning time. This catches mid-execution drift (e.g., the user accidentally navigated to a different page).  
**Why geometric mean of all confidence sources:** A single low-confidence source (e.g., vision sensor at 0.2) should be able to abort execution even if all others are high. Geometric mean is sensitive to any zero-approaching value — unlike arithmetic mean which averages over it.

---

#### `stages/reflection.stage.service.ts`
**What it uses:** Async post-execution LLM call, pgvector memory storage  
**Why reflection is async (not blocking):** Reflection takes 2-5 seconds (LLM call). The user doesn't need to wait for it. The task is already complete. Running it async means the frontend sees `COMPLETED` immediately while reflection happens in the background.  
**Why store `negative_invariants` (failed selectors):** A selector that failed once on a domain is likely to fail again. Storing it prevents the agent from trying the same broken selector on the next task. This is the primary mechanism for the system getting smarter over time without retraining.  
**Why store `optimal_shortcuts`:** Successful action sequences on a domain can be reused. If "click Login → type email → type password → click Submit" always works on LinkedIn, store it as a shortcut and skip the reasoning step next time.

---

### `src/agent-registry/` — Domain Routing

#### `agent-registry.service.ts`
**What it uses:** NestJS service, 12 registered domain agents with `canHandle()` method  
**Why `canHandle()` pattern over a routing table:** `canHandle(taskType, entities)` gives each agent the ability to inspect the full parsed goal — not just a string type. A `BookingDomainAgent` might handle `ticket_booking` but only if the entities include a location. A string routing table can't express that logic.  
**Why 12 agents for 12 domains:** Each domain (job, food, shopping, travel, research, social, email, media, booking, finance, file, calendar) has fundamentally different: site structures, required data, approval gates, and success criteria. A single "general agent" would need massive conditional logic. Separate agents keep each domain's logic isolated and independently improvable.

---

#### `agents/job-domain.agent.ts` and peers
**What it uses:** `DomainAgent` interface implementation, `buildGraph()` returning ExecutionGraph  
**Why `buildGraph()` instead of `buildPlan()`:** An `ExecutionGraph` can represent branching paths (try LinkedIn first, fall back to Naukri if LinkedIn fails). A linear plan cannot. The graph also supports parallel branches (search multiple portals simultaneously) which a sequential plan cannot express.

---

### `src/auth/`

#### `auth.service.ts`
**What it uses:** Bcrypt, JWT (jsonwebtoken), Passport, SHA-256 for refresh tokens  
**Why bcrypt (not argon2):** Bcrypt is universally available and battle-tested. Argon2 is theoretically stronger but requires native bindings that can fail on some environments. For password hashing, bcrypt with 10+ rounds is acceptable per OWASP.  
**Why SHA-256 hash refresh tokens before DB storage:** If the database is breached, raw refresh tokens would allow attackers to take over all sessions. SHA-256 hashing means a DB dump reveals only hashes — attackers cannot use them without the original token (which they don't have).  
**Why timing-equalized login:** Without equalization, a login attempt for a non-existent user returns ~1ms (no DB lookup, no bcrypt). A valid user returns ~200ms (bcrypt compare). An attacker can enumerate valid usernames by measuring response time. Equalization runs a dummy bcrypt compare for non-existent users to make both paths take ~200ms.  
**Why force-logout on password reset:** If an attacker gained access and the legitimate user resets their password, the attacker's session should immediately die. This requires deleting all sessions linked to the user on password reset.

---

#### `guards/roles.guard.ts`
**What it uses:** NestJS `CanActivate`, `Reflector` to read `@Roles()` metadata  
**Why RBAC via decorators:** `@Roles(Role.ADMIN)` on a controller method is declarative and co-located with the code it protects. A middleware-based approach would require maintaining a separate route-to-role mapping that drifts from reality.  
**Three roles (USER/ADMIN/SUPERADMIN):** Minimal permission model. Most endpoints are USER. Admin dashboard routes are ADMIN. System-level operations (quota updates, force-deletes) are SUPERADMIN. Adding more roles without a use case creates complexity.

---

### `src/common/`

#### `llm/llm.service.ts`
**What it uses:** Groq SDK, OpenRouter API (OpenAI-compatible), OpenAI SDK, circuit breaker  
**Why provider cascade (Groq → OpenRouter → OpenAI):**
- Groq: free tier, extremely fast inference (tokens/second is 10x OpenAI). Primary.
- OpenRouter: aggregates 100+ models, pay-per-token. Fallback when Groq rate-limits.
- OpenAI: highest reliability SLA. Last resort.

**Why token cost tracking to `LlmUsage` table:** Without tracking, you have no idea which tasks are expensive. The LlmUsage table lets you build per-user billing, identify cost-heavy agents, and optimize prompts for the most-called paths.  
**Why a single `LlmService` (not direct SDK calls everywhere):** Centralizes provider switching, circuit breaking, retry logic, and cost tracking. If you called Groq directly in 20 services, switching to a new provider means 20 edits.

---

#### `embedding/embedding.service.ts`
**What it uses:** `all-MiniLM-L6-v2` (local, 384-dim, padded to 1536) or OpenAI `text-embedding-3-small` (1536-dim native)  
**Why local model as primary:** The local MiniLM model runs in-process with zero API cost. For memory retrieval (hundreds of calls per session), paying OpenAI per embedding would be expensive.  
**Why pad local embeddings to 1536:** pgvector stores vectors of fixed dimension. OpenAI embeddings are 1536-dim. If local embeddings are 384-dim, you can't store them in the same column as OpenAI embeddings. Padding with zeros makes them compatible (cosine similarity still works on the non-padded dimensions).  
**Why FNV-1a hash fallback:** If both embedding providers fail, the system still needs to store memories. FNV-1a produces a deterministic numeric hash of the text. Cosine similarity on hash vectors is meaningless, but at least the memory is stored and can be retrieved by text search.

---

#### `circuit-breaker/circuit-breaker.service.ts`
**What it uses:** State machine (CLOSED→OPEN→HALF_OPEN), configurable thresholds  
**Why a circuit breaker for LLM calls:** LLM APIs (Groq, OpenAI) can have partial outages where they return 503s. Without a circuit breaker, every LLM call during an outage waits for the full timeout (30s). With a circuit breaker, after 5 failures, the OPEN state immediately rejects calls and tries the fallback provider. This prevents cascading slowdowns.  
**Why HALF_OPEN state:** After `cooldownMs` (30s), the circuit moves to HALF_OPEN and allows one test request. If it succeeds, the circuit closes (provider recovered). If it fails, it reopens. Without HALF_OPEN, you'd need to manually reset the circuit or wait for a fixed time regardless of recovery.

---

#### `filters/all-exceptions.filter.ts`
**What it uses:** NestJS `ExceptionFilter`, global registration in `main.ts`  
**Why never leak stack traces:** A stack trace reveals: file paths, function names, library versions, and sometimes variable values. An attacker uses this to identify vulnerabilities (e.g., "this runs Express 4.18.1 which has CVE-XXXX"). The filter logs the full error internally (Pino) but returns only a safe error code and message to the client.

---

#### `logger/pino-logger.service.ts`
**What it uses:** Pino (fastest Node.js logger), structured JSON output, field redaction  
**Why Pino over Winston/Bunyan:** Pino is 5x faster than Winston because it serializes to JSON natively and uses a worker thread for I/O. In a high-traffic NestJS app, logging is on the critical path. Winston's string-based logging and synchronous I/O are measurably slower.  
**Why redact auth/cookie/password/token/secret fields:** Logs are often shipped to external services (Datadog, Splunk). Passwords in logs = credentials in your logging service. Redaction happens at the logger level so no service can accidentally log sensitive data.

---

### `src/memory/`

#### `memory.service.ts`
**What it uses:** Prisma ORM, pgvector `<=>` cosine distance operator, cursor-based pagination  
**Why cursor pagination over offset:** Offset pagination (`LIMIT 10 OFFSET 200`) requires the DB to scan and discard 200 rows. In a table with millions of memory entries, this gets slow. Cursor pagination (`WHERE id > $cursor LIMIT 10`) uses the index directly — O(log n) instead of O(n).  
**Why cosine distance for memory retrieval:** Cosine similarity measures the angle between embedding vectors, ignoring magnitude. This means "I love cats" and "Cats are wonderful" have high similarity even though they're different lengths. L2 distance would penalize length differences. For semantic similarity, cosine is the right metric.

---

#### `memory-consolidation.service.ts`
**What it uses:** `@nestjs/schedule`, `@Cron()` decorator, Prisma batch operations  
**Why decay importance by 0.95 every 7 days:** Information decays in relevance over time. A selector that worked on LinkedIn 6 months ago may no longer work. The decay function (×0.95 per 7-day staleness period) naturally de-emphasizes old memories without deleting them. The floor (0.1) keeps very old but occasionally useful memories accessible.  
**Why daily 3AM consolidation:** 3AM is lowest-traffic time in most timezones. The consolidation job is a heavy batch operation (scan entire Memory table, prune, promote). Running it during peak hours would contend with user requests for DB connections and CPU.  
**Why promote WORKING→EPISODIC:** Working memory (active session state) is stored temporarily. After a session completes, valuable information (what worked, what failed) should persist as EPISODIC memory for future sessions. The consolidation job performs this promotion.

---

#### `semantic-memory.service.ts`
**What it uses:** Contradiction detection via confidence threshold + source priority + recency  
**Why contradiction detection:** Without it, the memory can hold both "LinkedIn Easy Apply is at /jobs/view/123/easy-apply" and "LinkedIn Easy Apply is at /jobs/view/123/apply". Both can't be right. The semantic service detects when new information contradicts existing facts and resolves conflicts by confidence + recency.

---

### `src/queue/`

#### `queue.module.ts` + `processors/`
**What it uses:** BullMQ, Redis, `@Processor()` decorator, 4 named queues  
**Why BullMQ over SQS/RabbitMQ:** BullMQ is a Redis-native queue. Since Redis is already in the stack (for pub/sub, session state), BullMQ adds zero new infrastructure. SQS requires AWS. RabbitMQ is a new service to operate. BullMQ also has excellent NestJS integration via `@nestjs/bullmq`.  
**Why 4 queues (tasks, agent-steps, files, failed):**
- `tasks`: coarse-grained (one job per task)
- `agent-steps`: fine-grained (one job per browser step, enabling per-step retries)
- `files`: separate queue for file processing (different retry strategy, different worker)
- `failed`: dead letter queue — all failed jobs land here for debugging

**Why exponential backoff (base 2s, max 3 attempts):** Immediate retries on a 429 or 503 make the problem worse (you're adding more requests to an already overloaded service). Exponential backoff with jitter (`2^attempt * 2000ms + random(0..200ms)`) spreads retries over time and avoids thundering herd.

---

### `src/websocket/`

#### `agent.gateway.ts`
**What it uses:** Socket.IO, `@WebSocketGateway('/agent')`, JWT validation on connect, Zod message validation  
**Why Socket.IO over raw WebSocket:** Socket.IO adds: automatic reconnection, room management (`socket.join(sessionId)`), namespace isolation (`/agent`), and fallback to long-polling for environments that block WebSocket. Raw WebSocket gives none of these.  
**Why JWT validation on connect (not per-message):** Validating JWT on every message is expensive (JWT verify = crypto operation). Validating on connect and storing `socket.data.userId` is the standard pattern. The connection is authenticated once; all messages from that connection inherit the user identity.  
**Why Zod for message validation:** WebSocket messages arrive as raw strings. Without validation, a malicious client can send `{ "type": "browser:input", "x": "../../etc/passwd" }`. Zod parses and validates the message shape before it reaches handlers.

---

#### `worker-event-relay.service.ts`
**What it uses:** Redis pub/sub (`ioredis.subscribe()`), Socket.IO emit  
**Why Redis pub/sub (not direct HTTP from Python to NestJS):** The Python engine doesn't know which NestJS instance the user is connected to (in a multi-instance deployment). Publishing to Redis pub/sub means every NestJS instance receives the event and can route it to the right Socket.IO connection. Direct HTTP would require service discovery.  
**Why 300s TTL on approval keys:** If the user closes their browser during an approval request, the approval hangs forever without a TTL. 300 seconds (5 minutes) is long enough for a user to consider the action but short enough to prevent permanent hangs.

---

### `src/vault/vault.service.ts`
**What it uses:** Node.js `crypto` module, AES-256-GCM, PBKDF2-SHA512, 600K iterations  
**Why AES-256-GCM (not AES-256-CBC):** GCM mode provides both encryption AND authentication (AEAD). CBC mode provides only encryption — an attacker can flip bits in ciphertext to corrupt the plaintext in predictable ways. GCM detects this tampering via the authentication tag.  
**Why PBKDF2 with 600K iterations:** The VAULT_MASTER_KEY is a string (user-provided). If it's short or weak, an attacker who gets the database could brute-force it. PBKDF2 with 600K iterations makes each guess take ~1 second on modern hardware — brute-forcing a dictionary of 1M passwords would take 11 days on a single machine. OWASP recommends 210K+ iterations for SHA-512; 600K is above the minimum.  
**Why 32-byte salt + 16-byte IV per encryption:** Without a random salt, the same master key + password combination produces the same derived key. An attacker who sees two identical-looking vault entries knows they contain the same data. Random salt + IV means every encryption is unique even for identical inputs.

---

### `src/billing/`
**What it uses:** Stripe SDK, Stripe webhooks with HMAC verification  
**Why Stripe (not Paddle/Lemonsqueezy):** Stripe is the de facto standard for SaaS billing. Its APIs are the most documented, its webhook reliability is highest, and its Stripe Radar fraud detection is built-in. Paddle/Lemonsqueezy are simpler but less configurable for usage-based billing.  
**Why 4 tiers (FREE/PRO/TEAM/ENTERPRISE):** Matches the buyer persona matrix: individual users (FREE), solo professionals (PRO), small teams (TEAM), large orgs (ENTERPRISE). The `UserPlan` enum in Prisma maps directly to Stripe Price IDs, keeping the mapping explicit.

---

### `src/webhook/`
**What it uses:** HMAC-SHA256, exponential retry, soft-delete (30-day cleanup)  
**Why HMAC-SHA256 signing:** Webhook consumers need to verify that events came from OmniTask, not from an attacker who knows the endpoint URL. HMAC-SHA256 of the payload with a shared secret lets consumers verify authenticity. This is the same pattern Stripe, GitHub, and Twilio use.  
**Why soft-delete with 30-day cleanup:** Immediately deleting a webhook would lose the retry queue for in-flight deliveries. Soft-delete (`deletedAt`) keeps the record and its pending retries. The hourly cleanup job hard-deletes after 30 days.

---

### `src/gdpr/`
**What it uses:** Scheduled jobs, `deletedAt` soft deletes, data export (7-day signed link)  
**Why GDPR module exists:** Legal requirement in EU markets. OmniTask stores: user PII, execution histories, vault credentials, audit logs. GDPR Article 17 (right to erasure) requires deletion on request. Article 20 (right to portability) requires data export.  
**Why 7-day export link:** The export is a large ZIP file (all memories, tasks, screenshots). Storing it indefinitely is a storage cost and a liability. 7 days gives the user time to download it. After expiry, it's deleted.  
**Why anonymize rather than delete long-deleted users:** Hard-deleting a user record can break foreign keys in audit logs (who performed this action?). Anonymization (`user_deleted_XYZ@example.com`, null name) preserves referential integrity while removing PII.

---

### `src/training/`
**What it uses:** ChatML JSONL format, trajectory step serialization, QLoRA fine-tuning export  
**Why ChatML format:** ChatML (`<|im_start|>user\n...<|im_end|>`) is the standard fine-tuning format for Llama 2/3 models. QLoRA fine-tuning tools (LLaMA-Factory, Axolotl, Unsloth) all accept ChatML. Exporting in ChatML means the training pipeline works with any of these tools without conversion.  
**Why export trajectories (not just outcomes):** A trajectory includes every step: what the agent saw (screenshot), what it decided (reasoning), what it did (action), and what happened (result). Fine-tuning on trajectories teaches the model the decision-making process, not just the end state. This is imitation learning — the same technique used to train GPT-4o's function-calling.

---

### `src/ab-testing/`
**What it uses:** Z-score significance testing, strategy comparison  
**Why z-score (not just compare means):** "Strategy A succeeded 7/10 times, Strategy B succeeded 6/10 times — use A." This is wrong if the difference is noise. Z-score tests whether the difference is statistically significant (p < 0.05). Without significance testing, you promote strategies based on luck.  
**Why A/B test strategies (not models):** The bottleneck is usually the execution strategy (which sites to visit, in what order, with what parameters) not the underlying LLM. A/B testing strategies is faster to iterate on and cheaper than fine-tuning new models.

---

## `apps/frontend/`

### `src/app/(auth)/` and `(dashboard)/`
**What it uses:** Next.js 14 App Router route groups  
**Why route groups (`(auth)` and `(dashboard)`):** Route groups in App Router let you apply different layouts to different sections without affecting the URL. `(auth)` pages use a minimal layout (no sidebar, no nav). `(dashboard)` pages use `AppShell` (sidebar + auth guard). Without route groups, you'd need a single layout with conditional rendering — much harder to maintain.  
**Why App Router (not Pages Router):** App Router supports React Server Components (RSC). Dashboard pages that fetch data (task list, agent list) can be RSCs — they render on the server, ship zero JS for that component to the browser. Pages Router requires `getServerSideProps` — more boilerplate, no RSC support.

---

### `src/stores/agent.store.ts`
**What it uses:** Zustand v4 with computed selectors, 37 actions, capped arrays  
**Why Zustand (not Redux, not Context):**
- Redux: 5x the boilerplate (actions, reducers, selectors, middleware). Overkill for a session-scoped state.
- React Context: re-renders the entire component tree on every state change. With 50+ WebSocket events per second, this causes severe jank.
- Zustand: subscription-based (only components that use a specific slice re-render), zero boilerplate, DevTools support.

**Why cap arrays (screenshotHistory: 50, logs: 500, events: 200):** Zustand state lives in memory. Unlimited append on screenshot history would allocate 300KB/s at 500ms intervals. Capping at 50 keeps memory bounded. The same logic applies to logs (500 cap = ~1MB of text max).  
**Why 37 actions in one store:** All session state is co-located because it's all interdependent. The `currentStepIndex` affects the `executionTimeline` which affects `pendingApproval`. Splitting into sub-stores would require cross-store subscriptions, which Zustand supports but which adds complexity. One store for one session is the right granularity.

---

### `src/hooks/useAgentSession.ts`
**What it uses:** Socket.IO client, Zustand store actions, 50+ event subscriptions  
**Why a custom hook (not direct store access):** WebSocket subscription lifecycle (subscribe on mount, unsubscribe on unmount) is side-effect logic. It belongs in a hook, not in a store. The hook handles `wsService.on()` + `wsService.off()` cleanup. If subscription cleanup were in the store, socket listeners would accumulate across component mounts.  
**Why 50+ event types:** The execution pipeline emits granular events for every sub-system (drift, CPN, world state, vision analysis, self-healing, domain routing, orchestration). Granular events let the frontend show detailed telemetry (the "Cognitive OS" panels). Coarse events (just `step:started` and `step:completed`) would lose this observability.

---

### `src/components/LiveBrowserView.tsx`
**What it uses:** `requestAnimationFrame`, React refs (not state), `<canvas>` or `<img>` rendering, pointer event forwarding  
**Why RAF + refs (not React state for screenshots):** React state triggers a re-render on every update. At 500ms screenshot intervals (2 fps), setting state causes 2 full React render cycles per second in the `LiveBrowserView` subtree. With RAF + refs, the screenshot update happens outside React's render cycle — the canvas/image src is updated directly via the ref. This eliminates re-renders entirely for the high-frequency update path.  
**Why "Take Control" mode with pointer forwarding:** Users sometimes need to intervene mid-execution (fill a CAPTCHA, click a specific element). Take Control forwards raw `mousemove`, `mousedown`, `mouseup`, `click`, and `keydown` events via WebSocket to the Python engine's `input_control.py`. This turns the browser view into a remote desktop.

---

### `src/components/NeuralBrainCanvas.tsx`
**What it uses:** Three.js 0.165.0, `UnrealBloomPass`, `WebGLRenderer`, spatial hash for synapses  
**Why Three.js for the hero animation:** The "brain" visualization (6100 nodes, synapses, electrical impulses, bloom glow) requires GPU-accelerated rendering. CSS animations cannot handle 6100 animated objects. Canvas 2D is CPU-only and won't handle the bloom post-processing. Three.js + WebGL is the only practical choice for this visual.  
**Why spatial hash for synapses:** To draw synapse connections between nearby nodes, you need to find all nodes within distance R of each node. Naive approach: O(n²) comparisons = 6100² = 37M comparisons per frame. Spatial hash partitions space into cells: O(n) to build, O(1) per lookup. At 60 fps, O(n²) would be 2.2 billion comparisons per second — unusable.

---

### `src/services/api.ts`
**What it uses:** Axios, CSRF double-submit cookie, 401 refresh queue  
**Why Axios (not fetch):** Axios provides: automatic JSON serialization/deserialization, request interceptors (for CSRF injection), response interceptors (for 401 handling), and a 30s timeout that fetch doesn't support natively.  
**Why a refresh queue for 401s:** If 5 API calls fire simultaneously and all get 401 (expired token), all 5 would independently try to call `/auth/refresh`. The refresh endpoint would receive 5 simultaneous requests, create 5 new sessions, and only one would be stored in the DB (token rotation deletes previous sessions). The queue serializes all 401 responses: the first triggers a refresh, the rest wait for the result and then retry with the new token.

---

## `apps/browser-py/`

### `main.py`
**What it uses:** `redis.Redis.brpop()` (blocking pop), `http.server.HTTPServer` (health endpoint), `threading.Thread`  
**Why BRPOP (not polling):** `BRPOP` blocks the thread waiting for a job, releasing it the instant one arrives. Polling (`LRANGE` every N seconds) wastes CPU and adds N seconds of latency. BRPOP with 5-second timeout means jobs start within milliseconds of dispatch.  
**Why a separate health HTTP server on :8000:** NestJS's `/health/ready` checks Python's health via HTTP. The health server runs in a separate thread from the BRPOP loop so a hung job doesn't make the health check time out.  
**Why `PY_ALIVE_KEY` with 10s TTL:** The heartbeat key proves the Python process is alive, not just that the port is listening. A process can crash after bind but before starting the BRPOP loop. The key proves both are running.

---

### `executor.py`
**What it uses:** Playwright async API, skill dispatch table, self-healing (max 2 recoveries)  
**Why limit recoveries to 2:** More recoveries increase task duration significantly. If step 15 of 30 fails and requires 2 recovery attempts each taking 15s, that's 30 extra seconds. At 3 recoveries, it's 45s. Two recoveries is the empirical sweet spot between giving up too early and blocking too long.  
**Why crash recovery at the executor level (not the step level):** A crash (Playwright exception, browser OOM) affects the entire execution context, not just one step. Recovery at the executor level can restart the browser, reload the page, and resume from the last checkpoint. Step-level recovery can only retry the same action.

---

### `browser_manager.py`
**What it uses:** Playwright `browser_type.launch_persistent_context()`, profile paths by userId, GC loop  
**Why persistent context (not incognito):** Persistent contexts save cookies, localStorage, and session tokens between tasks. A user who logs into LinkedIn for Task 1 doesn't need to log in again for Task 2. Incognito contexts start fresh every time — terrible UX for automation that requires authentication.  
**Why 750MB quota per profile:** Chromium profiles accumulate cache, cookies, IndexedDB, and extension data. Without a quota, a power user's profile could grow to 5-10GB over weeks. 750MB is enough for a fully active browsing profile.  
**Why 30-minute idle eviction:** A Chromium process uses ~150-300MB RAM even when idle. With 10 concurrent users who all finish tasks at different times, without eviction you'd have 10 Chromium processes sitting idle. Eviction after 30 minutes idle reclaims this memory.

---

### `streamer.py`
**What it uses:** Chrome DevTools Protocol (CDP) `Page.startScreencast`, Redis `PUBLISH`  
**Why CDP screencast (not periodic screenshots):** `Page.startScreencast` streams JPEG frames continuously via CDP events. Periodic screenshots (`page.screenshot()` every 500ms) involve a round-trip Playwright call each time — each call blocks the event loop for ~50-100ms. CDP screencast happens asynchronously in the browser process itself and only calls back to Python when a frame is ready.  
**Why Redis PUBLISH (not WebSocket directly from Python):** The Python process doesn't know which NestJS instance the user's Socket.IO connection is on. Publishing to a Redis channel means every NestJS instance receives the frame and routes it to the right user. This is the pub/sub fan-out pattern.

---

### `agents/job_agent/task_agent.py`
**What it uses:** Observe→Reason→Act→Verify→Learn loop, SelectorMemory cache, dual LLM (main + critic)  
**Why cache-first selector lookup:** If the agent has already found the "Apply" button on LinkedIn (selector: `[aria-label="Apply"]`), there's no need to ask the LLM again. The cache stores proven selectors per (domain, action) pair. This reduces LLM calls from O(n steps) to O(n new steps) — most repeated task types reuse cached selectors.  
**Why a critic LLM for consequential actions:** For low-risk actions (click "Show more"), one LLM call is enough. For high-risk actions (submit application, confirm payment), a second LLM call with the prompt "Would a careful human approve this action? Is it reversible?" provides a second opinion. This catches hallucinations in the first LLM response.  
**Why confidence gate (min 0.45) + risk gate (max 0.85):** Below 0.45 confidence, the agent doesn't know what to do — better to ask for human input than to guess. Above 0.85 risk, the action is too consequential to automate — escalate to the approval gate. The gates are implemented as numeric thresholds on LLM-returned scores.

---

### `agents/job_agent/memory.py`
**What it uses:** JSON file (LongMemory), per-domain JSON (SelectorMemory), Redis hash (shared selector cache), JSONL (VectorMemory + ExperienceStore)  
**Why multiple memory backends:**
- **JSON file (LongMemory, 500 lessons + 2000 applications):** Persistent, human-readable. The file cap (500 lessons) prevents unbounded growth while keeping recent learnings.
- **Redis hash (shared selector cache):** Selectors discovered by one user's session immediately benefit all other users on the same domain. Redis's shared data structure is the right tool. JSON files per-user would not share discoveries.
- **JSONL (VectorMemory):** Append-only log of experiences. JSONL is the simplest format for streaming append without loading the whole file. Cosine similarity search is done in-process (small enough to keep in memory).

---

### `agents/job_agent/portals/linkedin.py`
**What it uses:** Playwright selectors, multi-step Easy Apply flow, OTP detection  
**Why a separate portal class per job site:** LinkedIn's Easy Apply flow is completely different from Naukri's "Apply" flow. LinkedIn has: multi-step modals, question answering, resume upload, review screen. Naukri has: single-page form, different selectors, different confirmation. Separate portal classes keep each site's quirks isolated.  
**Why 651 lines for LinkedIn portal:** LinkedIn's Easy Apply has ~15 possible states: initial apply button, login gate, resume selection, contact info, work experience questions, education questions, "Additional Questions" (multi-page), review, submit, confirmation. Each state needs detection logic and action logic. 651 lines is not bloat — it's the real complexity of the flow.

---

## `infra/`

### `infra/monitoring/prometheus.yml`
**What it uses:** Prometheus scrape configs for 4 targets (backend, node-exporter, postgres-exporter, redis-exporter)  
**Why 15-second scrape interval:** 15s is the Prometheus default and the right balance between freshness and storage cost. At 15s, a 30-day retention with 5 targets produces ~500MB of TSDB data. At 5s, it would be 1.5GB. WebSocket connection counts and queue depths change slowly enough that 15s is sufficient.

---

### `infra/nginx/nginx.conf`
**What it uses:** Nginx 1.27, TLS 1.2/1.3, rate limiting zones, WebSocket upgrade headers  
**Why `proxy_read_timeout 86400` for WebSocket:** The default Nginx `proxy_read_timeout` is 60 seconds. If no data passes through the WebSocket for 60 seconds, Nginx closes the connection. Browser automation sessions can idle for minutes between steps (waiting for page loads, user approvals). 86400s (24 hours) prevents Nginx from killing live sessions.  
**Why `worker_connections 4096`:** Each Nginx worker process can handle 4096 simultaneous connections. With 2 worker processes (one per CPU core) that's 8192 simultaneous connections. For a B2B SaaS this is ample; for consumer-facing at scale you'd increase `worker_processes`.  
**Why gzip level 6 (not 9):** Gzip level 9 (maximum compression) is ~20% better than level 6 but takes 4x longer to compute. For API JSON responses, level 6 gives ~70% size reduction with acceptable CPU cost. Level 9 would add measurable latency to every response.

---

## Dependency Graph — Who Uses Who

```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND (Next.js)                       │
│  useAgentSession.ts ──subscribes──► Socket.IO client         │
│  agent.store.ts ◄──updates── useAgentSession.ts             │
│  LiveBrowserView ◄──reads── agent.store.ts                  │
│  api.ts ──HTTP──► /api/* (NestJS)                           │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTP REST + WebSocket
┌────────────────────────────▼────────────────────────────────┐
│                    BACKEND (NestJS)                          │
│  ExecutionPipelineService ──orchestrates──►                  │
│    GoalPlanningStage ──calls──► LlmService (Groq→OR→OAI)   │
│    PolicyCheckStage ──calls──► PolicyService                 │
│    WorkerDispatchStage ──LPUSH──► Redis                      │
│    StepExecutionStage ──calls──► BrowserAgent               │
│    MemoryStage ──calls──► EpisodicMemory, pgvector          │
│  AgentGateway ──pub/sub──► Redis ◄──pub/sub── WorkerRelay   │
│  PrismaService ──► PostgreSQL 16 + pgvector                  │
│  BullMQ ──► Redis 7 (4 queues)                              │
└──────────┬──────────────────────────────────────────────────┘
           │ LPUSH / BRPOP via Redis
┌──────────▼──────────────────────────────────────────────────┐
│                  PYTHON ENGINE (Playwright)                   │
│  main.py ──BRPOP──► executor.py ──► skills/ + agents/       │
│  browser_manager.py ──► per-user Chromium profiles          │
│  streamer.py ──CDP──► Chromium ──PUBLISH──► Redis           │
│  events.py ──PUBLISH──► omnitask:worker:events ──► NestJS   │
│  input_control.py ◄──SUBSCRIBE──► omnitask:worker:input     │
└─────────────────────────────────────────────────────────────┘
           │ BRPOP / PUBLISH / SUBSCRIBE
┌──────────▼──────────────────────────────────────────────────┐
│                       REDIS 7                                │
│  Lists:    omnitask:py:jobs (job queue)                      │
│  Pub/Sub:  omnitask:worker:events, omnitask:worker:input     │
│  Strings:  omnitask:approval:*, omnitask:clarification:*    │
│  Hashes:   omnitask:selector:cache:* (shared selectors)     │
│  Keys:     PY_ALIVE_KEY (heartbeat, 10s TTL)                │
│  BullMQ:   bull:tasks:*, bull:agent-steps:*, bull:files:*   │
└─────────────────────────────────────────────────────────────┘
           │ Prisma
┌──────────▼──────────────────────────────────────────────────┐
│                  POSTGRESQL 16 + pgvector                    │
│  50+ models: User, Task, Execution, Memory (vector(1536))    │
│  Indexes: ivfflat/hnsw on Memory.embedding                   │
│  Extensions: pgvector (installed manually, not via Prisma)  │
└─────────────────────────────────────────────────────────────┘
```

---

## Technology Choice Summary Table

| Technology | Where Used | Why Chosen | Alternative Considered |
|-----------|-----------|-----------|----------------------|
| NestJS 11 | Backend | Module system + DI container, decorator-based, TypeScript-first, excellent testing support | Express (too minimal), Fastify (less ecosystem) |
| Next.js 14 App Router | Frontend | RSC support, built-in routing, Vercel deployment, TypeScript | Remix (smaller ecosystem), Vite SPA (no SSR) |
| PostgreSQL 16 + pgvector | Database | Relational + vector in one DB, pgvector for semantic search, no separate vector DB needed | MySQL (no vector), MongoDB (no SQL joins), Weaviate (separate service) |
| Redis 7 | Cache/Queue/PubSub | BullMQ requires Redis; pub/sub for Python↔NestJS bridge; fast key-value for session state | RabbitMQ (new service), SQS (AWS lock-in), Kafka (overkill) |
| BullMQ | Job Queue | Redis-native, excellent NestJS integration, per-job retry and backoff, dead letter queue | Bull (deprecated), Agenda (MongoDB), Bee-Queue (less features) |
| Playwright + Python | Browser Engine | Best-in-class browser automation, CDP access, persistent profiles, Python has best AI/ML ecosystem | Puppeteer (JS only, no Python), Selenium (slow, no CDP) |
| Groq (LLM primary) | All LLM calls | Free tier, 10x faster than OpenAI, llama-3.3-70b is capable enough for planning | OpenAI (expensive), Anthropic (no free tier), local-only (too slow) |
| Pino | Logging | Fastest Node.js logger (worker thread I/O), structured JSON, native NestJS adapter | Winston (3x slower), Bunyan (unmaintained), console.log (unstructured) |
| Zustand | Frontend state | Subscription-based (no unnecessary re-renders), zero boilerplate, TypeScript-native | Redux (5x boilerplate), Context (full-tree re-renders), Jotai (atomic, less ergonomic) |
| Socket.IO | WebSocket | Auto-reconnect, rooms, namespaces, long-polling fallback | ws (bare WebSocket, no rooms), SockJS (older) |
| Prisma | ORM | Type-safe queries, migration system, excellent TypeScript DX | TypeORM (less type safety), Drizzle (newer, less mature), raw SQL (no type safety) |
| pnpm | Package manager | 3-5x faster than npm, content-addressable store, strict isolation, workspace support | npm (slow, large node_modules), Yarn (less strict isolation) |
| Turborepo | Monorepo build | Build cache, dependency-aware task ordering, works natively with pnpm | Nx (more config), Lerna (deprecated), manual Makefiles |
| AES-256-GCM | Credential vault | AEAD (encryption + authentication), Node.js crypto module built-in, FIPS-compliant | AES-256-CBC (no authentication), ChaCha20-Poly1305 (not in Node.js crypto natively) |
| Zod | Validation | TypeScript-first (inferred types), structured errors, composable schemas | class-validator (decorator boilerplate), Joi (JS-first, no TS inference) |
| Prometheus + Grafana | Monitoring | Industry standard, 7-panel dashboard pre-built, exporters for all services | Datadog (expensive), New Relic (expensive), custom metrics (maintenance burden) |
| Three.js | Hero animation | Only practical option for GPU-accelerated 6100-node visualization | CSS animations (can't handle 6100 objects), Canvas 2D (no GPU, no bloom) |
| Bcrypt | Password hashing | Universal, battle-tested, configurable rounds, cross-platform | Argon2 (better but native bindings required), PBKDF2 (less resistant to GPU) |

---

*End of Part 2 — File Structure Deep Dive*
