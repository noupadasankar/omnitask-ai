# OmniTask AI — CLAUDE.md

## What This Is

OmniTask AI is a cognitive automation platform where AI agents autonomously execute user goals in a real browser. Users describe what they want ("apply to 10 backend jobs on LinkedIn", "order dinner from Zomato", "book a flight to Goa") and the system plans, executes, and verifies each step using coordinated AI agents + Playwright.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MONOREPO (pnpm + Turborepo)                  │
├──────────────┬───────────────────┬──────────────────────────────────┤
│ apps/frontend│  apps/backend     │  apps/browser-py                 │
│ Next.js 14   │  NestJS 11        │  Python + Playwright             │
│ App Router   │  REST + WebSocket │  Redis job consumer              │
│ Zustand      │  BullMQ queues    │  Real browser automation         │
│ Radix UI     │  Prisma ORM       │  Live screenshot streaming       │
│ Tailwind     │  Socket.IO        │  10 domain agents                │
└──────────────┴───────────────────┴──────────────────────────────────┘
         │                │                       │
         │     ┌──────────┴──────────┐           │
         │     │    PostgreSQL 16    │           │
         │     │    pgvector ext     │           │
         │     └─────────────────────┘           │
         │                                       │
         └────── Redis 7 (cache + BullMQ + pub/sub) ──────────────────┘
```

### Cross-System Interaction Diagram

```
User Goal (NL)
    │
    ▼
GoalUnderstandingService.parseGoal() → ParsedGoal (taskType, entities, constraints, ambiguityScore)
    │
    ▼ (if ambiguityScore > 0.6)
ClarificationGateService.runGate() → Refined goal (polls Redis 2s, 5 min timeout)
    │
    ▼
PlanOrchestratorService.buildExecutionPlan()
    ├─ AgentRegistryService.resolve() → DomainAgent.buildGraph()
    │     ├─ PluginRegistryService → SitePlugin.buildPlan()
    │     └─ ExecutionGraphService.mergeBranchPlans()
    ├─ OR PlannerAgentService.createPlan() (generic fallback)
    ├─ StrategyMemoryService.recallStrategies() (learn from past)
    └─ PreferenceMemoryService.getPreferences() (preferred sites)
    │
    ▼
PolicyEngineService.checkPlan() → approved/blocked
    │
    ▼
AutomationGateService.evaluate() → proceed/approval_needed/simulation
    │
    ▼ (two paths)
[Python Path]                          [Inline Path]
WorkerDispatcher → PythonBridge        StepExecutionStage loop:
  LPUSH to Redis                         CognitiveCircuitBreaker.preStep()
  Python BRPOP + execute                   ├─ DriftDetector (embeddings)
  Publishes to omnitask:worker:events      ├─ CPN gate (geometric mean)
  WorkerEventRelay handles events          └─ WorldState confidence
                                         BrowserAgent.executeAction/Skill()
                                         VisionAgent.validateStepCompletion()
                                         WorldStateSensor.postStep()
                                         SelfHealing on failure
    │                                      │
    ▼                                      ▼
VerifierAgentService.verify() → score (0-100), nextAction
    │
    ▼
MemoryStage: EPISODIC storage + strategy + preference learning
    │
    ▼
ReflectionStage: CognitiveOutcome + async SelfReflection → negative_invariants / optimal_shortcuts
    │
    ▼
WebSocket → Frontend (real-time events, screenshots, status)
```

---

## Monorepo Structure

```
omnitask-ai/
├── apps/
│   ├── backend/          # NestJS API server (port 4000)
│   ├── frontend/         # Next.js 14 App Router (port 3000)
│   └── browser-py/       # Python Playwright engine (port 8000)
├── packages/
│   ├── config/           # Shared ESLint + Prettier configs (@omnitask/config)
│   └── shared-types/     # Cross-app TypeScript types (@omnitask/shared-types)
├── scripts/
│   ├── dev.mjs           # Stack launcher (starts all services)
│   ├── deploy.sh         # Production deploy
│   └── loadtest/
├── infra/
│   ├── k8s/              # Kubernetes manifests (scaffolded, not implemented)
│   ├── monitoring/       # Prometheus + Grafana configs
│   ├── docker/           # Redis/Postgres/MinIO init configs
│   └── nginx/
├── docker-compose.yml    # Dev: PostgreSQL 16 + Redis 7 + Worker
├── docker-compose.prod.yml # Prod: 12 services + monitoring + SSL
├── turbo.json            # Turborepo task config
├── pnpm-workspace.yaml   # Workspace definition
├── Makefile              # 14 dev convenience targets
└── vercel.json           # Frontend Vercel deployment
```

---

## Quick Start

```bash
# 1. Infrastructure (PostgreSQL + Redis)
pnpm infra              # docker compose up -d postgres redis

# 2. Install deps
pnpm install
pip install -r apps/browser-py/requirements.txt
python -m playwright install chromium

# 3. Database
pnpm db:push            # Sync Prisma schema to DB

# 4. Run everything
pnpm stack              # scripts/dev.mjs — starts backend + frontend + browser-py
# OR individually:
pnpm dev:backend        # NestJS on :4000
pnpm dev:frontend       # Next.js on :3000
pnpm dev:browser-py     # Python on :8000
```

**Required environment variables** (validated at startup via Zod in `src/config/env.validation.ts`):

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `REDIS_URL` | Yes | `redis://localhost:6379` | Redis connection |
| `JWT_SECRET` | Yes | — | Min 16 chars, 64+ hex in prod |
| `JWT_REFRESH_SECRET` | Prod | — | Min 16 chars |
| `CSRF_SECRET` | Prod | — | Min 16 chars |
| `VAULT_MASTER_KEY` | Prod | — | 64 hex chars (32 bytes) |
| `GROQ_API_KEY` | No | — | Primary LLM provider (free tier) |
| `OPENROUTER_API_KEY` | No | — | Fallback LLM provider |
| `OPENAI_API_KEY` | No | — | Fallback LLM/embedding provider |
| `FRONTEND_URL` | No | `http://localhost:3000` | CORS origin |
| `NODE_ENV` | No | `development` | `development`/`production`/`test` |
| `PORT` | No | `4000` | Backend listen port |
| `PYTHON_AGENT_URL` | No | `http://localhost:8000` | Python engine |
| `STRIPE_SECRET_KEY` | No | — | Billing integration |
| `GOOGLE_CLIENT_ID` | No | — | OAuth (falls back gracefully) |
| `SENDGRID_API_KEY` | No | — | Email sending |
| `SENTRY_DSN` | No | — | Error tracking |
| `LOG_LEVEL` | No | `info` | `fatal`/`error`/`warn`/`info`/`debug`/`trace` |

---

## Backend (NestJS) — Deep Structure

### Module Organization (`apps/backend/src/`)

**42 feature modules** imported in `app.module.ts`:

