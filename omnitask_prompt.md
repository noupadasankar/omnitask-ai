# OmniTask AI — Production-Grade Autonomous Agent Platform

You are an elite full-stack engineer and AI systems architect. Build and maintain **OmniTask AI** — a production-grade SaaS platform where users define any goal in plain English and a multi-agent system autonomously executes it in a real browser, step by step, in real time, with human-in-the-loop approval gates, self-healing recovery, and full observability.

---

## WHAT YOU ARE BUILDING

Five interconnected systems:

1. **Landing Page** — Enterprise dark SaaS marketing site (inspired by Linear, Vercel, Raycast)
2. **Dashboard App** — Real-time autonomous task management with live agent monitoring, execution replay, shadow mode, and approval workflows
3. **NestJS Backend** — Modular API with agent orchestration, vision engine, vault, webhooks, auth, billing, and self-healing runtime
4. **Python Playwright Engine** — Standalone browser automation service with domain-specific agents (job, food, travel, shopping, social, email, calendar, booking, research, media, finance)
5. **AI Decision Layer** — OpenAI GPT-4o for planning, execution, verification, reflection, and self-healing, with pgvector semantic memory

---

## TECH STACK (EXACT)

### Frontend
- **Next.js 14** (App Router, TypeScript, Server Components, React 18)
- **Tailwind CSS** + **shadcn/ui** + **Framer Motion**
- **Zustand** (client state) + **TanStack Query** (server state)
- **Socket.io-client** (real-time WebSocket)
- **Recharts** (analytics)
- **Lucide React** (icons)
- **React Flow** (execution graph visualization)

### Backend
- **NestJS** (TypeScript, Fastify adapter, modular monolith)
- **Prisma ORM** + **PostgreSQL 16** + **pgvector** (embeddings/memory)
- **BullMQ** + **Redis 7** (task queue, pub/sub)
- **OpenAI API** (GPT-4o — planning, execution, repair, embeddings)
- **Socket.io** (WebSocket gateway, real-time streaming)
- **JWT + bcrypt + CSRF** (auth security)
- **Helmet + CORS** (HTTP security)

### Browser Automation
- **Python 3.12** standalone engine (`apps/browser-py/`)
- **Playwright** (async Chromium, headless or headful)
- **Redis BRPOP** job queue (decoupled from NestJS)
- **Per-user persistent browser profiles** (isolated sessions)
- **Self-healing CSS selector cascade** (JS → CSS → text fallback)

### Infrastructure
- **Turborepo** (pnpm monorepo)
- **Docker Compose** (PostgreSQL + Redis + MinIO)
- **Nginx** (reverse proxy, SSL termination)
- **Prometheus + Grafana + Loki** (observability)
- **S3-compatible storage** (MinIO dev / R2 prod)
- **Pulumi** (Kubernetes IaC)
- **GitHub Actions** (CI/CD)

---

## SYSTEM ARCHITECTURE

### Process Topology (3-Process Architecture)

```
┌─────────────────────────────────────────────────────────────────────┐
│                     USER (Next.js 14 Frontend)                       │
│  Landing Page · Dashboard · Task Detail · Analytics · Settings      │
└────────────────────────┬────────────────────────────────────────────┘
                         │ REST + WebSocket
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   NESTJS API (apps/backend/)                         │
│                                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │ Auth     │ │ Tasks    │ │ Agent    │ │ Vision   │ │ Billing  │ │
│  │ Module   │ │ Module   │ │ Module   │ │ Module   │ │ Module   │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │ WebSocket│ │ Webhooks │ │ Vault    │ │ Memory   │ │ Queue    │ │
│  │ Gateway  │ │ Module   │ │ Module   │ │ Module   │ │ Module   │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘ │
│                                                                     │
│  PostgreSQL 16 (Prisma ORM + pgvector) ←→ Redis 7 (BullMQ + Pub/Sub)│
└──────────┬──────────────────────────────────────────────────────────┘
           │ Redis BRPOP (omnitask:py:jobs)      │ Redis Pub/Sub (events)
           ▼                                     ▼
┌─────────────────────────┐        ┌──────────────────────────────┐
│  PYTHON BROWER ENGINE    │        │   BULLMQ WORKER              │
│  (apps/browser-py/)     │        │   (apps/worker/)             │
│                         │        │                              │
│  ┌───────────────────┐  │        │  ┌────────────────────────┐ │
│  │  Playwright        │  │        │  │  Background Tasks      │ │
│  │  Chromium          │  │        │  │  · File processing    │ │
│  │  (headless/headful)│  │        │  │  · Notifications      │ │
│  ├───────────────────┤  │        │  │  · Data exports        │ │
│  │  Domain Agents     │  │        │  └────────────────────────┘ │
│  │  · Job Agent       │  │        └──────────────────────────────┘
│  │  · Food Agent      │  │
│  │  · Travel Agent    │  │
│  │  · Shopping Agent  │  │
│  │  · Social Agent    │  │
│  │  · Email Agent     │  │
│  │  · Calendar Agent  │  │
│  │  · Booking Agent   │  │
│  │  · Research Agent  │  │
│  │  · Finance Agent   │  │
│  │  · Media Agent     │  │
│  ├───────────────────┤  │
│  │  Self-Healing      │  │
│  │  Screencast        │  │
│  │  Streamer          │  │
│  └───────────────────┘  │
└─────────────────────────┘
```

### Agentic Loop Architecture

