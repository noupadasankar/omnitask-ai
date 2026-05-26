# ARCHITECTURE.md — OmniTask AI

> **Engineered at the intersection of autonomous systems, distributed computing, and adaptive AI.**
> Every folder has a reason. Every file has a contract. Every decision has a rationale.

---

## Table of Contents

1. [North Star Principle](#1-north-star-principle)
2. [System Overview Diagram](#2-system-overview-diagram)
3. [Why Modular Monolith, Not Microservices](#3-why-modular-monolith-not-microservices)
4. [The Five Subsystems](#4-the-five-subsystems)
5. [Request Lifecycle](#5-request-lifecycle)
6. [Task Execution Flow — Deep Dive](#6-task-execution-flow--deep-dive)
7. [Planning Engine Architecture](#7-planning-engine-architecture)
8. [Execution Engine Architecture](#8-execution-engine-architecture)
9. [Browser Isolation Model](#9-browser-isolation-model)
10. [Memory Architecture — Three Layers](#10-memory-architecture--three-layers)
11. [Agent System Architecture](#11-agent-system-architecture)
12. [Real-Time Communication](#12-real-time-communication)
13. [Security Architecture](#13-security-architecture)
14. [Queue Architecture](#14-queue-architecture)
15. [Database Design](#15-database-design)
16. [File Storage Architecture](#16-file-storage-architecture)
17. [Frontend Architecture](#17-frontend-architecture)
18. [Observability Stack](#18-observability-stack)
19. [Scaling Strategy](#19-scaling-strategy)
20. [Decision Log — Why We Made These Choices](#20-decision-log--why-we-made-these-choices)

---

## 1. North Star Principle

Three rules govern every architectural decision in this codebase:

### Rule 1 — Simple Beats Clever

A solo developer maintaining a distributed system goes insane within 6 months. We choose the simplest architecture that can handle the load — and we make it easy to evolve, not over-engineer for hypothetical future scale.

### Rule 2 — LLM Output Is Untrusted Input

The LLM generates the plan. After generation, the plan is:

- **Validated** — Zod schema rejects any unknown action type
- **Hashed** — SHA-256 of canonical JSON creates an immutable fingerprint
- **Frozen** — execution engine only reads from the frozen plan

This means you can replay any task exactly, audit what ran, and compare runs A and B by hash.

### Rule 3 — Agent Acts as User = Maximum Threat Surface

An agent that can browse, click, submit, and buy things is more dangerous than a database with admin credentials. Every action passes through:

1. Policy engine (domain + action rules)
2. Approval gate (CAPTCHA, payment pages, policy-required)
3. Consent logger (immutable audit trail)

---

## 2. System Overview Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              USER LAYER                                  │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  Next.js 14 Frontend (App Router)                               │    │
│  │  Command Input │ Execution Room │ File Vault │ Memory Search    │    │
│  │  Approval Modal │ Skill Library │ Scheduler UI │ Settings       │    │
│  └──────────────────────────┬──────────────────────────────────────┘    │
│                             │ HTTPS REST + WSS WebSocket                 │
└─────────────────────────────┼────────────────────────────────────────────┘
                              │
┌─────────────────────────────▼────────────────────────────────────────────┐
│                            API LAYER (NestJS + Fastify)                   │
│                                                                           │
│  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌──────────────────┐  │
│  │  Auth   │ │  Tasks  │ │ Planning │ │  Files  │ │   Approvals      │  │
│  └─────────┘ └─────────┘ └──────────┘ └─────────┘ └──────────────────┘  │
│  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌──────────────────┐  │
│  │ Memory  │ │ Skills  │ │Scheduler │ │Policies │ │   Notifications  │  │
│  └─────────┘ └─────────┘ └──────────┘ └─────────┘ └──────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────────┐   │
│  │  Shared: Queue │ WebSocket Gateway │ Cache │ Monitoring │ Crypto  │   │
│  └───────────────────────────────────────────────────────────────────┘   │
└──────────┬──────────────────────────────────────────────────┬────────────┘
           │ Prisma ORM                                        │ BullMQ
┌──────────▼────────────┐                          ┌──────────▼──────────────┐
│  PostgreSQL 16        │                          │  Redis 7                │
│  + pgvector ext       │                          │  Queue + Sessions       │
│  Primary datastore    │                          │  Rate limiting + Cache  │
└───────────────────────┘                          └──────────┬──────────────┘
                                                              │ pulls jobs
┌─────────────────────────────────────────────────────────────▼──────────────┐
│                  WORKER PROCESS (Separate Docker Container)                 │
│                                                                             │
│  BullMQ Consumer → ExecutionService → AgentOrchestrator                    │
│       ↓                                      ↓                             │
│  BrowserPoolService            BrowserAgent / APIAgent / FileAgent         │
│       ↓                                      ↓                             │
│  Playwright (Chromium)           Screenshots + DOM Snapshots               │
│  Per-user isolated contexts      WebSocket events to frontend              │
└──────────────────────────────────────────┬──────────────────────────────────┘
                                           │ S3 API
┌──────────────────────────────────────────▼──────────────────────────────────┐
│                    FILE STORAGE (MinIO dev / Cloudflare R2 prod)             │
│              Screenshots │ Downloads │ PDFs │ DOM Snapshots │ Resumes        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Why Modular Monolith, Not Microservices

This is the most important architectural decision. Here is the full reasoning:

### What microservices actually cost

- Service discovery (Consul, Kubernetes DNS)
- Distributed tracing (every request spans multiple services)
- Network retry storms (service A calls service B which calls service C — any failure cascades)
- API versioning across services
- Separate deployment pipelines per service
- Separate logging contexts that must be correlated by trace ID
- A DevOps burden that consumes 40% of solo dev time

### What we did instead

Single NestJS application with 14 strictly isolated domain modules. Each module:

- Has its own controller, service, repository, DTOs, entities
- Declares explicit `imports` and `exports` — no accidental coupling
- Can be extracted to a separate service later by copying one folder

The **only** exception is the `worker/` process — extracted because Playwright + Chromium is 400–600MB RAM per browser instance. Putting that inside the API server would OOM-kill it under load.

### The upgrade path to microservices

```
Phase 1-4:  Single NestJS + Worker container
Phase 5:    Worker scales independently via K8s HPA
Phase 6+:   Extract high-traffic modules if needed
            (planning → separate service if 1000+ concurrent users)
```

---

## 4. The Five Subsystems

```
┌─────────────────────────────────────────────────────────────────┐
│  1. USER LAYER           Next.js 14 Dashboard                   │
│     Command Center, Execution Room, File Vault, Memory Search   │
├─────────────────────────────────────────────────────────────────┤
│  2. BRAIN LAYER          Planning Engine                        │
│     Intent → Plan → Validate → Hash → Risk Score               │
├─────────────────────────────────────────────────────────────────┤
│  3. EXECUTION LAYER      Agent Orchestrator + Playwright        │
│     Plan → Steps → Browser → Results → Checkpoints             │
├─────────────────────────────────────────────────────────────────┤
│  4. MEMORY LAYER         pgvector + Redis                       │
│     Episodic + Semantic + Working memory                        │
├─────────────────────────────────────────────────────────────────┤
│  5. ORCHESTRATION LAYER  BullMQ + Redis Queues                  │
│     tasks | planning | memory | notifications                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Request Lifecycle

Every HTTP request follows this exact path:

```
Client Request
      ↓
Nginx (SSL termination, rate limiting)
      ↓
Fastify HTTP Server (port 4000)
      ↓
Global Interceptors:
  - LoggingInterceptor (structured request logging)
  - TimeoutInterceptor (30s default, 120s for browser endpoints)
      ↓
Route matching → Controller
      ↓
Guards:
  - JwtAuthGuard (validates Bearer token, attaches user)
  - RolesGuard (admin-only routes)
  - ThrottleGuard (per-user rate limiting)
      ↓
Pipes:
  - ValidationPipe (class-validator on DTOs)
  - SanitizePipe (strip dangerous characters)
      ↓
Controller method (validates input, delegates to service)
      ↓
Service (all business logic lives here)
      ↓
Repository → Prisma ORM → PostgreSQL
      ↓
TransformInterceptor (wraps response in { data, meta })
      ↓
Response to client
```

---

## 6. Task Execution Flow — Deep Dive

### The complete journey from "Apply to jobs" to "5 applications submitted"

```
Step 1: User submits task
─────────────────────────────
POST /api/v1/tasks
{
  "naturalLanguage": "Apply to remote TypeScript jobs on LinkedIn",
  "shadowMode": false,
  "priority": 8
}

Step 2: Task record created
─────────────────────────────
Prisma: Task { id, userId, status: QUEUED, ... }
BullMQ: Job pushed with jobId = task.id
WebSocket: emit task:created to user

Step 3: Intent classification
─────────────────────────────
IntentClassifier.classify("Apply to remote TypeScript jobs on LinkedIn")
→ { category: "JOB_APPLICATION", requiresClarification: false }

Step 4: Memory retrieval
─────────────────────────────
MemoryService.retrieveRelevant(userId, input, { limit: 5 })
→ pgvector cosine search returns 3 similar past plans
→ Injected as context into GPT prompt

Step 5: LLM Plan generation
─────────────────────────────
OpenAI GPT-4o (json_object mode, temperature: 0.1)
→ Returns structured JSON plan

Step 6: Plan validation
─────────────────────────────
PlanValidator.validate(rawPlan)
→ Zod schema: checks all actions are in ALLOWED_ACTIONS
→ Checks selectors for injection attempts
→ Verifies URL format for navigate actions
→ Caps steps at 100

Step 7: Risk scoring
─────────────────────────────
RiskScorer.score(plan)
→ Scans each step for: payment keywords, delete actions, login forms
→ Returns riskScore: 0.0–1.0
→ If > 0.7: plan flagged for pre-execution approval

Step 8: Plan hashing + storage
─────────────────────────────
PlanHasher.hash(plan) → SHA-256 of canonical JSON → "a3f7c2..."
Prisma: Plan { taskId, hash, steps, tokensUsed }
Task.status → PLANNING

Step 9: Queue pickup
─────────────────────────────
BullMQ Worker picks up job (< 2 seconds)
ExecutionService.executePlan({ taskId, userId, plan })

Step 10: Browser launch
─────────────────────────────
BrowserPoolService.acquireContext(userId)
→ Reuse existing context OR create new isolated Chromium context
→ Anti-bot evasion: navigator.webdriver = undefined
→ Resource blocking: images, fonts, ad/tracking domains

Step 11: Execution loop
─────────────────────────────
For each step (i=0 to plan.steps.length-1):

  a) Circuit breaker check (is user's domain blocked?)
  b) Policy evaluation (PolicyEngine.evaluate(userId, url, action))
  c) Approval gate check:
     - CaptchaDetector.detect(page) → any CAPTCHA?
     - CaptchaDetector.isPaymentPage(page) → payment form?
     - policy.requireApproval → policy-required?
     If any: pause task, emit approval:required, wait up to 10 min
  d) Checkpoint save (so we can resume if worker crashes)
  e) Step execution:
     RetryService.withBackoff(() =>
       PlaywrightService.executeStep(page, step)
     , { maxAttempts: 3, strategy: 'exponential' })
  f) On failure: PlanRepairService.repair(step, error, domSnapshot)
  g) Save step result + screenshot to DB
  h) Emit task:step-done via WebSocket

Step 12: Post-completion
─────────────────────────────
Task.status → COMPLETED
MemoryService.store(userId, taskSummary, plan)  ← async, non-blocking
SkillDetector.check(userId, planHash)           ← auto-promote if repeated
WebSocket: emit task:complete
Notification queue: email/push if user preference set
```

---

## 7. Planning Engine Architecture

The planner is the most critical — and most likely to go wrong — component.

### Defense in depth

```
User Input (string)
        ↓
IntentClassifier
  → GPT-3.5-turbo (cheap, fast)
  → Classify: BROWSER_TASK | API_TASK | FILE_TASK | AMBIGUOUS
  → If AMBIGUOUS: throw AmbiguousTaskException with clarification question
        ↓
MemoryRetriever
  → pgvector cosine search: top-5 similar past successful plans
  → Injected as few-shot context into prompt
        ↓
PlanCacheService
  → SHA-256 hash of normalized input
  → Cache hit → return cached plan (saves GPT tokens)
        ↓
OpenAI GPT-4o
  → json_object response format (guaranteed valid JSON)
  → temperature: 0.1 (low = consistent, structured)
  → System prompt with ALLOWED_ACTIONS schema
  → Few-shot examples (3 high-quality plans)
  → Memory context injection
        ↓
PlanValidator (Zod schema)
  → Reject any action not in ALLOWED_ACTIONS
  → Validate URL format for navigate steps
  → Check selector safety (no script injection)
  → Enforce step count limit (max 100)
  → Enforce description presence (each step must explain itself)
        ↓
PlanRepairService (if validation failed)
  → Send failed plan + errors back to GPT with repair prompt
  → Max 2 repair attempts
  → If still failing: throw PlanGenerationException
        ↓
RiskScorer
  → Scans for destructive keywords per step
  → Scores: login (0.3), form_submit (0.4), payment (0.9), delete (0.95)
  → Aggregate risk = weighted max across steps
        ↓
PlanHasher
  → JSON.stringify with sorted keys (canonical form)
  → SHA-256 hash
        ↓
IValidatedPlan { goal, steps[], hash, riskScore, tokensUsed }
```

### Why temperature 0.1?

Higher temperature = more creative = more hallucinated action types. At 0.1, the LLM stays close to its few-shot examples and reliably produces valid plan schemas. The creativity you want comes from prompt context (memories), not from sampling.

---

## 8. Execution Engine Architecture

### State machine

```
QUEUED ─────────────────────────────────────────────────► CANCELLED
  │
  ▼
PLANNING ──────────────────────────────────────────────── FAILED
  │
  ▼
AWAITING_APPROVAL ─────────────────────────────────────── FAILED (expired)
  │ (user approves)
  ▼
RUNNING ────────────────────────────────────────────────── FAILED
  │       ↑
  │   PAUSED (mid-task approval gate)
  │
  ▼
COMPLETED
```

Rules:

- States only move FORWARD (no COMPLETED → RUNNING)
- FAILED tasks can be manually resumed from last checkpoint
- CANCELLED is terminal — cannot be restarted

### Compensation pattern

If a task fails at step 7 after completing steps 0-6, the CompensationService runs in reverse:

```typescript
// Step 6: Uploaded a file → CompensationStep: delete the uploaded file
// Step 5: Clicked "Submit Draft" → CompensationStep: can't undo (log it)
// Step 4: Filled a form → CompensationStep: navigate away (form abandoned)
// Steps 0-3: Read-only → no compensation needed
```

Not all steps are compensatable (form submissions are fire-and-forget). Steps marked `compensatable: false` are logged as orphaned and flagged for manual review.

### Circuit breaker

```typescript
// Per-user domain circuit breaker
// After 5 consecutive failures on the same domain:
//   → Open: block that domain for 5 minutes
//   → Half-open: allow 1 request, if success → close
//   → Closed: normal operation
```

Prevents the agent from hammering a flaky site and exhausting browser resources.

---

## 9. Browser Isolation Model

Each user gets a completely isolated Playwright `BrowserContext`:

```
Single Chromium process (shared)
    ├── UserContext: alice@example.com
    │       ├── Page 1 (task ABC)
    │       └── Page 2 (task DEF, parallel)
    └── UserContext: bob@example.com
            └── Page 1 (task GHI)
```

Isolation guarantees:

- **Cookies**: Alice's LinkedIn session cannot leak to Bob
- **localStorage / sessionStorage**: Completely separate
- **Network requests**: No shared headers or auth tokens
- **Cache**: Separate per context

### Anti-detection stack

```typescript
// Applied to every new context:
await context.addInitScript(() => {
  // Remove webdriver flag
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  // Fake Chrome runtime
  window.chrome = { runtime: {}, loadTimes: () => {}, csi: () => {} };
  // Fake permissions
  const originalQuery = navigator.permissions.query;
  navigator.permissions.query = (params) =>
    params.name === 'notifications' ? Promise.resolve({ state: 'denied' }) : originalQuery(params);
});
```

### Resource blocking (performance + privacy)

```typescript
// Block unnecessary resources — 40-60% faster page loads
await context.route('**/*.{png,jpg,gif,webp,woff,woff2,ttf}', (r) => r.abort());
await context.route(/google-analytics|facebook\.com\/tr|doubleclick/, (r) => r.abort());
```

---

## 10. Memory Architecture — Three Layers

```
┌─────────────────────────────────────────────────────────┐
│                    MEMORY ARCHITECTURE                   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  EPISODIC MEMORY (long-term, persisted)          │   │
│  │  "What did I do in past tasks?"                  │   │
│  │  Storage: PostgreSQL + pgvector                  │   │
│  │  Retrieval: cosine similarity search             │   │
│  │  TTL: 90 days (auto-pruned by MemoryPruner)      │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  SEMANTIC MEMORY (long-term, persisted)          │   │
│  │  "What general knowledge do I have?"             │   │
│  │  Storage: PostgreSQL + pgvector                  │   │
│  │  Content: promoted skills + domain knowledge     │   │
│  │  TTL: permanent (manually managed)               │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  WORKING MEMORY (short-term, in-flight only)     │   │
│  │  "What do I know right now in this task?"        │   │
│  │  Storage: Redis (task TTL: 24 hours)             │   │
│  │  Content: step outputs, extracted data           │   │
│  │  Scope: single task execution only               │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Retrieval flow for "do what I did last week for job applications"

```
Query: "do what I did last week for job applications"
    ↓
EmbeddingService.embed(query)
→ OpenAI text-embedding-ada-002 → float[1536]
    ↓
pgvector query:
  SELECT *, 1 - (embedding <=> $1::vector) AS similarity
  FROM "Memory"
  WHERE "userId" = $2
    AND type = 'EPISODIC'
    AND "createdAt" > NOW() - INTERVAL '14 days'
  ORDER BY similarity DESC
  LIMIT 5
    ↓
Returns: [
  { content: "Applied to TypeScript jobs on LinkedIn", similarity: 0.94, plan: {...} },
  { content: "Searched for remote React positions", similarity: 0.87, plan: {...} }
]
    ↓
Injected into GPT-4o prompt as context
→ GPT produces a plan that closely mirrors the successful past pattern
```

### Memory pruning strategy

```typescript
// MemoryPruner runs weekly via scheduler
// Pruning rules (in priority order):
// 1. Delete expired (expiresAt < NOW())
// 2. Delete zero-access memories older than 30 days
// 3. If user over quota: delete lowest importance, oldest first
// 4. Keep minimum 100 memories per user regardless
```

---

## 11. Agent System Architecture

### The agent contract

```typescript
interface IAgent {
  readonly type: AgentType;

  // Router uses this to select the right agent for each step
  canHandle(step: PlanStep): boolean;

  // Single-responsibility: do one thing, do it well
  execute(input: AgentInput): Promise<AgentOutput>;
}
```

### Agent routing

```
PlanStep arrives
      ↓
AgentRouter.route(step)
      ↓
  Iterate registered agents:
  - BrowserAgent.canHandle(step) → true if action ∈ BROWSER_ACTIONS
  - APIAgent.canHandle(step) → true if action === 'api_call'
  - FileAgent.canHandle(step) → true if action ∈ FILE_ACTIONS
  - ResearchAgent.canHandle(step) → true if action === 'research'
      ↓
First match wins → agent.execute(input)
```

### Agent registry (auto-discovery via NestJS DI)

```typescript
@Injectable()
export class AgentRegistry {
  private agents: IAgent[] = [];

  register(agent: IAgent) {
    this.agents.push(agent);
  }

  resolve(step: PlanStep): IAgent {
    const agent = this.agents.find((a) => a.canHandle(step));
    if (!agent) throw new UnreachableStepException(step.action);
    return agent;
  }
}
```

### Agent hierarchy

```
SupervisorAgent
    ├── BrowserAgent (Playwright — 90% of tasks)
    ├── APIAgent (direct HTTP — faster for API-native tasks)
    ├── FileAgent (PDF, Excel, CSV processing)
    ├── ResearchAgent (multi-page search + synthesis)
    ├── DataAgent (CSV transform, JSON schema inference)
    └── NotificationAgent (email, Slack, webhooks)
```

---

## 12. Real-Time Communication

### Socket.io room architecture

```
WebSocket Server
    ├── Room: user:alice123          ← Alice's personal room
    │       receives all Alice's events
    │
    ├── Room: task:taskABC           ← Per-task granular room
    │       receives only events for task ABC
    │       Alice joins this when she opens task detail
    │
    └── Room: admin:global           ← Admin monitoring room (admin users only)
```

### Event taxonomy

```typescript
// Server → Client events
'task:created'; // Task queued
'task:status'; // Status change (QUEUED → PLANNING → RUNNING → DONE)
'task:step-start'; // Step i beginning
'task:step-done'; // Step i completed (success or failure)
'task:log'; // Real-time log line (info/success/warning/error)
'approval:required'; // Agent needs human input
'task:complete'; // Final success
'task:failed'; // Final failure with error

// Client → Server events
'approval:resolve'; // User approved or denied
'task:cancel'; // User cancelled task
'watch:task'; // Join task-specific room
```

### Authentication on connection

```typescript
// ws-jwt.middleware.ts
socket.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  try {
    const payload = jwtService.verify(token, { secret: JWT_SECRET });
    socket.data.userId = payload.sub;
    socket.join(`user:${payload.sub}`);
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
});
```

---

## 13. Security Architecture

### The threat model

OmniTask AI acts as the user. That means it can:

- Log into any website with user's credentials
- Submit forms, buy things, delete accounts
- Read any page the user can see
- Download files to the user's vault

This is the highest-threat-surface software possible outside of OS-level access. We respond with layered defenses.

### Layer 1 — Authentication

```
JWT access token (15 min TTL)
  ↓ expires
Refresh token (7 days TTL, stored as bcrypt hash in DB)
  ↓ rotation on use (old refresh token invalidated immediately)
MFA (TOTP, optional) — required for admin routes
OAuth2 (Google, GitHub) — token stored encrypted, never raw
```

### Layer 2 — Policy Engine

```typescript
// PolicyEngine evaluates rules in priority order (highest priority first)
// First matching rule wins

// Built-in rules (cannot be overridden by users):
{ domain: '*.bank.com', action: '*', decision: 'BLOCK' }
{ domain: 'paypal.com', action: '*', decision: 'REQUIRE_APPROVAL' }

// User-defined rules:
{ domain: 'linkedin.com', action: 'submit', decision: 'REQUIRE_APPROVAL' }
{ domain: 'github.com', action: 'navigate', decision: 'ALLOW' }

// Default (if no rule matches):
{ domain: '*', action: '*', decision: 'ALLOW' }
```

### Layer 3 — Approval Gate

All of these trigger mandatory human approval:

- CAPTCHA detected (hCaptcha, reCAPTCHA, Cloudflare)
- Login form detected (`input[type="password"]` visible)
- Payment page detected (Stripe iframe, card number fields)
- `policy.decision === 'REQUIRE_APPROVAL'`
- `plan.riskScore > 0.7`

Approval has a 10-minute TTL. After expiry: auto-deny, task fails gracefully.

### Layer 4 — Credential Vault

```
User provides LinkedIn password
    ↓
EncryptionService.encrypt(password, userKey)
→ AES-256-GCM with per-user key derived from their JWT secret
    ↓
Stored in DB: encrypted_credentials table
    ↓
At execution time:
EncryptionService.decrypt(encrypted, userKey)
→ Injected into browser context as session cookie / localStorage
→ Never logged, never in plain text anywhere
→ TTL: browser context lifetime (until releaseContext())
```

### Layer 5 — Consent Log (Immutable)

```typescript
// AuditInterceptor captures every sensitive operation
// Written to AuditLog table — never updated, only inserted
{
  userId: 'user123',
  action: 'FORM_SUBMIT',
  resource: 'linkedin.com/jobs/apply',
  metadata: { taskId, stepIndex, approvalId },
  ipAddress: '203.0.113.42',  // user's IP at approval time
  createdAt: '2025-01-15T10:31:00.000Z'
}
```

---

## 14. Queue Architecture

### Queue definitions

```
Queue: tasks (main task execution)
  Concurrency: 3 per worker pod
  Retries: 3, exponential backoff (2s → 4s → 8s)
  Job timeout: 10 minutes
  Dead letter: tasks:dlq

Queue: planning (LLM plan generation)
  Concurrency: 5 (limited by OpenAI RPM)
  Retries: 3
  Rate limit: 60 RPM (respects OpenAI free tier)

Queue: memory (embedding after task completes)
  Concurrency: 2 (OpenAI embeddings API)
  Retries: 5
  Delay: 5 seconds after task done (non-urgent)

Queue: notifications (email/push)
  Concurrency: 10
  Retries: 3

Queue: cleanup (daily housekeeping)
  Cron: 0 3 * * * (3 AM daily)
  Tasks: delete expired memories, orphaned files, old screenshots
```

### Dead letter processing

```
Job fails 3 times → moves to tasks:dlq
    ↓
SupervisorAgent polls DLQ every 5 minutes
    ↓
If job < 2 hours old: retry with HIGH priority
If job > 2 hours old: mark task FAILED, notify user, alert admin
```

### Worker horizontal scaling

```
Queue depth → 0-20 jobs:    1 worker pod (3 concurrent tasks)
Queue depth → 20-60 jobs:   2 worker pods (6 concurrent tasks)
Queue depth → 60-150 jobs:  5 worker pods (15 concurrent tasks)
Queue depth → 150+ jobs:    10 worker pods (30 concurrent tasks)

Kubernetes HPA config:
  metric: custom/bullmq_queue_depth{queue="tasks"}
  target: 20 (scale up if average > 20 per pod)
```

---

## 15. Database Design

### Key design decisions

**Why PostgreSQL over MongoDB**: Tasks have complex relational structure (Task → Steps → Approvals → Files). JOIN queries are constant. ACID transactions matter for state machine transitions. MongoDB fights you here.

**Why pgvector in PostgreSQL**: Keeps the stack simple (one DB service). pgvector with IVFFlat index handles millions of vectors. Upgrade to Pinecone at 10M+ memories/user.

**Why CUID over UUID**: CUIDs are sortable by creation time (first 8 chars encode timestamp), collision-resistant, and URL-safe without hyphens.

### Critical indexes

```sql
-- Most common: user's tasks, filtered by status
CREATE INDEX idx_task_user_status ON "Task"("userId", "status");

-- Dashboard: recent tasks
CREATE INDEX idx_task_created ON "Task"("createdAt" DESC);

-- Execution replay: step lookup
CREATE INDEX idx_step_execution_index ON "ExecutionStep"("executionId", "stepIndex");

-- Approval polling
CREATE INDEX idx_approval_user_status ON "Approval"("userId", "status");

-- Memory retrieval
CREATE INDEX idx_memory_user_type ON "Memory"("userId", "type");

-- Vector similarity search (IVFFlat, 100 lists for ~100k vectors)
CREATE INDEX idx_memory_embedding ON "Memory"
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Schedule runner: what needs to run next?
CREATE INDEX idx_schedule_next_run ON "Schedule"("nextRunAt", "enabled");
```

---

## 16. File Storage Architecture

### S3 key structure

```
{bucketName}/
└── {userId}/
    ├── {taskId}/
    │   ├── screenshots/
    │   │   ├── step-0-1703000000000.png
    │   │   └── step-5-1703000001000.png
    │   ├── downloads/
    │   │   └── invoice-january.pdf
    │   └── dom-snapshots/
    │       └── step-3.html.gz
    └── vault/
        ├── resume-2025.pdf
        └── cover-letter-template.docx
```

### Presigned URL flow

Files are NEVER proxied through the backend. Backend only generates presigned URLs:

```
Frontend: GET /api/v1/files/{id}/url
Backend:  S3.getSignedUrl({ key, expiresIn: 900 })
          → returns { url: "https://r2.cloudflarestorage.com/...?signature=..." }
Frontend: fetches the S3 URL directly
```

This removes the backend from the file serving hot path entirely. With R2 (zero egress), serving 10,000 screenshots costs $0 in egress fees.

### Deduplication via checksum

```typescript
// Before uploading:
const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
const existing = await prisma.file.findFirst({ where: { userId, checksum } });
if (existing) return existing; // same content already stored — return link, skip upload
```

---

## 17. Frontend Architecture

### App Router route groups

```
app/
├── layout.tsx              ← Root layout (providers, fonts)
├── page.tsx                ← Redirect to /dashboard
├── (auth)/                 ← Public routes (no sidebar)
│   ├── layout.tsx          ← Centered card layout
│   ├── login/page.tsx
│   └── register/page.tsx
└── (dashboard)/            ← Protected routes (with sidebar)
    ├── layout.tsx          ← Sidebar + Header + socket provider
    ├── dashboard/page.tsx  ← Stats + recent tasks
    ├── tasks/              ← Task list + task detail
    ├── execution/[taskId]/ ← Full-screen execution room
    ├── memory/             ← Semantic search UI
    ├── skills/             ← Skill cards + promote
    ├── files/              ← File vault
    ├── schedules/          ← Cron UI
    ├── approvals/          ← Pending approvals queue
    └── settings/           ← Profile, policies, billing
```

### State management architecture

```
Zustand stores (no Provider hell, works with App Router):
├── auth.store      user, token, isAuthenticated, refresh()
├── tasks.store     taskList, activeTask, optimisticUpdate()
├── execution.store stepStatuses, logs, screenshots, activeStep
├── approvals.store pendingApprovals, resolveApproval()
├── ui.store        sidebar, commandPalette, theme, toasts
└── websocket.store connectionStatus, subscribe(), unsubscribe()
```

### Server vs Client component boundary

```
Server Components (fetch data, render static):
  - page.tsx files (initial data load via fetch to API)
  - Layout shells
  - Static content

Client Components ('use client'):
  - TaskInput (interactive form)
  - ExecutionRoom (React Flow + live updates)
  - LogStream (socket updates)
  - ApprovalModal (user interaction)
  - CommandPalette (keyboard events)
  - All components with useEffect, useState, socket
```

---

## 18. Observability Stack

### What we instrument

```
Backend (NestJS):
  - Every HTTP request: method, path, status, duration
  - Every task state transition: taskId, fromStatus, toStatus, duration
  - Every LLM call: model, tokens_used, latency, success/fail
  - Every browser step: action, duration, success/fail
  - Queue metrics: waiting, active, completed, failed per queue
  - Memory operations: embed, retrieve, store

Worker (Playwright):
  - Browser launches: cold vs warm context
  - Page loads: url, load_time
  - Action executions: action_type, duration, retry_count
  - Memory usage: context_count, ram_per_context
```

### Prometheus metrics (key ones)

```
omnitask_tasks_total{status}                  Counter
omnitask_task_duration_ms{status}             Histogram
omnitask_llm_tokens_used{model}               Counter
omnitask_llm_latency_ms{model}                Histogram
omnitask_browser_contexts_active              Gauge
omnitask_browser_step_duration_ms{action}     Histogram
omnitask_queue_depth{queue}                   Gauge
omnitask_approvals_pending                    Gauge
```

### Grafana dashboards

```
1. Overview: tasks/hour, success rate, avg duration, active browsers
2. Tasks: detailed breakdown by status, user, agent type
3. Workers: RAM usage, context count, step throughput
4. LLM: tokens/hour, cost estimate, latency percentiles
5. Queue: depth over time, dead letter count
```

---

## 19. Scaling Strategy

### Phase 1-4 (0–100 users, $30/month)

```
Single DigitalOcean Droplet (4GB RAM, 2 vCPU):
  docker-compose with all 6 services
  1 worker container (3 concurrent browsers)
  PostgreSQL + Redis + MinIO on same machine
  Daily backup to R2
```

### Phase 5 (100–1000 users, $80/month)

```
Managed services replace self-hosted:
  PostgreSQL → Supabase ($25/month)
  Redis → Upstash ($10/month, serverless)
  Files → Cloudflare R2 ($0 egress)

3 separate droplets for workers (2GB each, $18/month)
1 droplet for API + Frontend (4GB, $24/month)
R2 bandwidth cost: ~$0 (zero egress)
```

### Phase 6+ (1000+ users, $200+/month)

```
Kubernetes (DigitalOcean DOKS):
  Backend: 3 replicas (stateless, load balanced)
  Worker: HPA 1-20 pods (scales on queue depth)
  Frontend: Vercel (free tier, edge network)
  PgBouncer: connection pooling in front of Postgres
  Cloudflare: CDN + DDoS protection in front of everything
```

---

## 20. Decision Log — Why We Made These Choices

| Decision                            | Alternatives Considered           | Why We Chose This                                                    | When to Reconsider                     |
| ----------------------------------- | --------------------------------- | -------------------------------------------------------------------- | -------------------------------------- |
| NestJS over Express                 | Express, Fastify standalone, Hono | Module system enforces boundaries; DI container; SwaggerModule       | If you hate DI, use Fastify standalone |
| Fastify adapter over Express        | Express adapter                   | 2x throughput; better TypeScript; schema serialization               | Never — Fastify is strictly better     |
| Playwright over Puppeteer           | Puppeteer, Selenium, Cypress      | Multi-browser; better auto-wait; TypeScript-first; faster            | Never for automation — Playwright won  |
| BullMQ over RabbitMQ                | RabbitMQ, SQS, Kafka              | Uses existing Redis; simpler ops; built-in UI; retry logic           | At 100k+ jobs/day, consider SQS        |
| pgvector over Pinecone              | Pinecone, Weaviate, Qdrant        | Zero extra services; free; good to 10M vectors                       | At 50M+ vectors across users           |
| Modular monolith over microservices | Full microservices, serverless    | Solo dev productivity; zero network overhead; easy to debug          | When you have 5+ engineers             |
| Zustand over Redux                  | Redux Toolkit, Jotai, Valtio      | 90% less boilerplate; works with App Router; subscriptions           | Never — Zustand is better for this     |
| SHA-256 plan hashing                | UUID versioning, incremental ID   | Content-addressable: same plan = same hash; enables dedup and replay | Never — content addressing is better   |
| Cloudflare R2 over S3               | AWS S3, GCS, Backblaze            | Zero egress fees (screenshots are high-bandwidth); S3-compatible API | If you need S3 Lambda triggers         |
| pnpm over npm/yarn                  | npm workspaces, yarn workspaces   | 3x faster installs; disk space sharing; strict node_modules          | Never for monorepos                    |
| cuid over uuid                      | UUID v4, nanoid                   | Time-sortable; collision-resistant; URL-safe; Prisma default         | If you need cryptographic randomness   |