| Directory | Purpose |
|-----------|---------|
| `agent/` | Core brain — execution engine, browser agent, vision agent, planner, verifier, orchestrator, data extractor, form agent, cognitive OS, runtime, stages, tools, message bus, group orchestration |
| `agent-registry/` | Domain agent registry — 12 agents with `canHandle()` + `buildGraph()` |
| `auth/` | JWT + refresh token auth, Google OAuth, guards, password validation |
| `common/` | LLM client, embedding, circuit breaker, guards, pipes, filters, logger, metrics, policy |
| `config/` | Zod env validation (crashes on missing vars) |
| `memory/` | Unified memory — episodic/semantic/procedural/working + consolidation + semantic search + preferences |
| `tasks/` | Task CRUD + lifecycle (QUEUED→PLANNING→RUNNING→COMPLETED) |
| `queue/` | BullMQ setup — 4 queues + agent-step processor |
| `execution/` | Execution session lifecycle + DTOs + enums |
| `execution-service/` | Task execution orchestration |
| `planning/` | LLM-based plan generation from natural language |
| `health/` | Liveness (`/health`) + readiness (`/health/ready`) probes |
| `audit/` | Audit logging for compliance (fire-and-forget) |
| `webhook/` | Outbound webhook delivery with HMAC-SHA256 signing + retry |
| `websocket/` | Socket.IO gateway + worker event relay + step/interaction/data handlers |
| `websocket-service/` | Global WebSocket facade service |
| `event-bus/` | ExecutionEventBus — 50+ typed events bridged to Socket.IO |
| `vault/` | AES-256-GCM credential encryption (PBKDF2, 600K iterations) |
| `billing/` | Stripe subscription management (FREE/PRO/TEAM/ENTERPRISE) |
| `teams/` | Team CRUD + invitations (7-day expiry, UUID tokens) |
| `gdpr/` | Data export (7-day link) + deletion + retention policies |
| `voice/` | STT (Groq Whisper) + TTS (ElevenLabs/OpenAI) + wake word detection |
| `calendar/` | Google/Outlook calendar sync with slot finding |
| `email/` | Gmail/Outlook/SMTP sending, AI categorization, scheduling |
| `media/` | YouTube/Spotify session tracking (stubs) |
| `food/` | Restaurant search (Google Places/Yelp), recipe generation, orders |
| `travel/` | Flight/hotel search (stubs), itinerary generation |
| `shopping/` | Product scoring (weighted 6-factor), price tracking, auto-buy |
| `job/` | Job matching (weighted 6-factor), resume storage, Python dispatch |
| `social/` | LinkedIn/Twitter posting (stubs), LLM draft generation |
| `digital-twin/` | Artifact store (versioned outputs) |
| `learning/` | Per-site performance tracking, domain mastery, strategy effectiveness |
| `feedback/` | Task rating (1-5) + category breakdown |
| `ab-testing/` | Strategy A/B testing with z-score significance |
| `plugins/` | Plugin system — 8 built-in site plugins (LinkedIn, Naukri, Zomato, etc.) |
| `skills/` | 8 domain skill templates with plan normalization |
| `training/` | Trajectory export as ChatML JSONL for QLoRA fine-tuning |
| `admin/` | System stats, user management, quota updates (ADMIN/SUPERADMIN) |
| `users/` | User profile CRUD with cache (5-min TTL) |
| `session/` | In-memory session state machine (browser + gate states) |
| `places/` | Google Places API + Yelp fallback |
| `idempotency/` | Idempotency guard (24h TTL, in-flight dedup) |
| `cache/` | Cache-manager wrapper with circuit breaker |
| `prisma/` | PrismaService (`@Global`, pg driver adapter) |
| `shared/` | Agent interfaces, constants, DTOs |

### Bootstrap Stack (`main.ts`)

Applied in order:
1. **OpenTelemetry** — auto-instrumentations for HTTP/Express/NestJS
2. **Sentry** — conditional error tracking
3. **PinoLoggerService** — structured JSON, secret redaction
4. **Fail-fast secret validation** — throws in prod, warns in dev
5. **Global prefix** — `/api`
6. **Helmet** — security headers
7. **Body parser** — 1MB limit
8. **Cookie parser**
9. **CSRF** — double-submit cookie (64-byte token, exempt: login/register/refresh, Bearer bypass)
10. **CORS** — `[FRONTEND_URL, localhost:3000]` + loopback in dev
11. **Global ValidationPipe** — whitelist, transform, forbidNonWhitelisted
12. **Global AllExceptionsFilter** — never leaks stack traces
13. **Global EtagInterceptor** — MD5-based ETags for GET responses
14. **Swagger** — `/docs` (non-production only)

### Global Guards (via APP_GUARD):
1. **TierThrottlerGuard** — rate limits by user plan (free:30, basic:60, premium:200, enterprise:500, admin:1000 req/60s)
2. **IdempotencyGuard** — duplicate request prevention with in-flight dedup
3. **RolesGuard** — RBAC via `@Roles()` decorator

---

### Execution Pipeline (8 stages)

```
ExecutionPipelineService.run(sessionId, goal, config?, parsedGoal?)
    │
[1] GoalPlanningStage        → PlanOrchestratorService.buildExecutionPlan()
[2] PolicyCheckStage          → PolicyEngineService.checkPlan()
    Exit: POLICY_FAILED
[3] AutomationGateStage      → AutomationGateService.evaluate()
    Exit: LAUNCH_DENIED | SIMULATION_COMPLETED | ADAPTER_COMPLETED
[4] WorkerDispatchStage       → WorkerDispatcherService.dispatch() or AgentStepsQueue
    Exit: WORKER_DISPATCHED (Python path)
    Fallback: ctx.executedInline = true (NestJS path)

IF ctx.executedInline:
[5] StepExecutionStage        → BrowserAgent + CognitiveCircuitBreaker + Vision + SelfHealing
[6] VerificationStage         → VerifierAgentService.verify()
[7] MemoryStage               → Episodic + Strategy + Preference learning
[8] ReflectionStage           → CognitiveOutcome, DB write, async reflection
```

**ExecutionContext** carries: userId, taskId, plan, executionGraph, totalSteps, routedDomain, policyCheck, gateDecision, skillHint, dispatchedToWorker, executedInline, stepResults[], errorHistory[], stepsCompleted, stepsFailed, completedSuccessfully, failureReason, verificationResult, cognitiveOutcome, systemConfidence, durationMs, exitReason.

---

### Agent Types (6 specialist agents)