```
USER GOAL (Natural Language)
       │
       ▼
┌──────────────────────────────────┐
│ PHASE 1: GOAL UNDERSTANDING      │
│  · LLM parses intent + entities  │
│  · Domain routing (job/food/     │
│    travel/shopping/general)      │
│  · Skill matching (repeatable    │
│    workflow detection)           │
│  · Clarification if ambiguous    │
└──────────────┬───────────────────┘
               ▼
┌──────────────────────────────────┐
│ PHASE 2: PLANNING                │
│  · GPT-4o generates step-by-step │
│    plan (JSON structured)        │
│  · Plan validation + repair      │
│  · Risk assessment per step      │
│  · Shadow mode simulation        │
│  · Automation gate (pre-launch)  │
└──────────────┬───────────────────┘
               ▼
┌──────────────────────────────────┐
│ PHASE 3: EXECUTION (Agentic Loop)│
│                                  │
│  ┌──────────────────────────┐    │
│  │ CAPTURE PAGE STATE        │    │
│  │ · DOM snapshot            │    │
│  │ · Visual analysis (OCR)   │    │
│  │ · URL + title + cookies   │    │
│  └──────────┬───────────────┘    │
│             ▼                    │
│  ┌──────────────────────────┐    │
│  │ LLM DECISION              │    │
│  │ · Goal context + history  │    │
│  │ · Action selection        │    │
│  │ · Confidence scoring      │    │
│  └──────────┬───────────────┘    │
│             ▼                    │
│  ┌──────────────────────────┐    │
│  │ APPROVAL GATE             │    │
│  │ · High-risk action?       │──YES──→ Wait for user
│  │ · Payment/login/CAPTCHA?  │         approval (5min
│  │ · First-time domain?      │         timeout)
│  └──────────┬───────────────┘    │
│             ▼ NO                 │
│  ┌──────────────────────────┐    │
│  │ EXECUTE VIA PLAYWRIGHT    │    │
│  │ · Self-healing selectors  │    │
│  │ · Retry with backoff      │    │
│  │ · Screenshot after        │    │
│  └──────────┬───────────────┘    │
│             ▼                    │
│  ┌──────────────────────────┐    │
│  │ VERIFY + REFLECT          │    │
│  │ · Success check           │    │
│  │ · Drift detection         │    │
│  │ · State update            │    │
│  │ · Memory consolidation    │    │
│  └──────────┬───────────────┘    │
│             ▼                    │
│  Goal achieved? ───YES──→ REPORT │
│             │ NO                 │
│             └── loop back ──────┘│
└──────────────────────────────────┘
```

### Agent Orchestration Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                    ORCHESTRATOR PIPELINE                         │
│                                                                  │
│  Step 1: Goal Understanding Service                              │
│  Step 2: Skill Registry → match repeatable workflows             │
│  Step 3: Planner Agent → generate JSON plan                     │
│  Step 4: Verifyer Agent → validate plan structure + risk         │
│  Step 5: Automation Gate → user confirms plan + domains          │
│  Step 6: Browser Agent → execute via Python engine              │
│  Step 7: Vision Agent → DOM analysis + element detection         │
│  Step 8: Drift Detector → check if agent stays on track         │
│  Step 9: Reflection Service → post-action analysis              │
│  Step 10: Memory Store → consolidate to pgvector                │
│  Step 11: Result Synthesizer → structured report                │
│                                                                  │
│  On failure at any step: Self-Healing Service                    │
│    · Selector healer (JS → CSS → text cascade)                  │
│    · Navigation healer (retry URL with fallback)                │
│    · Workflow healer (replan from last valid state)             │
│    · Recovery engine (circuit breaker, exponential backoff)     │
│                                                                  │
│  On persistent failure: Escalate → user notification            │
│                                                                  │
│  Concurrent execution: Multi-Agent Coordinator                  │
│    · Sub-goal decomposition                                     │
│    · Parallel sub-task dispatch                                 │
│    · Result synthesis                                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## CORE ENGINES

### 1. Perception Engine (`apps/browser-py/dom.py`)
- DOM snapshot with all interactive elements
- Visual analysis via screenshot + optional OCR
- Form detection (fields, types, required, labels)
- URL, title, cookie state capture
- Accessibility tree extraction

### 2. Execution Engine (`apps/browser-py/executor.py`)
22+ browser actions:
```
navigate    click        type          select
scroll      hover        screenshot    wait
press_key   upload_file  extract_text  extract_data
solve_captcha switch_tab close_tab    go_back
go_forward  refresh      evaluate     drag_drop
right_click double_click fill_form    check
uncheck     reload
```

### 3. Self-Healing Engine (`apps/backend/src/agent/runtime/self-healing/`)
- **Selector Healer**: JS selector → CSS selector → `innerText` fallback cascade
- **Navigation Healer**: Retry URL with alternative routing (Google fallback)
- **Workflow Healer**: Replan from last valid state when execution diverges
- **Recovery Engine**: Circuit breaker, exponential backoff, max retry limits

### 4. Vision Engine (`apps/backend/src/vision/`)
- **DOM Analyzer**: Semantic element tree extraction
- **Element Detector**: Interactive element discovery + classification
- **Layout Understanding**: Spatial relationship analysis
- **Semantic Matcher**: Fuzzy element matching across page loads
- **Site Memory**: Per-site DOM pattern learning

### 5. Memory System (`apps/backend/src/agent/`)
- **Episodic Memory**: Task execution traces stored as trajectories
- **Semantic Memory**: pgvector embeddings for similarity search
- **Procedural Memory**: Skill templates extracted from successful runs
- **Working Memory**: In-context state during active execution

### 6. Cognitive Safety System
- **Confidence Network**: Multi-signal confidence scoring (LLM confidence + action success + DOM match + history similarity)
- **Drift Detector**: Semantic similarity check against plan intent; detects exploration vs distraction vs constraint-induced drift
- **Automation Gate**: Pre-launch plan approval with target domain whitelist
- **Clarification Gate**: Ambiguous goals trigger Q&A before planning
- **Execution Profiles**: Conservative (max gates) / Balanced / Aggressive (auto-approve familiar patterns)

---

## DATABASE SCHEMA (Prisma — PostgreSQL 16 + pgvector)

### Core Tables
```
User              → id, email, passwordHash, role, emailVerified, mfaEnabled
Session           → id, userId, refreshToken, userAgent, ip, expiresAt
Task              → id, userId, title, naturalLanguage, status, priority, shadowMode, planHash
Plan              → id, taskId, hash, rawOutput, steps (JSON), validated, model
Execution         → id, taskId, attemptNumber, status, graph (JSON)
ExecutionStep     → id, executionId, stepIndex, stepType, action, status, input, output, durationMs
Approval          → id, taskId, userId, reason, context, status, expiresAt
Memory            → id, userId, type, content, embedding (vector), importance, metadata
Skill             → id, userId, name, planTemplate, triggerCount, successRate
File              → id, userId, taskId, storageKey, bucketName, checksum, metadata
Schedule          → id, userId, cronExpression, taskTemplate, enabled
AuditLog          → id, userId, action, resource, metadata, ipAddress
Notification      → id, userId, type, title, body, metadata, readAt
```