| Agent | File | Role | Key Methods |
|-------|------|------|-------------|
| `BROWSER_AGENT` | `browser-agent.service.ts` | Navigate, click, type, scroll via Playwright | `executeAction()` (21 actions), `executeSkill()` (12 skills), `safeType()` (30-100ms per char), anti-detection injection |
| `VISION_AGENT` | `vision-agent.service.ts` | Analyze screenshots, detect blockers | `analyzeScreenshot()`, `validateStepCompletion()` (before/after), `detectBlockers()` (captcha/login/error/cookie/paywall/rate_limit/popup) |
| `DATA_AGENT` | `data-extractor-agent.service.ts` | Extract structured data from pages | `extract()` — vision or text mode, DOM parse fallback (regex table/pagination detection) |
| `FORM_AGENT` | `form-agent.service.ts` | Detect + fill form fields | `analyze()` — password/OTP/payment/SSN always `ASK_USER`, heuristic fallback with regex input parser |
| `VERIFIER_AGENT` | `verifier-agent.service.ts` | Validate step success | `verify()` — score 0-100 (≥70 accept, 50-69 retry, <50 replan), `verifyFromScreenshot()` for mid-execution checks |
| `ORCHESTRATOR` | `multi-agent-coordinator.service.ts` | Coordinate multi-agent plans | `orchestrateTask()` — provisions roles, `handleNaturalLanguageControl()` — 8 interrupt types incl. OTP injection |

### Domain Agents (`agent-registry/agents/` — 12 registered)

| Agent | ID | Category | Task Types |
|-------|----|---------|-----------| 
| JobDomainAgent | job-agent | job | `job_search` |
| FoodDomainAgent | food-agent | food | `food_order` |
| ShoppingDomainAgent | shopping-agent | shopping | `shopping`, `price_comparison` |
| TravelDomainAgent | travel-agent | travel | `ticket_booking`, `hotel_booking`, `flight_search` |
| ResearchDomainAgent | research-agent | research | `research`, `deep_research`, `fact_check`, `comparison`, `news_analysis` |
| SocialDomainAgent | social-agent | social | `social_post`, `social_schedule`, `social_analytics`, `content_creation` |
| EmailDomainAgent | email-agent | email | `email_send`, `email_read`, `email_search`, `email_reply`, `email_manage` |
| MediaDomainAgent | media-agent | media | `music_play`, `music_search`, `video_play`, `media_control` |
| BookingDomainAgent | booking-agent | general | `ticket_booking`, `hotel_booking`, `restaurant_booking`, `appointment` |
| FinanceDomainAgent | finance-agent | general | `expense_tracking`, `financial_report`, `budget_management` |
| FileDomainAgent | file-agent | general | `file_create`, `file_search`, `document_generation` |
| CalendarDomainAgent | calendar-agent | general | `create_event`, `find_slot`, `detect_conflict`, `reschedule` |

### Site Plugins (8 built-in, via `PluginRegistryService`)

| Plugin | Category | Domains | Risk |
|--------|----------|---------|------|
| LinkedInSkill | job | linkedin.com | LOW |
| NaukriSkill | job | naukri.com | LOW |
| IndeedSkill | job | indeed.com | LOW |
| WellfoundSkill | job | wellfound.com, angel.co | LOW |
| ZomatoSkill | food | zomato.com | CRITICAL |
| SwiggySkill | food | swiggy.com | CRITICAL |
| AmazonSkill | shopping | amazon.in/.com | CRITICAL |
| FlipkartSkill | shopping | flipkart.com | CRITICAL |

---

### Cognitive OS (5 subsystems)

#### WorldStateService
- **Types:** RealitySnapshot (domHash, screenshotHash, url), EpistemicEnvelope<T> (value, source confidence, inference depth), BeliefState (authStatus, activeStage, hostilityIndex, isFormPresent, isModalActive, isCheckoutDetect, pageVolatility)
- **Decay:** `C_decayed = C_initial * e^(-lambda * t)` per-belief key
- **Methods:** initializeSession, updateReality, updateBelief, getState (with temporal decay), rollback (to version)

#### DriftDetectorService
- **EMA weight:** `DECAY_ALPHA = 0.6` → `T_k = 0.6*T_{k-1} + 0.4*S_k` (L2-normalized)
- **Phase thresholds:** research=0.40, selection=0.65, transaction=0.85
- **Drift types:** EXPLORATION, DISTRACTION, CONSTRAINT_INDUCED
- **Methods:** initializeGoal (embeds goal), recordStep (EMA update), evaluateDrift (cosine similarity vs threshold, LLM classification)

#### ReflectionService
- **Output:** SelfReflection (didSucceed, mismatchedAssumptions[], failedSelectors[], recommendedPromptCorrection)
- Stores failed selectors as `negative_invariant:{taskType}:{domain}` (importance 0.6)
- Stores successful shortcuts as `optimal_shortcut:{taskType}` (importance 0.75)

#### SelfHealingService
- **Recovery pipeline (priority):** Navigation/blocker detection → Popup dismiss → Selector recovery (vision ≥ 0.6) → Workflow recovery → Navigation with recovery steps → Best-confidence fallback
- **Sub-healers:** SelectorHealerService, NavigationHealerService, WorkflowHealerService, RetryManagerService (max 3 attempts, 2000ms backoff)

#### ConfidenceNetworkService (CPN)
- **Sources:** planner, dom_sensor, vision_sensor, drift, wso, verifier, strategy, policy
- **Algorithm:** Log-space weighted geometric mean: `exp(sum(w_i * log(C_i * e^(-lambda_i * dt))) / sum(w_i))`
- **Profiles:**

| Profile | Abort | Pause | Warn | Drift Floor | Max Retries | Min Consensus |
|---------|-------|-------|------|-------------|-------------|---------------|
| conservative | 0.35 | 0.55 | 0.70 | 0.70 | 1 | 0.75 |
| balanced | 0.20 | 0.40 | 0.60 | 0.55 | 3 | 0.55 |
| aggressive | 0.10 | 0.25 | 0.45 | 0.35 | 5 | 0.35 |

---

### Queue System (BullMQ + Redis)

**4 queues** (defaults: 3 attempts, exponential backoff 2s base):

| Queue | Purpose |
|-------|---------|
| `tasks` | Main task processing (`execute-after-plan`, `process-task`, `process-step`) |
| `agent-steps` | Per-step agent dispatch (one Bull job per planned step) |
| `files` | File processing |
| `failed` | Dead letter / failed job tracking |

**AgentStepProcessor** (`@Processor('agent-steps')`):
- 5 named handlers: `step-BROWSER_AGENT`, `step-VISION_AGENT`, `step-DATA_AGENT`, `step-FORM_AGENT`, `step-VERIFIER_AGENT`
- Per-step: emit active → LLM enhancement (agent-specific prompt, temp 0.1) → Python Bridge dispatch → emit completed → on final step emit `execution:completed`

---

### WebSocket Subsystem

**AgentGateway** — namespace `/agent`, JWT auth on connection, Zod-validated messages