### Agent Tables
```
ExecutionSession     → id, taskId, userId, status, plan, currentStepIndex, totalSteps
AgentExecutionStep   → id, sessionId, stepIndex, action, target, value, status, visionAnalysis
Screenshot           → id, sessionId, stepIndex, imageUrl, base64Thumbnail, metadata
ApprovalRequest      → id, sessionId, stepIndex, riskLevel, description, actionDetails, status
AgentMemory          → id, userId, type, key, content, embedding, importance, accessCount
TrajectoryStep       → id, sessionId, stepIndex, goal, observation, prompt, decision, actionResult
TrajectoryRun        → id, sessionId, goal, domain, grade (GOLD/DEMONSTRATION/REJECTED)
```

### Domain-Specific Tables
```
JobPreference        → userId, roles, locations, skills, minScore, remoteOnly
JobApplication       → userId, portal, externalJobId, title, company, score, status
ShoppingPreference   → userId, categories, mustHaveFeatures, maxPrice, minRating
TrackedProduct       → userId, site, externalProductId, title, priceHistory, status
SocialPost           → userId, platform, content, hashtags, status, scheduledAt
TravelBooking        → userId, type, origin, destination, departDate, budget, status
FoodOrder            → userId, platform, restaurantName, items, totalAmount, status
CredentialVault      → userId, service, label, encrypted (AES-256-GCM), hints
CalendarEvent        → userId, accountId, title, startTime, endTime, recurrence
EmailMessage         → userId, accountId, messageId, from, to, subject, bodyText
```

### Billing & Teams
```
Subscription  → userId, stripeCustomerId, plan, status, interval, currentPeriodEnd
Invoice       → userId, stripeInvoiceId, amount, currency, status
Team          → id, name, slug, ownerId
TeamMember    → teamId, userId, role
```

Full schema in `apps/backend/prisma/schema.prisma` — sync with `pnpm db:push`.

---

## API ENDPOINTS (NestJS — `/api` prefix)

```
# Auth
POST   /auth/register
POST   /auth/login
GET    /auth/me
POST   /auth/refresh
POST   /auth/logout
POST   /auth/forgot-password
POST   /auth/reset-password
POST   /auth/verify-email

# Tasks
GET    /tasks               # paginated list with filters (status, priority, page, limit)
POST   /tasks               # create: { naturalLanguage, mode, priority }
GET    /tasks/:id
PATCH  /tasks/:id
DELETE /tasks/:id
POST   /tasks/:id/pause
POST   /tasks/:id/resume
POST   /tasks/:id/retry
GET    /tasks/:id/logs

# Execution Sessions
GET    /sessions/:id
GET    /sessions/:id/steps
GET    /sessions/:id/screenshots

# Approvals
GET    /approvals           # pending list for current user
POST   /approvals/:id/approve
POST   /approvals/:id/reject
GET    /approvals/pending

# Agent
GET    /agents
GET    /agents/:id
GET    /agents/:id/memory
GET    /agents/:id/metrics
GET    /agents/:id/settings
PUT    /agents/:id/settings

# Memory
GET    /memory?type=EPISODIC&limit=20&query=
POST   /memory/search       # semantic search by embedding
DELETE /memory/:id

# Skills
GET    /skills
POST   /skills              # create from task template
PUT    /skills/:id
DELETE /skills/:id

# Vault (encrypted credentials)
GET    /vault
POST   /vault
PUT    /vault/:id
DELETE /vault/:id

# Files
GET    /files               # paginated file list
POST   /files/upload
GET    /files/:id           # download/serve file
DELETE /files/:id

# Schedules
GET    /schedules
POST   /schedules
PUT    /schedules/:id
DELETE /schedules/:id

# Webhooks
GET    /webhooks
POST   /webhooks
PUT    /webhooks/:id
DELETE /webhooks/:id

# Billing
GET    /billing/plan
POST   /billing/checkout
POST   /billing/portal
GET    /billing/invoices

# Admin
GET    /admin/users
GET    /admin/users/:id
PATCH  /admin/users/:id
GET    /admin/system/health
GET    /admin/system/metrics
POST   /admin/policies

# Health
GET    /health
GET    /health/status
GET    /health/runtime
GET    /health/database
GET    /health/queues
GET    /health/websocket
GET    /health/workers

# Analytics
GET    /analytics/overview
GET    /analytics/tasks
GET    /analytics/agents
GET    /analytics/costs
GET    /analytics/tokens
GET    /analytics/usage

# Audit
GET    /audit?action=&resource=&page=&limit=

# GDPR
GET    /gdpr/data           # export user data
POST   /gdpr/delete         # request deletion

# Feedback
POST   /feedback
GET    /feedback?page=&limit=

# WebSocket Gateway
WS     /ws                  # namespace for real-time events
```

### WebSocket Events (Server → Client)

```typescript
type ServerToClientEvents = {
  'session:started': (data: { sessionId: string; taskId: string }) => void;
  'session:completed': (data: { sessionId: string; result: any }) => void;
  'session:failed': (data: { sessionId: string; error: string }) => void;
  'session:paused': (data: { sessionId: string }) => void;
  'session:cancelled': (data: { sessionId: string }) => void;
  'plan:created': (data: { plan: AgentPlan }) => void;
  'plan:replanned': (data: { plan: AgentPlan }) => void;
  'step:started': (data: ExecutionStep) => void;
  'step:completed': (data: ExecutionStep) => void;
  'step:failed': (data: { stepIndex: number; error: string }) => void;
  'step:blocked': (data: { stepIndex: number; reason: string }) => void;
  'step:denied': (data: { stepIndex: number }) => void;
  'approval:requested': (data: ApprovalRequest) => void;
  'approval:responded': (data: { approvalId: string; status: string }) => void;
  'approval:expired': (data: { approvalId: string }) => void;
  'automation:gate': (data: { plan: AgentPlan; targetDomains: string[] }) => void;
  'browser:initialized': (data: { sessionId: string }) => void;
  'browser:state': (data: { state: BrowserState }) => void;
  'execution:state': (data: { state: ExecutionState }) => void;
  'execution:paused': (data: { sessionId: string }) => void;
  'execution:resumed': (data: { sessionId: string }) => void;
  'execution:cancelled': (data: { sessionId: string }) => void;
  'execution:completed': (data: { sessionId: string; result: any }) => void;
  'execution:failed': (data: { sessionId: string; error: string }) => void;
  'screenshot:frame': (data: ScreenshotFrame) => void;
  'log:debug': (data: LogEntry) => void;
  'log:info': (data: LogEntry) => void;
  'log:warn': (data: LogEntry) => void;
  'log:error': (data: LogEntry) => void;
  'execution:event': (data: ExecutionEvent) => void;
};
```

---

## FRONTEND — ALL PAGES (Next.js 14 App Router)

### File Structure
```
frontend/
├── app/
│   ├── page.tsx                          # Landing page
│   ├── layout.tsx                        # Root layout (Providers, ThemeProvider)
│   ├── loading.tsx                       # Root loading state
│   ├── error.tsx                         # Root error boundary
│   ├── not-found.tsx
│   ├── global-error.tsx
│   │
│   ├── (auth)/                           # Public routes
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   ├── forgot-password/page.tsx
│   │   ├── reset-password/page.tsx
│   │   ├── verify-email/page.tsx
│   │   └── auth/callback/page.tsx        # OAuth callback
│   │
│   ├── (dashboard)/                      # Protected dashboard (layout.tsx with sidebar)
│   │   ├── layout.tsx                    # Sidebar + TopBar + AppShell
│   │   ├── dashboard/page.tsx            # Overview stats
│   │   │
│   │   ├── tasks/
│   │   │   ├── page.tsx                  # Task list with filters + search
│   │   │   ├── loading.tsx
│   │   │   ├── create/page.tsx           # Create task wizard
│   │   │   ├── running/page.tsx
│   │   │   ├── completed/page.tsx
│   │   │   ├── failed/page.tsx
│   │   │   ├── queue/page.tsx
│   │   │   └── [id]/
│   │   │       ├── page.tsx              # Task detail + live agent view
│   │   │       ├── loading.tsx
│   │   │       ├── approvals/page.tsx
│   │   │       └── replay/page.tsx       # Execution replay scrubber
│   │   │
│   │   ├── agents/
│   │   │   ├── page.tsx                  # Agent registry + status grid
│   │   │   └── [id]/
│   │   │       ├── page.tsx              # Agent detail
│   │   │       ├── memory/page.tsx
│   │   │       ├── metrics/page.tsx
│   │   │       └── settings/page.tsx
│   │   │
│   │   ├── executions/
│   │   │   ├── page.tsx                  # Execution history
│   │   │   ├── history/page.tsx
│   │   │   ├── schedules/page.tsx
│   │   │   └── replay/[sessionId]/page.tsx
│   │   │
│   │   ├── approvals/
│   │   │   ├── page.tsx                  # Approval queue dashboard
│   │   │   ├── pending/page.tsx
│   │   │   ├── approved/page.tsx
│   │   │   ├── rejected/page.tsx
│   │   │   └── [id]/page.tsx
│   │   │
│   │   ├── analytics/
│   │   │   ├── page.tsx                  # Overview charts
│   │   │   ├── tasks/page.tsx
│   │   │   ├── agents/page.tsx
│   │   │   ├── costs/page.tsx
│   │   │   ├── tokens/page.tsx
│   │   │   ├── executions/page.tsx
│   │   │   └── usage/page.tsx
│   │   │
│   │   ├── memory/
│   │   │   ├── page.tsx
│   │   │   ├── embeddings/page.tsx
│   │   │   ├── vector-store/page.tsx
│   │   │   └── semantic-search/page.tsx
│   │   │
│   │   ├── workflows/
│   │   │   ├── page.tsx
│   │   │   ├── create/page.tsx
│   │   │   ├── templates/page.tsx
│   │   │   ├── executions/page.tsx
│   │   │   └── [id]/
│   │   │       ├── page.tsx
│   │   │       ├── edit/page.tsx
│   │   │       ├── analytics/page.tsx
│   │   │       └── versions/page.tsx
│   │   │
│   │   ├── settings/
│   │   │   ├── layout.tsx                # Settings sidebar nav
│   │   │   ├── page.tsx                  # General
│   │   │   ├── profile/page.tsx
│   │   │   ├── appearance/page.tsx
│   │   │   ├── api-keys/page.tsx
│   │   │   ├── billing/page.tsx
│   │   │   ├── team/page.tsx
│   │   │   ├── permissions/page.tsx
│   │   │   ├── vault/page.tsx            # Credential vault
│   │   │   └── voice/page.tsx
│   │   │
│   │   ├── jobs/page.tsx                 # Job application tracker
│   │   ├── email/page.tsx                # Email integration
│   │   ├── media/page.tsx                # Music/video integration
│   │   ├── health/                       # System health pages
│   │   │   ├── page.tsx
│   │   │   ├── database/page.tsx
│   │   │   ├── queues/page.tsx
│   │   │   ├── runtime/page.tsx
│   │   │   ├── websocket/page.tsx
│   │   │   └── workers/page.tsx
│   │   │
│   │   └── admin/                        # Admin panel (role-gated)
│   │       ├── page.tsx
│   │       ├── users/page.tsx
│   │       ├── system/page.tsx
│   │       └── policies/page.tsx
│   │
│   └── api/                              # Next.js API routes (auth helpers)
│       ├── auth/route.ts
│       ├── register/route.ts
│       └── health/route.ts
│
├── components/
│   ├── Providers.tsx                     # All providers wrapper
│   ├── ThemeProvider.tsx
│   │
│   ├── ui/                               # shadcn/ui primitives
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── card.tsx
│   │   ├── badge.tsx
│   │   ├── select.tsx
│   │   ├── textarea.tsx
│   │   ├── label.tsx
│   │   └── toaster.tsx
│   │
│   ├── layout/
│   │   ├── Sidebar.tsx                   # Dashboard sidebar nav
│   │   ├── Topbar.tsx                    # Top bar with search + user menu
│   │   ├── AppShell.tsx                  # Sidebar + TopBar orchestrator
│   │   ├── MobileNav.tsx                 # Mobile bottom nav
│   │   └── WsReconnectBanner.tsx         # WebSocket disconnected banner
│   │
│   ├── auth/
│   │   └── GoogleButton.tsx
│   │
│   ├── tasks/
│   │   ├── TaskCard.tsx
│   │   ├── TaskList.tsx
│   │   ├── TaskCreateForm.tsx
│   │   ├── TaskStatusBadge.tsx
│   │   ├── AgentStatusPanel.tsx
│   │   ├── BrowserPreview.tsx
│   │   ├── ExecutionReplay.tsx
│   │   ├── ExecutionTimeline.tsx
│   │   ├── ShadowMode.tsx
│   │   └── ApprovalModal.tsx
│   │
│   ├── execution/
│   │   ├── LiveBrowserView.tsx           # Live screenshot stream
│   │   ├── LogPanel.tsx                  # Real-time action log
│   │   ├── ApprovalPanel.tsx             # Approval request UI
│   │   ├── ResultsPanel.tsx              # Task results display
│   │   ├── CognitiveDiagnosticsPanel.tsx # Reasoning + confidence display
│   │   ├── VerificationResultPanel.tsx
│   │   └── WorldStateHud.tsx             # Agent belief state overlay
│   │
│   ├── dashboard/
│   │   ├── DashboardHero.tsx
│   │   └── ClarificationModal.tsx
│   │
│   ├── jobs/
│   │   ├── JobAgentStatus.tsx
│   │   └── JobWizardModal.tsx
│   │
│   ├── voice/
│   │   ├── VoiceInput.tsx
│   │   └── SplitMicButton.tsx
│   │
│   └── hero/
│       └── NeuralBrainCanvas.tsx         # Landing page animation
│
├── hooks/
│   ├── useSocket.ts                      # WebSocket connection + events
│   ├── useAuth.ts
│   ├── useAuthActions.ts
│   ├── useAgentSession.ts
│   ├── useJobAgentSession.ts
│   ├── useRuntimeData.ts
│   └── useTasks.ts
│
├── store/
│   ├── agent.store.ts                    # Zustand — agent execution state
│   ├── auth.store.ts                     # Zustand — auth state
│   └── runtime.store.ts                  # Zustand — runtime config
│
├── services/
│   ├── api.ts                            # Axios instance with interceptors
│   ├── websocket.service.ts              # Socket.io client wrapper
│   ├── auth.service.ts
│   ├── task.service.ts
│   ├── agent.service.ts
│   ├── orchestrator.service.ts
│   ├── job.service.ts
│   ├── food.service.ts
│   ├── travel.service.ts
│   ├── shopping.service.ts
│   ├── social.service.ts
│   ├── media.service.ts
│   ├── email.service.ts
│   ├── research.service.ts
│   ├── vault.service.ts
│   └── voice.service.ts
│
├── providers/
│   ├── AuthProvider.tsx
│   ├── QueryProvider.tsx
│   └── SocketProvider.tsx
│
├── types/
│   ├── agent.ts                          # Agent execution types
│   ├── task.ts                           # Task types
│   └── (shared-types package handles the rest)
│
├── config/
│   ├── navigation.ts                     # Sidebar nav config
│   └── dashboard.ts                      # Dashboard config
│
├── lib/
│   ├── api.ts                            # API client wrapper
│   ├── utils.ts                          # Utility functions
│   ├── oauth.ts
│   ├── dashboardUtils.ts
│   └── job-profile.ts
│
└── styles/
    └── omnitask-dashboard.css
```