| Event | Handler |
|-------|---------|
| `ping` | heartbeat |
| `session:join/leave` | Room management |
| `approval:respond` | Dual-path: in-process (ExecutionEngine) + Redis key (WorkerRelay) |
| `browser:input` | Forwards mouse/keyboard to Python via Redis (fire-and-forget) |
| `clarification:response` | Redis storage + emit clarification:received |
| `session:pause/resume/cancel` | ExecutionEngine lifecycle |

**WorkerEventRelayService** — Redis pub/sub bridge:
- Python publishes to `omnitask:worker:events` → NestJS routes to handlers
- User input published to `omnitask:worker:input`
- Approvals: Redis key `omnitask:approval:{sessionId}:{stepIndex}` (300s TTL)
- Clarifications: Redis key `omnitask:clarification:{sessionId}` (600s TTL)
- Self-healing: Redis key `omnitask:healing:{sessionId}:{stepIndex}` (120s TTL)

**ExecutionEventBus** — 50+ typed events, all funnel through `'execution:ws:emit'`:
- Session lifecycle, plan events, step events, browser state, approval gates, COS telemetry (drift/CPN/WSO), memory/preferences, shadow mode, screenshots, clarification, domain routing, orchestration/sub-goal lifecycle, agent_status

---

### Memory System (7 services)

| Service | Type | Key Behavior |
|---------|------|-------------|
| MemoryService | CRUD | store, retrieveRelevant (text search), getRecent, cursor pagination |
| MemoryConsolidationService | Scheduled | Hourly: decay (×0.95 if 7d stale, floor 0.1) + dedup. Daily 3AM: promote WORKING→EPISODIC, prune expired, prune low-importance (≤0.15, 30d old) |
| EpisodicMemoryService | EPISODIC | Execution episodes (quality: 0.85 success, 0.5 failure, 0.2 partial) |
| SemanticMemoryService | SEMANTIC | Facts with contradiction detection (confidence threshold + source priority + recency) |
| ProceduralMemoryService | PROCEDURAL | Workflows with trigger patterns, suggestion via token matching |
| SessionContextService | WORKING | Active session state, promotes to EPISODIC on completion |
| PreferenceMemoryService | Preferences | Per-user domain preferences, auto-learn: ≥3 successes AND ≥75% category runs → preferred |

**MemoryStoreService** (agent-side): pgvector cosine distance (`<=>` operator), working memory with FIFO eviction at 1000 entries, stores execution episodes (90-day expiry), procedures (importance 0.9).

---

### Auth System

**Dual strategy:** JWT (primary) + Google OAuth 2.0

**Security features:**
- Bcrypt hashing (configurable salt rounds, default 10)
- Timing-equalization on login (dummy hash compare if user not found)
- SHA-256 hashed refresh tokens in DB (prevents session replay on DB leak)
- Token rotation on refresh (old session deleted, new issued)
- Force-logout-everywhere on password reset
- Rate limits: register/login 5/60s, refresh/logout 10/60s, forgot/reset 3/60s
- Password schema: 8-128 chars, requires uppercase + lowercase + digit + special

---

### Common Utilities

| Module | Key Detail |
|--------|-----------|
| **LlmService** | Provider priority: GROQ → OPENROUTER → OPENAI. Models: main=`llama-3.3-70b-versatile`, mini=`llama-3.1-8b-instant`, vision=`llama-4-scout-17b`. Token cost tracking to LlmUsage table |
| **EmbeddingService** | Local (`all-MiniLM-L6-v2`, 384-dim padded to 1536) or OpenAI (`text-embedding-3-small`, 1536 native). FNV-1a hash fallback |
| **CircuitBreakerService** | CLOSED→OPEN→HALF_OPEN. Defaults: failureThreshold:5, successThreshold:2, cooldownMs:30s |
| **PolicyService** | Risk: CRITICAL (delete/payment), HIGH (update/create), MEDIUM (read/export), LOW (default) |
| **PinoLoggerService** | Structured JSON, redacts auth/cookie/password/token/secret, file transport optional |
| **CorrelationIdMiddleware** | UUID v4 `x-request-id` on every request |
| **EtagInterceptor** | MD5-based ETags for GET responses with 304 support |
| **ZodValidationPipe** | Zod schema validation with structured error responses |
| **Retry util** | Exponential backoff: `delay = baseMs * 2^attempt + random(0..200)`, retries 429/502/503, max 3 attempts |
| **Prometheus metrics** | 5 custom: `omnitask_http_request_duration_seconds`, `omnitask_http_requests_total`, `omnitask_active_connections`, `omnitask_queue_depth`, `omnitask_db_query_duration_seconds` |

---

### Agent Prompts (`prompts/agent-prompts.ts`)

| Prompt | Rules |
|--------|-------|
| **ORCHESTRATOR** | Always start with VISION_AGENT, verify after every BROWSER_AGENT action, max 20 steps, end with VERIFIER_AGENT |
| **BROWSER_AGENT** | Selector priority: role+name > visible text > data-attributes > ARIA > placeholder > CSS class |
| **VISION_AGENT** | Classifies page_type (10 types), detects key_elements with selector_hints, recommends next action |
| **DATA_AGENT** | Extracts as table/list/key_value/single_value, detects pagination |
| **FORM_AGENT** | Action types: type/select/checkbox/upload/clear_and_type/submit. Never fills password. Pauses when data missing |
| **VERIFIER_AGENT** | Always-pause list: submit application, login credentials, payment, file upload, OTP/2FA |

---

## Database (Prisma + PostgreSQL)

### Key Models (50+ total)

**Core:** User, UserPreferences, UserQuota, Task, Plan, Execution, ExecutionStep, ExecutionSession, AgentExecutionStep
**Memory:** Memory (with pgvector embeddings), Skill
**Auth:** Session, OAuthAccount
**Domain:** JobPreference, JobApplication, ShoppingPreference, TrackedProduct, TravelBooking, FoodOrder, SocialPost
**Infrastructure:** AuditLog, LlmUsage, Webhook, IdempotencyKey, CredentialVault, File, Schedule, Notification, Screenshot, ApprovalRequest
**Billing:** Subscription, Invoice, Team, TeamMember, TeamInvitation
**Learning:** TrajectoryStep, TrajectoryRun, StrategyTest, TaskFeedback
**Communication:** EmailAccount, EmailMessage, ScheduledEmail, MediaSession, VoiceSession, CalendarAccount, CalendarEvent
**GDPR:** DataExportRequest, DataDeletionRequest, DataRetentionPolicy
**Other:** Place, PlaceBooking, Artifact

### Key Enums