### Task Detail Page (the most important page)

Layout: Two-panel (60% left, 40% right), full height.

**LEFT PANEL:**
1. Task header: title + status badge (animated pulse if running)
2. Progress: "Step 7 of ~15" with animated progress bar
3. Live browser view: `<img>` updated from WebSocket screenshot stream (~500ms)
4. Controls: [Pause] [Resume] [Cancel] [Replay] buttons

**RIGHT PANEL (scrollable):**
1. "Agent Thinking" box (live streaming, monospace font):
   ```
   Thinking: I can see the LinkedIn search bar...
   Action: click → input[aria-label='Search']
   Confidence: 95%
   Reasoning: The search bar is visible and focused
   ```
2. Action log (live, append-only):
   ```
   ✅ Step 1 — goto → linkedin.com (120ms)
   ✅ Step 2 — click → search bar (89ms)
   ⚡ Step 3 — type → "Software Engineer" (pending)
   ```
3. Approval request (orange/red card, if pending):
   ```
   ⚠️ Agent wants to submit a job application
   Risk: HIGH | Domain: linkedin.com
   [Approve] [Reject] — expires in 4:32
   ```
4. Multi-agent status panel (shows active sub-agents)

---

## PYTHON BROWSER ENGINE (`apps/browser-py/`)

Standalone Playwright service that BRPOPs jobs from Redis queue `omnitask:py:jobs`.

### Execution Flow

```
1. Backend pushes job JSON to Redis list `omnitask:py:jobs`
2. Python engine BRPOPs the job (blocking pop, 5s timeout)
3. Engine loads domain-specific agent or falls back to generic executor
4. Agent executes steps with self-healing selector cascade
5. Events published to Redis Pub/Sub `omnitask:worker:events`
6. NestJS backend relays events to dashboard via Socket.io
7. Screenshots streamed as base64 frames through event channel
8. Heartbeat key `omnitask:py:alive` refreshed every 5s (10s TTL)

On engine crash → Backend detects missing heartbeat → Falls back to in-process Puppeteer
```

### Agent Architecture

```
skill_registry → matches job payload 'skill' key to domain agent
  ├── skills/generic.py      → fallback for unknown domains
  ├── skills/job.py          → LinkedIn, Indeed, Naukri
  ├── skills/job_application.py → job apply flow
  ├── skills/food.py         → Swiggy, Zomato
  ├── skills/travel.py       → Google Flights, Booking.com
  ├── skills/shopping.py     → Amazon, eBay, Walmart
  ├── skills/social.py       → Twitter/X, LinkedIn
  ├── skills/email.py        → Gmail, Outlook
  ├── skills/calendar.py     → Google Calendar, Outlook Calendar
  ├── skills/booking.py      → OpenTable, Resy, Booking.com
  ├── skills/research.py     → Google Search, Wikipedia
  ├── skills/finance.py      → stock tracking, price monitoring
  ├── skills/media.py        → YouTube, Spotify
  ├── skills/search.py       → general web search
  ├── skills/extract.py      → data extraction
  └── skills/web_task.py     → generic web task execution
```

### Job Payload Format

```json
{
  "sessionId": "string",
  "taskId": "string",
  "userId": "string",
  "skill": "job|food|travel|shopping|social|email|calendar|booking|research|finance|media|general",
  "plan": {
    "steps": [
      {
        "action": "navigate",
        "target": "https://google.com",
        "value": null,
        "description": "Open Google"
      }
    ]
  },
  "config": {
    "headless": true,
    "viewport": {"width": 1280, "height": 800},
    "userAgent": "Mozilla/5.0 (...)"
  },
  "credentials": {},
  "preferences": {},
  "autoApprove": false
}
```

---

## DESIGN SYSTEM

```css
/* Colors */
--primary: #6366F1;         /* indigo — main CTAs */
--primary-hover: #4F46E5;
--success: #10B981;         /* green */
--warning: #F59E0B;         /* amber */
--error: #EF4444;           /* red */
--bg: #0A0A0B;              /* dark background */
--surface: #111113;         /* cards */
--surface-2: #1A1A1E;       /* elevated cards */
--border: rgba(255,255,255,0.08);
--text: #F1F0EE;
--text-muted: #6B7280;

/* Status badge colors */
QUEUED      → surface + text-muted
PLANNING    → blue tint
RUNNING     → indigo + CSS pulse animation
PAUSED      → amber tint
COMPLETED   → green tint
FAILED      → red tint
CANCELLED   → gray
WAITING_APPROVAL → orange + pulse

/* Domain icons (Lucide) */
job          → Briefcase
food         → UtensilsCrossed
travel       → Plane
shopping     → ShoppingBag
entertainment → Play
financial    → CreditCard
general      → Bot
social       → Share2
email        → Mail
calendar     → Calendar
booking      → CalendarCheck

/* Priority */
CRITICAL → red dot + "CRITICAL" badge
HIGH     → orange dot
MEDIUM   → blue dot
LOW      → gray dot
```

---

## SECURITY & COMPLIANCE

### Authentication & Authorization
- JWT access tokens (15min) + refresh tokens (7d) — stored in httpOnly cookies
- CSRF protection via double-submit cookie pattern (exempted for Bearer token requests)
- bcrypt password hashing (12 rounds)
- Rate limiting: 100 req/min per user (API), 30 LLM calls/min per task
- Role-based access control: USER / ADMIN / SUPERADMIN

### Data Protection
- Credential Vault: AES-256-GCM encrypted per-service credentials (LinkedIn, Gmail, Swiggy, etc.)
- All secrets validated at startup — fails fast on weak/default values
- PII auto-redacted from logs (credit cards, SSNs, passwords)
- Screenshots auto-deleted after 7 days (configurable via DataRetentionPolicy)
- GDPR data export + deletion endpoints

### Agent Safety
- **Automation Gate**: All plans require user approval before first browser launch
- **Domain Whitelist**: Users approve target domains per session
- **Risk Assessment**: Every action scored (LOW/MEDIUM/HIGH/CRITICAL) before execution
- **Approval Gates**: Payment, login, CAPTCHA, form submission — all require user approval
- **Execution Profiles**: Conservative (max gates) / Balanced / Aggressive
- **Drift Detection**: Semantic similarity check against plan; auto-pause on significant drift
- **Hard Limits**: 50 steps max per task, 10s action timeout, 5min approval timeout
- **Idempotency**: All POST/PATCH requests idempotent via idempotency keys

### Traffic Security
- HTTPS only in production (Nginx terminates SSL)
- Helmet security headers (CSP, HSTS, X-Frame-Options, etc.)
- CORS whitelist — only configured frontend origin allowed
- Cookie sameSite: strict, secure in production

---

## MONITORING & OBSERVABILITY

### Metrics (Prometheus)
```
- HTTP request rate, latency (p50/p95/p99), error rate
- Task throughput (created, running, completed, failed)
- Agent step duration distribution
- LLM call count + token usage + cost
- Browser engine: active sessions, memory usage, crash count
- Queue depth (BullMQ) + processing latency
- WebSocket connection count + message throughput
- Database connection pool usage
```

### Logging (Structured — Pino)
```json
{
  "level": "info",
  "time": "2026-06-30T12:00:00Z",
  "reqId": "abc123",
  "module": "AgentOrchestrator",
  "action": "execute_step",
  "sessionId": "sess_xyz",
  "stepIndex": 5,
  "durationMs": 2340,
  "error": null
}
```

### Tracing (OpenTelemetry)
- Distributed traces across NestJS → Redis → Python engine
- Span per agent step (planning, execution, verification, memory store)
- Error spans tagged with failure mode (selector failure, navigation timeout, LLM parse error)

### Health Checks (all services)
```
/health           → overall status
/health/database  → PostgreSQL connection + query latency
/health/queues    → BullMQ queue health + depth
/health/runtime   → process memory, CPU, event loop lag
/health/websocket → active connections + message rate
/health/workers   → BullMQ worker status + concurrency
```

Browser-py health (independent HTTP at :8000/health):
```json
{"status": "up", "service": "browser-py", "redis": {"status": "up", "latencyMs": 2}, "activeJobs": 3}
```

---

## CI/CD & DEPLOYMENT

### GitHub Actions Workflow (`.github/workflows/deploy.yml`)
On push to `main`:
1. Lint (ESLint, Prettier) + TypeScript check (`pnpm lint`)
2. Unit tests (`pnpm test`)
3. Build all packages (`pnpm build`)
4. Docker build + push to registry
5. Deploy to VPS via SSH (docker compose pull && up)
6. Smoke test health endpoints

### Docker Compose (development)
```
docker compose up
# Starts: postgres:16-alpine, redis:7-alpine
# Apps run via pnpm stack outside containers for hot-reload
```

### Docker Compose (production)
```
docker compose -f docker-compose.prod.yml up -d
# Starts: frontend, backend, browser-py, worker, postgres, redis, nginx
```

### Environments
```
.localhost  → local dev (hot-reload)
.staging    → staging server (Docker, .env.staging)
.production → production (Docker, .env.production, SSL)
```

---

## BUILD ORDER

### Phase 1: Foundation (Weeks 1-3)
- [x] Turborepo monorepo setup (pnpm workspaces)
- [x] NestJS app module with all infrastructure (config, logger, filters, interceptors)
- [x] Prisma schema + PostgreSQL + migrations
- [x] Auth module (register, login, JWT, refresh, logout, password-reset, email-verify)
- [x] Tasks CRUD module
- [x] Basic frontend with auth pages + task list

### Phase 2: Browser Engine (Weeks 4-6)
- [x] Python Playwright engine: Redis listener + browser manager
- [x] Action executor (all 22+ actions)
- [x] DOM perception engine
- [x] Self-healing selector cascade (JS → CSS → text)
- [x] Screencast streaming via Redis Pub/Sub
- [x] Basic task execution flow (backend pushes job → engine runs → events stream)

### Phase 3: Agent Intelligence (Weeks 7-9)
- [x] Goal understanding service (LLM intent parsing)
- [x] Planner agent (GPT-4o generates structured plan)
- [x] Verifier agent (plan validation + repair)
- [x] AI service (OpenAI API integration with token tracking)
- [x] Memory system (pgvector embeddings)
- [x] Approval system (human-in-the-loop)
- [x] Shadow mode (simulate without browser)