| Enum | Values |
|------|--------|
| `TaskStatus` | QUEUED → PLANNING → PLANNED → AWAITING_APPROVAL → RUNNING → PAUSED → COMPLETED/FAILED/CANCELLED |
| `MemoryType` | EPISODIC / SEMANTIC / PROCEDURAL / WORKING |
| `Role` | USER / ADMIN / SUPERADMIN |
| `UserPlan` | FREE / PRO / TEAM / ENTERPRISE |
| `RiskLevel` | LOW / MEDIUM / HIGH / CRITICAL |
| `ExecutionStatus` | RUNNING / COMPLETED / FAILED / CANCELLED |
| `StepStatus` | PENDING / RUNNING / COMPLETED / FAILED / SKIPPED / COMPENSATED |
| `BrowserAction` | 21 actions (navigate, click, type, select, scroll, hover, screenshot, wait, press_key, upload_file, extract_text, extract_data, solve_captcha, switch_tab, close_tab, go_back, go_forward, refresh, evaluate, drag_drop, right_click, double_click) |
| `StepAgent` | ORCHESTRATOR / BROWSER_AGENT / VISION_AGENT / DATA_AGENT / FORM_AGENT / VERIFIER_AGENT |

### Billing Tiers

| Plan | Monthly | Tasks/Day | Concurrent | Storage |
|------|---------|-----------|------------|---------|
| FREE | — | 10 | 2 | 512MB |
| PRO | $29 | 50 | 5 | 5GB |
| TEAM | $99 | 200 | 20 | 50GB |
| ENTERPRISE | custom | 1000 | 100 | 500GB |

### Vector Embeddings

The `Memory.embedding` field is `Float[]` in Prisma but `vector(1536)` in the actual DB (pgvector extension). **Never use Prisma migrations for embedding columns** — always hand-write `ALTER TYPE vector(1536)` + ivfflat/hnsw indexes.

---

## Frontend (Next.js 14)

### Stack
- **Framework:** Next.js 14.2.0 App Router (TypeScript strict, bundler resolution)
- **State:** Zustand v4.4.7 (3 stores: auth, agent, runtime)
- **Server state:** TanStack Query v5 (30s stale, no refetch on window focus)
- **UI:** Radix UI primitives + Tailwind CSS 3.4.1 + Framer Motion v12
- **WebSocket:** socket.io-client (singleton `wsService`)
- **Forms:** React Hook Form + @hookform/resolvers + Zod
- **Charts:** Recharts 2.12.7
- **3D:** Three.js 0.165.0 (NeuralBrainCanvas hero)
- **Icons:** lucide-react
- **Design:** Dark cyberpunk/HUD theme — 2075-line custom CSS with glassmorphism, neon glows, CRT effects, hazard stripes

### Route Groups (~80 page routes)

**Auth routes** (`(auth)/` — no layout shell):
- `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`, `/auth/callback`

**Dashboard routes** (`(dashboard)/` — auth guard + AppShell):
- `/dashboard` — Main command center with goal input + live browser view
- `/tasks` — CRUD + sub-pages: create, queue, running, completed, failed, [id] (detail + logs/replay/approvals/screenshots)
- `/agents` — List + [id] (detail + logs/memory/metrics/settings)
- `/workflows` — CRUD + create, templates, executions, [id] (detail + edit/analytics/versions)
- `/analytics` — usage, costs, tokens, agents, executions
- `/memory` — embeddings, semantic-search, vector-store
- `/health` — runtime, queues, workers, websocket, database
- `/approvals` — pending, approved, rejected, [id]
- `/execution` — history, schedules, replay/[sessionId]
- `/history` — analytics, exports, replay
- `/settings` — profile, api-keys, billing, vault, voice, team, permissions, appearance
- `/admin` — users, logs, policies, system
- `/jobs`, `/email`, `/media`, `/monitor`

### Zustand Stores

**`auth.store.ts`** — `{ user, loading }` + `fetchUser`, `login`, `logout`, `setUser`. Auto-fetches on module load, stores JWT in localStorage.

**`agent.store.ts`** (333 lines, largest store) — Full session state:
- Session: sessionId, phase (11 states: idle/parsing/planning/executing/paused/waiting_clarification/waiting_approval/waiting_otp/completed/failed/cancelled), browserState, executionState
- Plan: plan, currentStepIndex, totalSteps
- Live browser: currentScreenshot, screenshotHistory (last 50)
- Multi-agent: activeAgents, activeSpecialistAgent
- Timeline (deduped by id), logs (capped 500), agentResults (capped 50), events (capped 200)
- Approval: pendingApproval
- Cognitive OS: worldState, driftRecords (capped 50), executionProfile, driftAbort, cpnGateEvents (capped 50), cognitiveOutcome
- Routing: executionGraph, routedDomain, matchedSkills, userPreferences
- Clarification: clarificationQuestions, clarificationGoal
- **37 actions** including `reset()` to initial state

**`runtime.store.ts`** — `{ connected, sidebarOpen }` + toggle/set actions

### Key Hook: `useAgentSession` (813 lines)

Subscribes to **50+ WebSocket event types** via `wsService.on()`:
- Session/plan/step lifecycle, screenshot frames, agent results
- Browser events (click/type/cursor/scroll/navigation/network/console/DOM/error)
- Memory, vision, healing, execution graph, domain routing
- Approval flow, automation gate, execution state
- COS telemetry (world state, drift, CPN gate)
- Agent status with specialist tracking

Returns: `startSession`, `sendInterrupt`, `pause`, `resume`, `cancel`, `approve`, `deny`, `respondToClarification`

### API Client Architecture

**Two-layer pattern:**
1. **`services/api.ts`** — Axios instance with CSRF handling (cookie-based), token refresh queue (queues concurrent 401s during refresh), 30s timeout
2. **13 domain services** — Typed API wrappers: auth, task (~15 methods), agent (~30 methods), orchestrator, job, voice, vault, email, media, shopping, food, travel, social, research

### Key Components

| Component | Lines | Purpose |
|-----------|-------|---------|
| `LiveBrowserView` | 760 | RAF rendering loop (ref-based, no React state), "Take Control" mode with pointer/keyboard forwarding, Chrome-like header, crash recovery UI |
| `NeuralBrainCanvas` | 929 | Three.js brain: 6100 nodes (cortex+deep+cerebellum+brainstem), synapses via spatial hash, white matter tracts, electrical impulses, UnrealBloomPass, scroll parallax |
| `JobWizardModal` | 764 | 4-step wizard: resume upload, portal selection (5 portals), credentials, review & launch |
| `Sidebar` | 293 | Collapsible (64px/280px), admin nav for ADMIN/SUPERADMIN, animated with Framer Motion |
| `ApprovalPanel` | 179 | Countdown timer, keyboard shortcuts (Enter/Escape), risk-level styling |
| `ExecutionTimeline` | — | Auto-scrolling step timeline with risk colors |
| `ExecutionReplay` | — | Frame-by-frame replay with speed control (0.5x-4x) |
| `ClarificationModal` | — | Numbered question list with textarea answers |

### Frontend WebSocket Events