### Phase 4: Multi-Agent & Skills (Weeks 10-12)
- [x] Skill registry + template system
- [x] Domain agents (job, food, travel, shopping, social, email, calendar, booking, research, finance, media)
- [x] Multi-agent coordinator (sub-goal decomposition)
- [x] Result synthesizer
- [x] Trajectory logging (training data lake)

### Phase 5: Resilience (Weeks 13-15)
- [x] Self-healing service (selector, navigation, workflow healers)
- [x] Recovery engine (circuit breaker, backoff)
- [x] Drift detector (semantic intent tracking)
- [x] Confidence network (multi-signal confidence scoring)
- [x] Execution profiles (conservative / balanced / aggressive)
- [x] Policy engine (per-domain rules)
- [x] Retry manager (exponential backoff + max retries)

### Phase 6: Frontend Dashboard (Weeks 16-18)
- [x] Dashboard layout (sidebar, topbar, app shell)
- [x] Task detail page (live browser view + agent thinking + action log)
- [x] Task create wizard
- [x] Approval queue UI
- [x] Execution replay scrubber
- [x] Agent monitor grid
- [x] Landing page (full dark SaaS design)
- [x] Settings pages

### Phase 7: Analytics & Billing (Weeks 19-21)
- [x] Analytics dashboard (Recharts + TanStack Query)
- [x] Token usage + cost tracking
- [x] OpenAI usage reporting
- [x] Billing module (Stripe integration)
- [x] Team management
- [x] Webhook system

### Phase 8: Production Hardening (Weeks 22-24)
- [x] Prometheus + Grafana dashboards
- [x] Structured logging (Pino)
- [x] OpenTelemetry tracing
- [x] Load testing (k6 scripts)
- [x] Nginx config + SSL
- [x] Docker production build optimization
- [x] Kubernetes manifests (Pulumi)
- [x] CI/CD pipeline finalization

---

## SUCCESS CRITERIA

1. `make stack` starts all services in one command
2. User can register, login, and create a task: "Search Google for AI news and extract 5 headlines"
3. Task goes through: planning → shadow mode → automation gate → browser execution → report
4. Dashboard shows live browser screenshots updating every ~500ms
5. Action log streams in real-time showing each step with duration
6. Agent thinking panel shows LLM reasoning in real-time
7. Approval pop-up appears for high-risk actions (form submission, payment)
8. Self-healing activates on selector failures (retries with alternative selectors)
9. Task completes with full report (summary, sites visited, data extracted, screenshots)
10. Analytics page shows task history, domain breakdown, success rate, costs
11. Landing page is polished, mobile-responsive, production-quality
12. `pnpm lint` passes with zero errors
13. `pnpm test` passes all unit + e2e tests
14. Health endpoints return OK for all services

---

## RUN COMMANDS

```bash
# First-time setup
make install          # Install all deps (node + python + chromium)
make setup            # install + infra + db push

# Development
make stack            # Start everything (infra + backend + frontend + engine + worker)
make app              # Start only TS apps (turbo dev)
make engine           # Start only Python browser engine
make infra            # Start only Postgres + Redis
make infra-down       # Stop databases
make db               # Push Prisma schema

# Docker
make dev              # docker compose up
make build            # Build production images
make start            # docker compose -f docker-compose.prod.yml up -d
make stop             # Stop all containers
make logs             # View logs
make clean            # Wipe all containers + volumes

# Testing & Quality
pnpm lint             # Lint all packages
pnpm test             # Run all tests
pnpm typecheck        # TypeScript check

# Database
pnpm db:push          # Push schema to DB
pnpm db:migrate       # Create migration
pnpm db:studio        # Open Prisma Studio
pnpm db:generate      # Generate Prisma client
```

---

## ENVIRONMENT VARIABLES

### Required
| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | OpenAI API key for GPT-4o |
| `JWT_SECRET` | Access token secret (min 64 chars hex) |
| `JWT_REFRESH_SECRET` | Refresh token secret (min 64 chars hex) |
| `CSRF_SECRET` | CSRF token secret (min 32 chars) |
| `VAULT_MASTER_KEY` | AES-256-GCM master key for credential vault |

### Optional (sane defaults)
| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | Backend port |
| `FRONTEND_URL` | `http://localhost:3000` | CORS origin |
| `DATABASE_URL` | `postgresql://omnitask:omnitask_secret@localhost:5432/omnitask` | PostgreSQL |
| `REDIS_URL` | `redis://localhost:6379` | Redis |
| `S3_ENDPOINT` | `http://localhost:9000` | S3-compatible storage |
| `S3_BUCKET` | `omnitask` | S3 bucket name |
| `WORKER_CONCURRENCY` | `3` | BullMQ worker concurrency |
| `BROWSER_PY_LOG_LEVEL` | `INFO` | Python engine log level |
| `HEADLESS` | `true` | Playwright headless mode |

---

## TESTING STRATEGY

### Backend (Jest — `apps/backend/test/`)
- **Unit tests**: Services in isolation (mocked Prisma + Redis)
- **Integration tests**: Module-level with test database
- **E2E tests**: Full API surface via supertest with real database
- **Critical e2e suites**:
  - `auth.e2e-spec.ts` — register, login, refresh, logout, rate limiting
  - `task-execution.e2e-spec.ts` — create, plan, execute, report
  - `agent.e2e-spec.ts` — session lifecycle, approvals, screenshots
  - `websocket.e2e-spec.ts` — connection, events, reconnection
  - `error-recovery.e2e-spec.ts` — retry, self-healing, circuit breaker
  - `health.e2e-spec.ts` — all health endpoints
  - `memory.e2e-spec.ts` — CRUD, semantic search, vector operations
  - `multi-agent.e2e-spec.ts` — sub-goal decomposition, parallel execution
  - `billing.e2e-spec.ts` — Stripe webhook handling
  - `admin.e2e-spec.ts` — admin CRUD, policy management

### Python Engine (pytest — `apps/browser-py/tests/`)
- `test_executor.py` — action execution with mocked page
- `test_browser_manager.py` — session isolation, profile management
- `test_self_healing.py` — selector cascade, recovery scenarios
- `test_concurrent.py` — concurrent session handling
- `test_crash_recovery.py` — engine restart, job re-queuing
- `test_streamer.py` — screenshot streaming, quality, latency
- `test_input_control.py` — keyboard, mouse, file upload

### Frontend (Vitest — `apps/frontend/`)
- `vitest.setup.ts` — global mocks (intersection observer, matchMedia)
- Component tests with @testing-library/react
- Store tests (Zustand agent.store, runtime.store)
- Hook tests (useSocket, useAgentSession)
- API service tests (msw for mocking)

### Load Testing (`scripts/loadtest/`)
- **k6**: API load (`api-load.k6.js`), WebSocket load (`websocket-load.k6.js`)
- **Artillery**: API scenario testing (`artillery/api.yml`)
- **Python**: Concurrent browser sessions (`browser-concurrent.py`)
- **Node**: Database benchmark (`db-benchmark.js`), Redis queue benchmark (`redis-queue-benchmark.js`)

---

## PROJECT STRUCTURE (COMPLETE)

```
omnitask-ai/                          # Turborepo monorepo (pnpm workspace)
├── apps/
│   ├── backend/                      # NestJS API (12+ domain modules)
│   │   ├── src/
│   │   │   ├── main.ts               # Bootstrap: Helmet, CSRF, CORS, Swagger, Sentry
│   │   │   ├── app.module.ts         # Root module (imports all feature modules)
│   │   │   ├── app.controller.ts     # Root health
│   │   │   ├── common/               # Shared: filters, interceptors, guards, pipes, logger
│   │   │   ├── auth/                 # JWT, OAuth, MFA, sessions
│   │   │   ├── users/
│   │   │   ├── agent/                # Orchestrator, planner, executor, memory, skills
│   │   │   ├── agent-registry/
│   │   │   ├── execution/            # Execution lifecycle + workers
│   │   │   ├── vision/               # DOM analyzer, element detector, layout, semantic matcher
│   │   │   ├── billing/
│   │   │   ├── files/
│   │   │   ├── queue/                # BullMQ integration
│   │   │   ├── webhook/
│   │   │   ├── websocket/            # Socket.io gateway + event relay
│   │   │   ├── vault/                # AES-256 encrypted credential storage
│   │   │   ├── memory/               # pgvector embeddings + semantic search
│   │   │   ├── audit/
│   │   │   ├── health/
│   │   │   ├── feedback/
│   │   │   ├── gdpr/
│   │   │   ├── job/                  # Job application domain
│   │   │   ├── food/
│   │   │   ├── travel/
│   │   │   ├── social/
│   │   │   ├── email/
│   │   │   ├── media/
│   │   │   ├── voice/
│   │   │   ├── learning/             # Learning engine (trajectory → skill)
│   │   │   ├── ab-testing/           # Strategy testing (A/B)
│   │   │   ├── training/             # Trajectory export for fine-tuning
│   │   │   ├── plugins/              # Plugin system
│   │   │   ├── idempotency/
│   │   │   ├── prisma/               # Prisma service module
│   │   │   └── sentry.ts
│   │   ├── prisma/
│   │   │   ├── schema.prisma         # Full database schema (1336 lines)
│   │   │   ├── seed.ts
│   │   │   ├── post-deploy.sql       # GIN indexes + pgvector extension
│   │   │   └── migrations/
│   │   └── test/                     # E2E tests (15 suites)
│   │
│   ├── frontend/                     # Next.js 14 dashboard
│   │   └── src/
│   │       ├── app/                  # App Router pages
│   │       ├── components/           # UI, layout, tasks, execution, dashboard, jobs
│   │       ├── hooks/                # useSocket, useAuth, useAgentSession, etc.
│   │       ├── store/                # Zustand stores (agent, auth, runtime)
│   │       ├── services/             # API service layer (14 domain services)
│   │       ├── providers/            # Auth, Query, Socket providers
│   │       ├── types/                # TypeScript type definitions
│   │       ├── config/               # Navigation, dashboard config
│   │       ├── lib/                  # Utils, OAuth, dashboard utils
│   │       └── styles/
│   │
│   ├── browser-py/                   # Python Playwright automation engine
│   │   ├── main.py                   # BRPOP loop + health server + heartbeat
│   │   ├── executor.py               # 22+ action executor
│   │   ├── browser_manager.py        # Per-user persistent browser profiles
│   │   ├── dom.py                    # DOM perception engine
│   │   ├── events.py                 # Redis event publisher
│   │   ├── streamer.py               # Screenshot streaming
│   │   ├── input_control.py          # Keyboard/mouse input
│   │   ├── ai.py                     # AI client (OpenAI)
│   │   ├── agents/                   # Domain-specific agents
│   │   │   ├── job_agent/
│   │   │   ├── food_agent/
│   │   │   ├── travel_agent/
│   │   │   ├── shopping_agent/
│   │   │   ├── social_agent/
│   │   │   ├── email_agent/
│   │   │   ├── calendar_agent/
│   │   │   ├── booking_agent/
│   │   │   ├── research_agent/
│   │   │   └── finance_agent/
│   │   ├── skills/                   # Skill modules (16 skills)
│   │   └── tests/                    # pytest test suite (8 test files)
│   │
│   └── worker/                       # Legacy BullMQ worker (NestJS standalone)
│       └── src/
│           ├── main.ts
│           ├── worker.module.ts
│           └── processors/
│               └── worker-task.processor.ts
│
├── packages/
│   ├── shared-types/                 # Shared TypeScript types (agent, api, approval, execution, file, memory, plan, skill, task, user, websocket)
│   └── config/                       # Shared ESLint + TypeScript configs
│
├── infra/
│   ├── docker/                       # Postgres init, Redis config, MinIO config
│   ├── nginx/                        # Nginx reverse proxy configurations
│   ├── k8s/                          # Pulumi Kubernetes manifests
│   └── monitoring/                   # Prometheus config + Grafana dashboards
│
├── scripts/
│   ├── dev.sh                        # Development orchestration
│   ├── dev.mjs                       # Node.js dev orchestrator
│   ├── deploy.sh                     # Production deployment script
│   └── loadtest/                     # k6, Artillery, browser, DB, Redis benchmarks
│
├── docker-compose.yml                # Dev infra (PostgreSQL + Redis)
├── docker-compose.prod.yml           # Full production stack
├── Dockerfile                        # Multi-stage Next.js build
├── nginx.conf                        # Dev nginx config
├── nginx.prod.conf                   # Production nginx + SSL
├── turbo.json                        # Turborepo pipeline
├── Makefile                          # Convenience commands
├── package.json                      # Root workspace
├── pnpm-workspace.yaml
└── .env.example                      # Environment template
```

---

Every file must be complete, production-quality, and fully implemented. No placeholders. No TODOs. No stubs. This is a monorepo powering a real SaaS platform with real users, real browser automation, and real money at stake.