```typescript
socket.on('agent_status', ...)             // Agent working/completed/failed
socket.on('execution:completed', ...)      // Task finished
socket.on('approval:requested', ...)       // Needs user approval
socket.on('screenshot:frame', ...)         // Live browser screenshot
socket.on('cos:world_state', ...)          // Cognitive OS telemetry
socket.on('cos:drift', ...)                // Trajectory drift detected
socket.on('cos:cpn_gate', ...)             // Confidence gate decision
socket.on('clarification:required', ...)   // Goal needs clarification
socket.on('agent:domain_routed', ...)      // Domain agent selected
```

---

## Python Browser Engine (`apps/browser-py/`)

### Core Architecture

Standalone Playwright service that:
1. BRPOPs jobs from Redis list `omnitask:py:jobs`
2. Drives Chromium with persistent per-user browser profiles
3. Streams live screenshots via CDP screencast to Redis pub/sub
4. Publishes execution events on `omnitask:worker:events`
5. Accepts remote input (mouse/keyboard) via `omnitask:worker:input`

### Key Files

| File | Lines | Purpose |
|------|-------|---------|
| `main.py` | 382 | Redis job loop (BRPOP 5s), health server (:8000), heartbeat (`PY_ALIVE_KEY` 10s TTL) |
| `executor.py` | 708 | Job dispatch, step execution, agent routing, self-healing (max 2 recoveries), crash recovery |
| `browser_manager.py` | 321 | Per-user persistent Chromium profiles (750MB quota, 30min idle eviction, GC loop) |
| `dom.py` | 57 | Interactive DOM extraction (JS evaluated, visibility check, selector priority: id > aria-label > class > tag) |
| `streamer.py` | 193 | CDP `Page.startScreencast` (JPEG quality from env, fallback: 500ms interval screenshots), title refresh 1s |
| `ai.py` | 199 | LLM client (Groq/OpenAI), vision-based action decisions (60 visible nodes, JSON output, temp 0.1) |
| `events.py` | 88 | Redis event publisher, approval/healing polling |
| `input_control.py` | 146 | Remote input: click/mousemove/mousedown/mouseup/wheel/type/key/navigate/back/forward/reload/file_upload |

### Executor Constants
```
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36..."
STEALTH_JS — Hides navigator.webdriver, fakes plugins, adds window.chrome
ACTION_TIMEOUT = 15,000ms
_MAX_RECOVERIES = env BROWSER_MAX_RECOVERIES (default 2)
```

### Skills Layer (14 canonical skills, 40+ aliases)

| Skill | Delegation | Approval Gates |
|-------|-----------|---------------|
| `research` | Built-in (Google search + 5 sources + AI synthesis) | None |
| `job` | Built-in (portal-specific URLs + DOM extraction) | None |
| `job_application` | `agents/job_agent` orchestrator | Apply actions |
| `web_task` | TaskAgent cognition (observe→reason→act→verify→learn, 30 steps max) | Consequential actions |
| `generic` | Built-in (web search + open top result + AI answer) | None |
| `social` | `agents/social_agent` | Post actions |
| `email` | `agents/email_agent` | Send/compose |
| `shopping` | `agents/shopping_agent` | Cart/purchase |
| `food` | `agents/food_agent` | Order/reserve |
| `booking` | `agents/booking_agent` | All bookings |
| `travel` | `agents/travel_agent` | All bookings |
| `calendar` | `agents/calendar_agent` | Event creation |
| `finance` | `agents/finance_agent` | Bill payment |
| `media` | Built-in (YouTube/Spotify/SoundCloud search+play) | None |

### Domain Agents (10 total)

| Agent | Lines | Sites | Key Pattern |
|-------|-------|-------|-------------|
| **JobAgent** | ~60 files | LinkedIn, Naukri, Instahyre, Hirist, Cutshort | Cognitive LLM-first apply with resume parsing, form autofill, multi-step questionnaires, CAPTCHA/OTP detection |
| **BookingAgent** | 1291 | OpenTable, Resy, Booking, Expedia, Airbnb, Ticketmaster, StubHub, Zocdoc, Calendly | Never clicks confirm button |
| **CalendarAgent** | 1195 | Google Calendar, Outlook | Opens create form but doesn't Save |
| **EmailAgent** | 652 | Gmail, Outlook | Compose/send always requires approval |
| **FinanceAgent** | 652 | SBI, HDFC, ICICI, Axis, Kotak, PayTM, GooglePay, PhonePe | Bill payment approval-gated |
| **FoodAgent** | 1214 | Yelp, Google Maps, OpenTable, DoorDash, UberEats, GrubHub | Never clicks confirm for orders |
| **ResearchAgent** | 688 | Google, Bing | 5 sources max, 6000 chars/page, cross-source synthesis |
| **ShoppingAgent** | 893 | Amazon, eBay, Walmart | Stops before Place Order, clips coupons |
| **SocialAgent** | 852 | Twitter/X, LinkedIn | Default action is `draft` for safety |
| **TravelAgent** | 1030 | Google Flights, Kayak, Expedia, Skyscanner, Booking.com, Airbnb | Never auto-books |

### Job Agent Cognition System

**TaskAgent** (565 lines) — Universal observe→reason→act→verify→learn loop:
1. Cache-first selector lookup (skip LLM if proven selector exists)
2. THINK: ReasoningEngine.decide() → NextAction
3. Confidence/Risk gate (min 0.45, max risk 0.85)
4. Firewall: hard_block() rejects credit-card/SSN/CVV unconditionally
5. Critic: Second-opinion LLM for consequential actions
6. Approval gate for sensitive actions
7. Dry run: Record but don't execute
8. Page action via ToolExecutor
9. Learn: Remember selector + push to global Redis cache

**Memory System:** LongMemory (JSON, 500 lessons + 2000 applications), SelectorMemory (per-domain + Redis `omnitask:selector:cache:{domain}`), ShortMemory (volatile goal/URL/subgoals/facts/recent_actions), VectorMemory (JSONL + cosine), ExperienceStore (append-only), PatternLearning (domain tallies)

**Models:** LocalLLMClient (Ollama or llama-cpp-python, default `qwen2.5:7b-instruct`), LocalVision (`qwen2.5vl:7b`), ModelRegistry (JSON, GGUF tracking, SHA-256 integrity, rollback)

**Resume Parser** (415 lines): PDF (pdfplumber/PyPDF2) + DOCX. Extracts: name, location, target_roles, email, phone, LinkedIn, GitHub, 40+ skills, experience_years (3-tier detection), education.

**Portal Implementations:** NaukriPortal (560 lines), LinkedInPortal (651 lines — Easy Apply multi-step), InstahyrePortal (590 lines), HiristPortal (459 lines), CutshortPortal (404 lines)

### Python Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `BROWSER_PY_LOG_LEVEL` | `INFO` | Logging |
| `PLAYWRIGHT_HEADLESS` | (headless) | `false` for GUI |
| `REDIS_HOST/PORT/PASSWORD` | localhost:6379 | Redis connection |
| `REDIS_MAX_CONNECTIONS` | 50 | Pool size |
| `BROWSER_PY_HEALTH_PORT` | 8000 | Health endpoint |
| `PY_STREAM_QUALITY` | 60 | JPEG quality |
| `BROWSER_MAX_RECOVERIES` | 2 | Crash recovery attempts |
| `BROWSER_PROFILES_DIR` | `./profiles/` | Profile storage |
| `BROWSER_PROFILE_MAX_MB` | 750 | Disk quota per profile |
| `BROWSER_CONTEXT_IDLE_S` | 1800 | Context idle timeout (30min) |
| `PY_LLM_MODEL` | `llama-3.3-70b-versatile` | Text model |
| `PY_VISION_MODEL` | `llama-4-scout-17b-16e-instruct` | Vision model |

### Dependencies
```
playwright>=1.44.0
redis>=5.0.0
openai>=1.30.0
```

---

## Testing

```bash
# Backend (Jest + ts-jest)
cd apps/backend
NODE_OPTIONS="--max-old-space-size=6144" npx jest --forceExit --maxWorkers=1

# Run specific spec
npx jest --testPathPattern="memory/memory.service.spec"

# Fast isolated mode
npx jest --globals='{"ts-jest":{"isolatedModules":true}}' --testPathPattern="config/"

# Frontend (Vitest)
cd apps/frontend
npx vitest
```

**Current state:** 54 spec files, 688 test cases, 630+ passing. 33 failures are pre-existing ExecutionEngineService constructor mismatch.

**Note:** Full suite requires ~6GB heap due to ts-jest transpilation. Use `--maxWorkers=1` and `NODE_OPTIONS="--max-old-space-size=6144"`.

---

## LLM Integration

### Providers
- **Primary:** Groq (llama-3.3-70b, llama-4-scout) — free tier, fast
- **Fallback:** OpenRouter (multiple models)
- **Tertiary:** OpenAI (GPT-4o for vision)
- **Local (Python):** Ollama (`qwen2.5:7b-instruct` for cognition, `qwen2.5vl:7b` for vision)

### Model Config
```typescript
LLM_MODEL = 'llama-3.3-70b-versatile'              // Main reasoning
LLM_MODEL_MINI = 'llama-3.1-8b-instant'            // Light tasks (planning, drafts)
LLM_VISION_MODEL = 'llama-4-scout-17b-16e-instruct' // Vision analysis
```

### Cost Tracking (per 1K tokens)
| Model | Input | Output |
|-------|-------|--------|
| llama-3.3-70b-versatile | $0.00059 | $0.00079 |
| llama-3.1-8b-instant | $0.00005 | $0.00005 |
| gpt-4o | $0.00250 | $0.01000 |

### Retry
HTTP 429/503/502 retried with exponential backoff: `delay = baseMs * 2^attempt + random(0..200)ms`, max 3 attempts.

---

## Working Conventions

### Non-Negotiables
1. **Every query touching user data MUST be scoped to `userId`** — no cross-tenant leakage
2. **No hardcoded secrets** — all keys via ConfigService / process.env
3. **Run `npx tsc --noEmit` after changes** — zero errors before committing
4. **Every new service must be in its module's `providers[]`** — dead code otherwise
5. **New Prisma fields need a migration file** — never `db push` in prod
6. **Check `grep -rn "forwardRef"` before new module wiring** — prefer shared modules over cycles

### Code Style
- NestJS injectable services with constructor DI
- Zod for runtime validation (API inputs, LLM outputs, env vars)
- `@nestjs/schedule` + `@Cron()` for scheduled jobs
- BullMQ for async job processing (agent steps, task execution)
- Event-driven via `EventEmitter2` + Socket.IO for real-time
- Cursor-based pagination (base64url encoded) preferred over offset

### Commit Messages
- Format: `fix:`, `feat:`, `refactor:`, `test:`, `docs:`
- Keep them concise, explain the "why"

---

## Known Issues & Technical Debt

1. **ExecutionEngineService specs**: 33 tests failing (pre-existing, constructor mismatch after DI refactoring)
2. **Memory OOM in tests**: Jest + ts-jest uses ~2GB for transpilation. Use `--maxWorkers=1 --max-old-space-size=6144`
3. **forwardRef count**: 8 remaining (4 intentional AgentModule↔ToolsModule circular deps documented in audit)
4. **pgvector drift**: `Memory.embedding` is `Float[]` in Prisma but `vector(1536)` in DB — deliberate, must hand-write vector migrations
5. **Python engine optional**: Backend works without browser-py running (steps go through Bull queue only)
6. **K8s scaffolded only**: `infra/k8s/` contains barrel exports and empty secrets, no actual manifests
7. **Domain service stubs**: Media (YouTube/Spotify), Travel (flights/hotels), some Shopping results are hardcoded stubs
8. **Deploy script**: No rollback logic — simple stop-rebuild-start cycle

---

## API Endpoints (Key Routes)

All prefixed with `/api` (set in `main.ts`).

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| POST | `/auth/register` | No | Create account |
| POST | `/auth/login` | No | JWT login |
| POST | `/auth/refresh` | No | Refresh token (rotates) |
| POST | `/auth/logout` | JWT | Logout (deletes session) |
| GET | `/auth/google` | No | Google OAuth redirect |
| GET | `/auth/google/callback` | No | Google OAuth callback |
| GET | `/auth/me` | JWT | Current user profile |
| GET | `/auth/csrf-token` | No | Get CSRF token |
| GET | `/tasks` | JWT | List user tasks (cursor pagination) |
| POST | `/tasks` | JWT | Create + plan + queue task |
| POST | `/tasks/:id/execute` | JWT | Execute a planned task |
| PATCH | `/tasks/:id/cancel` | JWT | Cancel running task |
| POST | `/agent/parse-goal` | JWT | Parse NL goal |
| POST | `/agent/start-goal` | JWT | Start goal execution |
| POST | `/agent/session/:id/command` | JWT | Send NL interrupt |
| POST | `/agent/approval/:id/respond` | JWT | Respond to approval |
| GET | `/health` | No | Liveness probe |
| GET | `/health/ready` | No | Readiness (DB+Redis+Queue) |
| * | `/memory/*` | JWT | Memory CRUD + search |
| * | `/webhooks/*` | JWT | Webhook management |
| * | `/voice/*` | JWT | Voice input/output |
| * | `/billing/*` | JWT | Stripe billing |
| * | `/teams/*` | JWT | Team management |
| * | `/gdpr/*` | JWT | Data export/deletion |
| * | `/vault/*` | JWT | Credential vault |
| * | `/job/*` | JWT | Job agent (launch/stop/preferences) |
| * | `/shopping/*` | JWT | Shopping (preferences/evaluate/watch) |
| * | `/food/*` | JWT | Food (restaurants/orders/recipes) |
| * | `/travel/*` | JWT | Travel (flights/hotels/itinerary) |
| * | `/social/*` | JWT | Social (posts/analytics/trends) |
| * | `/email/*` | JWT | Email (accounts/messages/categorize) |
| * | `/calendar/*` | JWT | Calendar (connect/events/find-time) |
| * | `/media/*` | JWT | Media (search/play/queue) |
| * | `/feedback/*` | JWT | Task feedback |
| * | `/ab-testing/*` | JWT | Strategy testing |
| * | `/admin/*` | Admin | System admin |
| GET | `/api/metrics` | No | Prometheus metrics |

---

## Docker & Deployment

### Development (`docker-compose.yml`)
```bash
docker compose up -d postgres redis
```
3 services: PostgreSQL 16 (Alpine), Redis 7 (Alpine), Worker (BullMQ)

### Production (`docker-compose.prod.yml`)
12 services: frontend, backend, postgres (password), redis (requirepass), worker, **nginx** (1.27, SSL via certbot), **certbot** (Let's Encrypt, 12h renewal), **prometheus** (v2.52, 30d retention), **grafana** (v11, pre-configured), node-exporter, postgres-exporter, redis-exporter

### Nginx Production
- 4096 worker connections, gzip level 6
- Rate limiting: general 10r/s (burst 20), API 30r/s (burst 50)
- HTTP→HTTPS redirect, TLSv1.2+1.3
- WebSocket `proxy_read_timeout 86400` (24h)
- Security headers: X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy
- `/grafana/` proxied to grafana:3000

### Production Checklist
- Run `prisma migrate deploy` (not `db push`)
- Set `NODE_ENV=production` (enables strict secret validation)
- Set strong `JWT_SECRET` (64+ hex chars)
- Configure `FRONTEND_URL` for CORS
- Run `npm run prisma:post-deploy` for pgvector indexes

---

## CI/CD (GitHub Actions)

**File:** `.github/workflows/deploy.yml`

| Job | Trigger | What it does |
|-----|---------|--------------|
| Lint | push/PR | ESLint on backend + frontend |
| Test (15min) | push/PR | Jest (backend), Vitest (frontend), pytest (browser-py) against Postgres + Redis service containers |
| Build & Push (30min) | push to `main` | Docker Buildx → Docker Hub (SHA+branch+latest tags), GHA cache |
| Deploy (10min) | push to `main` | SSH to prod, git pull, pull images, run `scripts/deploy.sh`, Sentry source maps |

**Concurrency:** `production-deploy` group (no cancel-in-progress)

Dependabot configured for 4 ecosystems (github-actions, npm backend, npm frontend, pip browser-py), weekly, ignores semver-major.

---

## Monitoring Stack (Production)

| Service | Purpose |
|---------|---------|
| Prometheus v2.52 | Scrapes: backend:4000/api/metrics, node-exporter:9100, postgres-exporter:9187, redis-exporter:9121 (15s interval) |
| Grafana v11 | 7-panel dashboard: HTTP rate, P95 latency, WebSocket connections, queue depth, DB P95, 5xx rate, memory usage |
| Node Exporter | Host metrics |
| Postgres Exporter | Database metrics |
| Redis Exporter | Cache/queue metrics |
| OpenTelemetry | Distributed tracing (auto-instrumentations: HTTP/Express/NestJS, OTLP proto exporter) |
| Sentry | Error tracking (optional, via `SENTRY_DSN`) |

---

## Security Features

- **CSRF** — double-submit cookie (64-byte token, sameSite:strict, secure in prod; Bearer bypass)
- **Helmet** — security headers
- **Rate limiting** — `@nestjs/throttler` (TierThrottlerGuard — plan-based: free:30, premium:200, admin:1000 req/60s)
- **Idempotency** — guard with 24h TTL + in-flight dedup
- **Input validation** — class-validator (global ValidationPipe, whitelist+forbidNonWhitelisted) + Zod
- **Credential vault** — AES-256-GCM (PBKDF2 SHA-512, 600K iterations, 32-byte salt, 16-byte IV)
- **Audit logging** — fire-and-forget on all sensitive operations
- **Approval gates** — HIGH/CRITICAL risk browser actions pause for WebSocket user confirmation
- **Soft deletes** — `deletedAt` on user data (GDPR compliance)
- **Correlation IDs** — UUID v4 `x-request-id` on every request
- **OpenTelemetry** — traces to OTLP endpoint
- **Sentry** — error tracking (optional)
- **Auth hardening** — timing-equalized login, hashed refresh tokens, token rotation, force-logout on password reset
- **Browser stealth** — navigator.webdriver override, fake chrome object, plugin spoofing
- **Agent firewalls** — hard_block() for credit-card/SSN/CVV fields, never auto-fill passwords

---

## Scheduled Jobs

| Schedule | Service | Purpose |
|----------|---------|---------|
| Every hour | MemoryConsolidationService | Decay importance (×0.95, floor 0.1) + dedup facts |
| Daily 3 AM | MemoryConsolidationService | Full consolidation (promote WORKING→EPISODIC, prune expired, prune low-importance) |
| Every hour | WebhookService | Cleanup soft-deleted webhooks > 30 days |
| Every hour | ScheduledTaskService | Run cron-based user task schedules |
| Every hour | IdempotencyService | Cleanup expired idempotency keys (24h) |
| Daily midnight | GdprService | Enforce retention policies (delete old audit logs/sessions/memories, anonymize long-deleted users) |

---

## Makefile Targets

| Target | What it does |
|--------|-------------|
| `make setup` | install + infra + db |
| `make stack` | infra + (pnpm dev & python main.py &) with trap |
| `make infra` / `infra-down` | docker compose up/stop postgres redis |
| `make db` | pnpm db:push |
| `make app` | pnpm dev |
| `make engine` | python apps/browser-py/main.py |
| `make worker` | pnpm dev:worker |
| `make build` / `start` / `stop` | docker-compose prod build/up/down |
| `make clean` | docker-compose down -v + system prune |

---

## File Naming Conventions

- Services: `*.service.ts`
- Controllers: `*.controller.ts`
- Modules: `*.module.ts`
- Specs: `*.spec.ts` (co-located with source)
- DTOs: `dto/*.dto.ts`
- Guards: `guards/*.guard.ts` or `*.guard.ts`
- Interfaces: `*.interface.ts`
- Utils: `utils/*.util.ts` or `*.util.ts`
- Stages: `stages/*.stage.service.ts`
- Prompts: `prompts/*.ts`
- Skills: `skills/*.skill.ts` (backend) / `skills/*.py` (Python)
- Agents: `agents/*.agent.ts` (backend) / `agents/*_agent/` (Python)
