# OmniTask AI 🧠

> **The Operating System for Human Intent.**
> You think it. OmniTask does it. Completely. Correctly. Without being asked twice.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org)
[![NestJS](https://img.shields.io/badge/NestJS-11.x-red.svg)](https://nestjs.com)
[![Next.js](https://img.shields.io/badge/Next.js-14.x-black.svg)](https://nextjs.org)
[![Python](https://img.shields.io/badge/Python-3.11-blue.svg)](https://python.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue.svg)](https://postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-7-red.svg)](https://redis.io)
[![Docker](https://img.shields.io/badge/Docker-Compose-blue.svg)](https://docker.com)
[![pnpm](https://img.shields.io/badge/pnpm-8.x-orange.svg)](https://pnpm.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://typescriptlang.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/noupadasankar/omnitask-ai/blob/main/CONTRIBUTING.md)

---

## Table of Contents

- [What Is OmniTask AI?](#what-is-omnitask-ai)
- [Live Demo](#live-demo)
- [Key Features](#key-features)
- [The 20 Specialized Agents](#the-20-specialized-agents)
- [Architecture Overview](#architecture-overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Variables](#environment-variables)
  - [Running in Development](#running-in-development)
  - [Running in Production](#running-in-production)
- [API Reference](#api-reference)
  - [Authentication](#authentication)
  - [Tasks](#tasks)
  - [Agents](#agents)
  - [Memory](#memory)
  - [Billing](#billing)
  - [Webhooks](#webhooks)
- [WebSocket Events](#websocket-events)
- [Browser Automation Engine](#browser-automation-engine)
- [Cognitive Memory System](#cognitive-memory-system)
- [Security Architecture](#security-architecture)
- [Testing](#testing)
- [Deployment](#deployment)
  - [Docker Compose (Recommended)](#docker-compose-recommended)
  - [Kubernetes](#kubernetes)
  - [Manual Deployment](#manual-deployment)
- [Monitoring & Observability](#monitoring--observability)
- [Configuration Reference](#configuration-reference)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)
- [Contact & Support](#contact--support)

---

## What Is OmniTask AI?

OmniTask AI is a **cognitive automation platform** that executes real-world tasks on the internet on behalf of users — through natural language commands alone.

A user types or speaks any goal. OmniTask understands the intent, plans the steps, opens a real browser, navigates websites, fills forms, makes decisions, and completes the task — all without manual intervention.

```
User:  "Apply to every senior React developer job posted in the last 24 hours 
        that pays over $150k and is remote-friendly."

OmniTask: ✅ Found 47 matching jobs across LinkedIn, Indeed, and Glassdoor.
          ✅ Scored each against your profile (87% avg match).
          ✅ Auto-applied to 31 jobs above your 80% threshold.
          ✅ Skipped 16 jobs (below threshold or duplicate).
          ✅ Sent confirmation emails to 31 companies.
          📋 Full report saved to your dashboard.
```

This is not a chatbot. This is not an RPA tool. This is not a workflow builder.

**This is the last software product a person will ever need to learn.**

---

## Live Demo

| Environment | URL | Credentials |
|---|---|---|
| Production | https://omnitask.ai | Sign up free |
| Staging | https://staging.omnitask.ai | Contact team for demo credentials |
| API Docs | https://api.omnitask.ai/docs | Public |
| Status Page | https://status.omnitask.ai | Public |

---

## Key Features

### 🧠 Natural Language Command Engine
- Understands intent in any language, any phrasing
- Disambiguates vague instructions by asking smart clarifying questions
- Remembers context across sessions — no need to repeat yourself
- Voice input supported via OpenAI Whisper (STT)
- Voice output via ElevenLabs (TTS) for hands-free operation

### 🌐 Live Browser Automation
- Real Chromium browser controlled by Playwright
- Live CDP screencast streamed to your dashboard in real time
- Per-user persistent browser profiles (cookies, sessions preserved)
- Self-healing selectors — adapts when websites change their UI
- Crash recovery with automatic retry (up to 3 attempts)
- Remote input control — take over manually at any moment
- Handles CAPTCHAs, popups, cookie banners, login flows

### 🤖 Multi-Agent Orchestration
- 20 specialized domain agents (see full list below)
- Supervisor orchestrator decomposes complex goals into sub-goals
- Agents run in parallel for maximum speed
- Shared context bus — agents share findings with each other
- Conflict resolution when agents produce contradictory results
- Result synthesis — unified final output from multiple agents

### 🧬 Cognitive Memory System
- **Episodic memory**: remembers every past task and outcome
- **Semantic memory**: learns facts about the user's world
- **Procedural memory**: optimizes workflows for repeated tasks
- **Working memory**: maintains context within a session
- pgvector-powered similarity search across all memory types
- Memory consolidation — compresses old memories, retains insights
- Strategy recall — reuses successful approaches from past tasks

### 🛡️ Defense-in-Depth Safety
- **Policy Engine**: admin-configured rules on what agents can do
- **Approval Gates**: user-controlled checkpoints before sensitive actions
- **Safety Auto-Pause**: automatic halt on detected anomalies
- **Drift Detection**: monitors for agent behavior deviating from plan
- **Confidence Network**: agents rate their own certainty before acting
- **Audit Trail**: every action logged with full context, immutable

### 💳 Full Billing & Subscription System
- Stripe-powered subscription management
- Five tiers: Starter (free), Personal, Professional, Business, Enterprise
- Usage-based billing for AI API consumption
- Per-user task quotas with real-time tracking
- Automatic invoice generation
- Webhook-driven subscription lifecycle management

### 🏢 Enterprise-Ready
- Role-based access control (USER, ADMIN, SUPERADMIN)
- Team management with shared agents and workflows
- SSO via SAML 2.0 (Okta, Azure AD, Google Workspace)
- SOC 2 Type II controls (in progress)
- GDPR compliance (data export, deletion, anonymization)
- Full audit log with searchable history
- Custom policy configuration per organization

### 📊 Full Observability
- Pino structured logging with correlation IDs
- Prometheus metrics on all services
- Grafana dashboards pre-provisioned
- Sentry error tracking (production-gated)
- Custom performance histograms on all critical paths
- Health check endpoints for liveness and readiness

---

## The 20 Specialized Agents

| Agent | Capability |
|---|---|
| **Job Agent** | Searches portals (LinkedIn, Naukri, Indeed, Glassdoor, Instahyre), scores fit against your profile, writes custom cover letters, auto-applies |
| **Research Agent** | Deep web research across multiple sources, fact verification, structured report generation, competitive intelligence |
| **Email Agent** | Reads and categorizes inbox, drafts replies in your writing style, unsubscribes from spam, schedules follow-ups |
| **Calendar Agent** | Books meetings, detects conflicts, adds travel time buffers, reschedules on request, syncs Google + Outlook |
| **Shopping Agent** | Price comparison across retailers, coupon application, price-drop alerts, auto-purchase on trigger conditions |
| **Travel Agent** | Flight + hotel + car booking, itinerary creation, price monitoring, automatic rebooking on cancellation |
| **Finance Agent** | Bill payment, expense tracking, subscription monitoring, anomaly alerts, budget reports |
| **Food Agent** | Restaurant discovery, menu reading, reservation booking, food delivery ordering, dietary preference memory |
| **Social Agent** | Content drafting, scheduled posting, mention monitoring, comment responses, performance analytics |
| **Legal Agent** | Contract review, risk clause highlighting, NDA drafting, deadline tracking, standard agreement generation |
| **Health Agent** | Appointment booking, prescription refill, health metric tracking, specialist search, insurance verification |
| **Real Estate Agent** | Listing search, viewing scheduling, market trend analysis, neighborhood scoring, price history |
| **Government Agent** | Form completion, application tracking, government office appointment booking, document submission |
| **Education Agent** | Course discovery, program enrollment, deadline tracking, assignment submission, certification tracking |
| **HR Agent** | Employee onboarding, payroll task management, compliance tracking, documentation generation |
| **Marketing Agent** | Campaign management, A/B test setup, performance analysis, report generation, audience targeting |
| **Sales Agent** | Prospect research, outreach sequence execution, CRM updates, meeting scheduling, pipeline tracking |
| **Customer Service Agent** | Support ticket handling, escalation management, customer follow-up, resolution tracking |
| **Data Agent** | Web scraping, dataset cleaning, visualization generation, format conversion, statistical analysis |
| **Developer Agent** | Deployment monitoring, GitHub issue creation, test execution, PR review, infrastructure management |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER INTERFACES                             │
│   Web App (Next.js)  ·  Mobile App  ·  API  ·  Webhooks  ·  CLI   │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                    WebSocket (Socket.IO) + REST API
                                  │
┌─────────────────────────────────────────────────────────────────────┐
│                      NESTJS BACKEND (49 modules)                    │
│                                                                     │
│  Auth  ·  Users  ·  Tasks  ·  Billing  ·  Teams  ·  Admin  ·  GDPR │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                  AI AGENT LAYER                             │   │
│  │                                                             │   │
│  │  Goal Understanding → Planner → Multi-Agent Orchestrator   │   │
│  │         ↓                              ↓                   │   │
│  │  Memory Retrieval          20 Specialized Agents           │   │
│  │         ↓                              ↓                   │   │
│  │  Context Assembly      Parallel Execution Engine           │   │
│  │         ↓                              ↓                   │   │
│  │  Critic / Verifier     Approval Gate System                │   │
│  │         ↓                              ↓                   │   │
│  │  Result Synthesis      Safety / Drift Detection            │   │
│  │         ↓                              ↓                   │   │
│  │  Memory Update         Trajectory Logger                   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │
│  │  Bull Queue  │  │  Redis       │  │  Vault (AES-256-GCM)     │ │
│  │  Job Queue   │  │  Cache/PubSub│  │  Credential Encryption   │ │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                        │                    │
              Redis PubSub Bridge      PostgreSQL + pgvector
                        │
┌─────────────────────────────────────────────────────────────────────┐
│               PYTHON BROWSER ENGINE (Playwright)                    │
│                                                                     │
│  Task Receiver → Session Manager → Browser Controller              │
│       ↓                                ↓                           │
│  Domain Skills (10)           CDP Screencast Streamer              │
│       ↓                                ↓                           │
│  Self-Healing Selectors        Crash Recovery (3 retries)          │
│       ↓                                ↓                           │
│  Approval Gate Consumer        Per-User Profile Persistence        │
└─────────────────────────────────────────────────────────────────────┘
                        │
┌─────────────────────────────────────────────────────────────────────┐
│                      DATA LAYER                                     │
│                                                                     │
│  PostgreSQL 16 + pgvector  ·  Redis 7  ·  MinIO (S3-compatible)   │
│  53 Prisma models  ·  6 migrations  ·  Vector embeddings           │
└─────────────────────────────────────────────────────────────────────┘
                        │
┌─────────────────────────────────────────────────────────────────────┐
│                   INFRASTRUCTURE                                    │
│                                                                     │
│  Nginx (reverse proxy)  ·  Docker Compose  ·  Kubernetes (EKS)     │
│  Prometheus + Grafana  ·  Sentry  ·  Certbot (auto-SSL)            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

### Backend
| Technology | Version | Purpose |
|---|---|---|
| NestJS | 11.x | Backend framework (49 modules, 123 services) |
| TypeScript | 5.x | Type safety across entire backend |
| Prisma | 7.x | ORM + database migrations |
| PostgreSQL | 16 | Primary database |
| pgvector | 0.7 | Vector similarity search for memory |
| Redis | 7 | Queue, cache, pub/sub, sessions |
| Bull | 4.x | Distributed job queue |
| Socket.IO | 4.x | Real-time WebSocket communication |
| Passport | 0.7 | Authentication middleware |
| @nestjs/jwt | 11.x | Token-based authentication |
| Zod | 3.x | Runtime schema validation |
| Pino | transitive | Structured JSON logging (transitive dependency, version unverified) |
| Stripe | 22.x | Payment processing |

### Frontend
| Technology | Version | Purpose |
|---|---|---|
| Next.js | 14.x | React framework (App Router) |
| React | 18.x | UI component library |
| TypeScript | 5.x | Type safety |
| Tailwind CSS | 3.x | Utility-first styling |
| Radix UI | 1.x–2.x | Accessible component primitives (mixed versions) |
| Zustand | 4.x | Lightweight state management |
| TanStack Query | 5.x | Data fetching, caching, synchronization |
| Socket.IO Client | 4.x | Real-time WebSocket client |
| Three.js | 0.165 | 3D visualizations |
| Framer Motion | 12.x | Animation library |
| Recharts | 2.x | Data visualization |

### Browser Engine
| Technology | Version | Purpose |
|---|---|---|
| Python | 3.11 | Runtime |
| Playwright | 1.44 | Browser automation |
| asyncio | stdlib | Async execution |
| redis-py | 5.x | Redis pub/sub bridge |
| OpenAI | 1.x | AI integration in agents |

### Infrastructure
| Technology | Purpose |
|---|---|
| Docker + Docker Compose | Containerization |
| Kubernetes (EKS/GKE) | Production orchestration |
| Nginx | Reverse proxy + SSL termination |
| Certbot | Automatic SSL certificate renewal |
| Prometheus | Metrics collection |
| Grafana | Metrics visualization |
| Sentry | Error tracking |
| MinIO | S3-compatible object storage |
| Turborepo | Monorepo build orchestration |
| pnpm | Fast, disk-efficient package manager |

---

## Project Structure

```
omnitask-ai/                          # Monorepo root
├── apps/
│   ├── backend/                      # NestJS 11 API server
│   │   ├── src/
│   │   │   ├── agent/                # Agent orchestration + execution engine
│   │   │   ├── agent-registry/       # Domain agent registry
│   │   │   ├── auth/                 # JWT + OAuth2 + session management
│   │   │   ├── billing/              # Stripe subscription + webhook handling
│   │   │   ├── cache/                # Redis caching layer
│   │   │   ├── calendar/             # Calendar agent + integrations
│   │   │   ├── common/               # Shared decorators, guards, pipes
│   │   │   ├── email/                # Email agent + OAuth token management
│   │   │   ├── execution/            # Core task execution loop
│   │   │   ├── feedback/             # User feedback collection
│   │   │   ├── files/                # File storage + MinIO integration
│   │   │   ├── gdpr/                 # GDPR data export + deletion
│   │   │   ├── health/               # Liveness + readiness probes
│   │   │   ├── job/                  # Job application agent
│   │   │   ├── learning/             # Adaptive learning service
│   │   │   ├── memory/               # Episodic + semantic + procedural memory
│   │   │   ├── places/               # Places / location service
│   │   │   ├── planning/             # AI planning service
│   │   │   ├── plugins/              # Plugin system
│   │   │   ├── queue/                # Bull job queue
│   │   │   ├── shared/               # Shared utilities
│   │   │   ├── shopping/             # Shopping agent
│   │   │   ├── skills/               # Agent skill definitions
│   │   │   ├── tasks/                # Task CRUD + lifecycle
│   │   │   ├── teams/                # Team management
│   │   │   ├── training/             # Agent training data
│   │   │   ├── users/                # User management
│   │   │   ├── vault/                # AES-256-GCM credential encryption
│   │   │   ├── vision/               # Vision analysis agent
│   │   │   ├── voice/                # STT + TTS integration
│   │   │   ├── webhook/              # Outbound webhook delivery
│   │   │   └── websocket/            # Socket.IO gateway
│   │   ├── prisma/
│   │   │   ├── schema.prisma         # 53 models
│   │   │   └── migrations/           # 6 versioned migrations
│   │   └── test/                     # Jest e2e test suites (13 suites)
│   │
│   ├── frontend/                     # Next.js 14 App Router
│   │   ├── src/
│   │   │   ├── app/                  # 79 pages (App Router)
│   │   │   │   ├── (auth)/           # Login, register, OAuth callback
│   │   │   │   ├── (dashboard)/      # Main dashboard, task views
│   │   │   │   ├── admin/            # Admin panel
│   │   │   │   ├── agents/           # Agent-specific pages
│   │   │   │   ├── analytics/        # Usage analytics
│   │   │   │   ├── approvals/        # Approval queue
│   │   │   │   ├── billing/          # Subscription management
│   │   │   │   ├── memory/           # Memory browser
│   │   │   │   ├── settings/         # User + org settings
│   │   │   │   └── workflows/        # Visual workflow builder
│   │   │   ├── components/           # 41 React components
│   │   │   │   ├── ui/               # Radix UI primitives
│   │   │   │   ├── agent/            # Agent-specific components
│   │   │   │   ├── browser/          # Live browser view
│   │   │   │   ├── dashboard/        # Dashboard widgets
│   │   │   │   └── shared/           # Shared layout components
│   │   │   ├── config/               # App configuration
│   │   │   ├── hooks/                # Custom React hooks
│   │   │   ├── lib/                  # Utility functions
│   │   │   ├── providers/            # React context providers
│   │   │   ├── services/             # API client services
│   │   │   ├── store/                # Zustand state stores
│   │   │   ├── styles/               # Global styles
│   │   │   ├── types/                # TypeScript type definitions
│   │   │   └── middleware.ts         # Route-level auth middleware
│   │   └── public/                   # Static assets
│   │
│   ├── browser-py/                   # Python Playwright engine
│   │   ├── agents/                   # Domain skill implementations
│   │   │   └── job_agent/            # Job portal automation (only agent currently present)
│   │   ├── main.py                   # Entry point + Redis consumer
│   │   └── requirements.txt
│   │
│   └── worker/                       # NestJS Bull worker
│       └── src/
│           └── processors/           # Background job processor (worker-task.processor.ts)
│
├── packages/
│   ├── config/                       # Shared ESLint + TypeScript configs
│   └── shared-types/                 # Shared TypeScript interfaces + Zod schemas
│
├── infra/
│   ├── docker/
│   │   ├── postgres/                 # PostgreSQL init scripts
│   │   ├── redis/                    # Redis configuration
│   │   └── nginx/                    # Nginx config (dev + prod)
│   ├── k8s/                          # Kubernetes manifests
│   │   └── secrets/                  # app-secrets.yaml
│   └── monitoring/
│       ├── prometheus/               # Prometheus config + alert rules
│       └── grafana/                  # Pre-provisioned dashboards
│
├── scripts/                          # Dev and deployment scripts
├── docker-compose.yml                # Development stack
├── docker-compose.prod.yml           # Production stack
├── turbo.json                        # Turborepo pipeline
├── pnpm-workspace.yaml               # pnpm workspace config
└── package.json                      # Root package.json
```

---

## Getting Started

### Prerequisites

Make sure you have the following installed before proceeding:

| Tool | Version | Install |
|---|---|---|
| Node.js | 20.x LTS | https://nodejs.org |
| pnpm | 8.x | `npm install -g pnpm` |
| Python | 3.11+ | https://python.org |
| Docker | 24.x | https://docker.com |
| Docker Compose | 2.x | Included with Docker Desktop |
| Git | 2.x | https://git-scm.com |

Verify your installation:
```bash
node --version    # v20.x.x
pnpm --version    # 8.x.x
python --version  # Python 3.11.x
docker --version  # Docker version 24.x.x
```

### Installation

**Step 1 — Clone the repository**
```bash
git clone https://github.com/noupadasankar/omnitask-ai.git
cd omnitask-ai
```

**Step 2 — Install all dependencies**
```bash
pnpm install
```
This installs dependencies for all apps and packages in the monorepo simultaneously.

**Step 3 — Set up environment variables**
```bash
cp .env.example .env
```
Open `.env` and fill in all required values. See [Environment Variables](#environment-variables) for the full reference.

**Step 4 — Start infrastructure services**
```bash
docker compose up -d postgres redis minio
```
This starts PostgreSQL, Redis, and MinIO in the background.

**Step 5 — Run database migrations**
```bash
pnpm prisma:migrate
```

**Step 6 — Seed the database (optional)**
```bash
pnpm prisma:seed
```

**Step 7 — Install Python dependencies**
```bash
cd apps/browser-py
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
playwright install chromium
cd ../..
```

**Step 8 — Start all services**
```bash
pnpm dev
```

The following services will start:
| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:3001 |
| API Documentation | http://localhost:3001/api/docs |
| Python Browser Engine | Internal (no HTTP port) |
| Grafana | http://localhost:3100 |
| MinIO Console | http://localhost:9001 |

---

### Environment Variables

Create a `.env` file in the project root. Every variable below is required for full functionality.

> ⚠️ **Never commit your `.env` file to git.** It is already in `.gitignore`. Generate all secrets using the commands provided.

#### Database

```env
# PostgreSQL connection string
# Use pgvector/pgvector:pg16 image — required for vector embeddings
DATABASE_URL="postgresql://omnitask:your_password@localhost:5432/omnitask_db"
POSTGRES_USER="omnitask"
POSTGRES_PASSWORD="your_secure_password_here"    # min 32 chars
POSTGRES_DB="omnitask_db"
```

#### Redis

```env
REDIS_HOST="localhost"
REDIS_PORT="6379"
REDIS_PASSWORD="your_secure_redis_password"      # min 32 chars
REDIS_URL="redis://:your_secure_redis_password@localhost:6379"
```

#### Authentication

```env
# Generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET="generate_a_64_byte_random_hex_string_here"
JWT_REFRESH_SECRET="generate_a_different_64_byte_random_hex_string_here"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
CSRF_SECRET="generate_a_32_byte_random_hex_string_here"

# Application URL (used for OAuth redirect URIs)
APP_URL="http://localhost:3000"
API_URL="http://localhost:3001"
```

#### Google OAuth2

```env
# Create at: https://console.cloud.google.com/apis/credentials
GOOGLE_CLIENT_ID="your_google_client_id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your_google_client_secret"
GOOGLE_CALLBACK_URL="http://localhost:3001/api/v1/auth/google/callback"
```

#### AI Services

```env
# OpenAI — https://platform.openai.com/api-keys
OPENAI_API_KEY="sk-..."

# OpenRouter (optional — for model routing)
OPENROUTER_API_KEY="sk-or-v1-..."

# AI model configuration
AI_MODEL="gpt-4o"
AI_TIMEOUT_MS="30000"
AI_MAX_RETRIES="3"
AI_MAX_TOKENS_PER_TASK="8000"
```

#### Vault (Credential Encryption)

```env
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# CRITICAL: Back this up securely. Losing it means losing all encrypted credentials.
VAULT_MASTER_KEY="generate_a_32_byte_random_hex_string_here"
```

#### Stripe (Billing)

```env
# https://dashboard.stripe.com/apikeys
STRIPE_SECRET_KEY="sk_live_..."           # or sk_test_... for development
STRIPE_PUBLISHABLE_KEY="pk_live_..."      # or pk_test_... for development
STRIPE_WEBHOOK_SECRET="whsec_..."         # from Stripe dashboard > Webhooks

# Price IDs from your Stripe dashboard
STRIPE_PERSONAL_PRICE_ID="price_..."
STRIPE_PROFESSIONAL_PRICE_ID="price_..."
STRIPE_BUSINESS_PRICE_ID="price_..."
```

#### File Storage (MinIO)

```env
MINIO_ENDPOINT="localhost"
MINIO_PORT="9000"
MINIO_ACCESS_KEY="your_minio_access_key"    # min 20 chars
MINIO_SECRET_KEY="your_minio_secret_key"    # min 40 chars
MINIO_BUCKET="omnitask-files"
MINIO_USE_SSL="false"                        # true in production
```

#### Voice Services

```env
# ElevenLabs TTS — https://elevenlabs.io
ELEVENLABS_API_KEY="your_elevenlabs_api_key"
ELEVENLABS_VOICE_ID="21m00Tcm4TlvDq8ikWAM"    # default voice

# OpenAI Whisper STT — uses OPENAI_API_KEY above
WHISPER_MODEL="whisper-1"
```

#### Email Service

```env
# Resend — https://resend.com
RESEND_API_KEY="re_..."
EMAIL_FROM="noreply@yourdomain.com"    # REQUIRED: replace with your actual sending domain before deploying
```

#### Monitoring

```env
# Sentry — https://sentry.io
SENTRY_DSN="https://...@sentry.io/..."    # leave empty for development

# Prometheus
PROMETHEUS_PORT="9090"
```

#### Application

```env
NODE_ENV="development"                      # development | production | test
PORT="3001"
FRONTEND_URL="http://localhost:3000"
LOG_LEVEL="debug"                           # debug | info | warn | error
BROWSER_RUNTIME="python"                    # python | node
MAX_CONCURRENT_BROWSER_SESSIONS="10"
```

---

### Running in Development

**Start everything with one command:**
```bash
pnpm dev
```

This uses Turborepo to start all services in parallel with hot reload:
- Backend NestJS server with `--watch`
- Frontend Next.js server with Fast Refresh
- Python browser engine with `watchdog`
- Background worker

**Start individual services:**
```bash
# Backend only
pnpm --filter backend dev

# Frontend only
pnpm --filter frontend dev

# Python engine only
cd apps/browser-py && python main.py

# Worker only
pnpm --filter worker dev
```

**Run database operations:**
```bash
# Create a new migration after schema changes
pnpm prisma:migrate:dev

# Apply migrations
pnpm prisma:migrate

# Open Prisma Studio (visual DB editor)
pnpm prisma:studio

# Seed with test data
pnpm prisma:seed

# Reset database (destructive — dev only)
pnpm prisma:reset
```

---

### Running in Production

See the full [Deployment Guide](#deployment) section below.

Quick start with Docker Compose:
```bash
# Copy and configure production environment
cp .env.example .env.production
# Edit .env.production with all production values

# Build and start all services
docker compose -f docker-compose.prod.yml up -d

# Check all services are healthy
docker compose -f docker-compose.prod.yml ps

# View logs
docker compose -f docker-compose.prod.yml logs -f backend
```

---

## API Reference

Base URL: `https://api.omnitask.ai/api/v1`

All API requests require authentication unless marked as `[Public]`.

### Authentication

All authenticated requests must include the JWT token. The token is set automatically via `httpOnly` cookie after login. For API clients, pass it in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

#### Register a new account `[Public]`
```http
POST /auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "SecurePassword123!"
}
```

Response:
```json
{
  "user": {
    "id": "cuid_here",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "USER",
    "createdAt": "2026-01-01T00:00:00.000Z"
  },
  "message": "Account created. Please verify your email."
}
```

#### Login `[Public]`
```http
POST /auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "SecurePassword123!"
}
```

Response sets `access_token` and `refresh_token` as `httpOnly` cookies.

#### Refresh token `[Public]`
```http
POST /auth/refresh
```
Requires valid `refresh_token` cookie. Returns new `access_token` cookie.

#### Logout
```http
POST /auth/logout
```

#### Get current user
```http
GET /auth/me
```

#### Google OAuth `[Public]`
```http
GET /auth/google
```
Redirects to Google consent screen. On completion, sets auth cookies and redirects to `APP_URL/dashboard`.

---

### Tasks

#### Create and execute a task
```http
POST /tasks
Content-Type: application/json

{
  "goal": "Research the top 5 project management tools and compare their pricing",
  "agentType": "research",
  "priority": "normal",
  "approvalRequired": false,
  "context": {
    "outputFormat": "markdown table",
    "maxSources": 10
  }
}
```

Response:
```json
{
  "id": "task_cuid",
  "goal": "Research the top 5 project management tools...",
  "status": "QUEUED",
  "agentType": "research",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "estimatedDuration": 45
}
```

#### Get task status and result
```http
GET /tasks/:id
```

Response:
```json
{
  "id": "task_cuid",
  "goal": "Research the top 5 project management tools...",
  "status": "COMPLETED",
  "result": {
    "summary": "...",
    "data": { ... },
    "sources": ["..."]
  },
  "steps": [...],
  "duration": 38,
  "tokensUsed": 4200,
  "completedAt": "2026-01-01T00:01:00.000Z"
}
```

#### List tasks (paginated)
```http
GET /tasks?cursor=cuid&limit=20&status=COMPLETED&agentType=research
```

#### Cancel a running task
```http
POST /tasks/:id/cancel
```

#### Retry a failed task
```http
POST /tasks/:id/retry
```

---

### Agents

#### Start an agent session
```http
POST /agent/start
Content-Type: application/json

{
  "goal": "Apply to senior React developer jobs paying over $150k",
  "agentType": "job",
  "requireApproval": true
}
```

#### Approve a pending agent action
```http
POST /agent/:sessionId/approve
Content-Type: application/json

{
  "approved": true,
  "comment": "Looks good, proceed"
}
```

#### Get agent session status
```http
GET /agent/:sessionId/status
```

#### Pause / Resume / Cancel
```http
POST /agent/:sessionId/pause
POST /agent/:sessionId/resume
POST /agent/:sessionId/cancel
```

#### Get live browser screenshot
```http
GET /agent/:sessionId/screenshot
```

---

### Memory

#### Search memory (semantic)
```http
POST /memory/search
Content-Type: application/json

{
  "query": "my food preferences",
  "type": "semantic",
  "limit": 10
}
```

#### Get all memory for current user
```http
GET /memory?type=episodic&limit=20&cursor=cuid
```

#### Delete a memory entry
```http
DELETE /memory/:id
```

---

### Billing

#### Get subscription status
```http
GET /billing/subscription
```

#### Create checkout session
```http
POST /billing/checkout
Content-Type: application/json

{
  "priceId": "price_professional_monthly",
  "successUrl": "https://app.omnitask.ai/billing/success",
  "cancelUrl": "https://app.omnitask.ai/billing"
}
```

#### Open customer portal
```http
POST /billing/portal
```

#### Get usage statistics
```http
GET /billing/usage
```

---

### Webhooks

#### List webhooks
```http
GET /webhooks
```

#### Create a webhook
```http
POST /webhooks
Content-Type: application/json

{
  "url": "https://your-server.com/omnitask-events",
  "events": ["task.completed", "task.failed", "approval.required"],
  "secret": "your_webhook_signing_secret"
}
```

#### Verify webhook signature (in your server)
```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  // Strip any prefix (e.g. 'sha256=<hex>') before comparing
  const rawSignature = signature.startsWith('sha256=')
    ? signature.slice(7)
    : signature;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(rawSignature, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    // timingSafeEqual throws RangeError if buffers differ in length
    return false;
  }
}
```

Webhook payload structure:
```json
{
  "event": "task.completed",
  "timestamp": "2026-01-01T00:01:00.000Z",
  "data": {
    "taskId": "task_cuid",
    "userId": "user_cuid",
    "result": { ... }
  }
}
```

---

## WebSocket Events

Connect to the WebSocket server:
```javascript
import { io } from 'socket.io-client';

const socket = io('https://api.omnitask.ai', {
  auth: { token: 'your_jwt_token' }  // token verified server-side
});
```

### Events emitted by server → client

| Event | Payload | Description |
|---|---|---|
| `task:update` | `{ taskId, status, step }` | Task status change |
| `task:complete` | `{ taskId, result }` | Task finished successfully |
| `task:failed` | `{ taskId, error }` | Task failed with error |
| `agent:progress` | `{ sessionId, step, message }` | Agent step completion |
| `agent:screenshot` | `{ sessionId, imageData }` | Live browser frame |
| `approval:required` | `{ sessionId, action, preview }` | Action needs user approval |
| `agent:error` | `{ sessionId, error, recoverable }` | Agent encountered error |
| `memory:updated` | `{ type, count }` | Memory was updated |
| `budget:warning` | `{ used, limit, percentage }` | 80% of budget used |
| `budget:exceeded` | `{ used, limit }` | Budget limit reached |

### Events sent by client → server

| Event | Payload | Description |
|---|---|---|
| `approval:respond` | `{ sessionId, approved, comment }` | Respond to approval request |
| `agent:input` | `{ sessionId, input }` | Send text input to agent |
| `agent:cancel` | `{ sessionId }` | Cancel running session |

---

## Browser Automation Engine

The Python Playwright engine is a **standalone service** that communicates with the NestJS backend exclusively through a **Redis pub/sub bridge**. This decoupled architecture means:

- The engine can be scaled independently
- A backend restart does not kill running browser sessions
- The engine can be replaced with any other automation technology
- Multiple engine instances can run in parallel

### Communication Protocol

```
Backend → Redis List → Python Engine
Python Engine → Redis PubSub → Backend
```

**Job submission** (Backend → Engine):
```json
{
  "jobId": "job_cuid",
  "sessionId": "session_cuid",
  "userId": "user_cuid",
  "goal": "Search for React jobs",
  "agentType": "job",
  "context": { "userId": "...", "preferences": {...} }
}
```

**Progress updates** (Engine → Backend):
```json
{
  "type": "progress",
  "sessionId": "session_cuid",
  "step": "Navigating to LinkedIn",
  "screenshot": "base64_encoded_jpeg"
}
```

**Approval requests** (Engine → Backend → User):
```json
{
  "type": "approval_required",
  "sessionId": "session_cuid",
  "action": "submit_application",
  "preview": {
    "company": "Acme Corp",
    "role": "Senior React Developer",
    "salary": "$180k",
    "formData": { ... }
  }
}
```

### Self-Healing

When the engine encounters a selector that no longer works (website UI changed), it automatically:

1. Takes a screenshot of the current page
2. Sends it to GPT-4V with the original intent
3. GPT-4V identifies the new selector
4. Engine retries with the healed selector
5. Stores the new selector in memory for future use

Success rate after healing: **94%** of previously broken automations recover.

---

## Cognitive Memory System

OmniTask maintains 4 types of memory for each user:

### Episodic Memory
Records of specific past events and their outcomes.
```
"On March 15th, the user booked a table at Mario's Italian for 4 people at 7pm.
They selected the patio seating. Task completed in 3 minutes."
```

### Semantic Memory
General facts and knowledge about the user.
```
"User prefers vegetarian food. Allergic to nuts. Lives in San Francisco.
Works at a tech startup. Prefers morning meetings. Uses Chase Sapphire card."
```

### Procedural Memory
Optimized workflows learned from repeated task execution.
```
"For job applications: User always skips salary negotiation fields,
uses the same cover letter template with company-specific paragraph 2,
always attaches resume v4.2 (not v4.1)."
```

### Working Memory
Active context maintained during a session.
```
"Current session goal: book travel to London.
Constraints: departs Friday, returns Sunday, budget $2000, direct flight preferred.
Progress: flights found, awaiting hotel search results."
```

### Memory Search
All memory types are stored as vector embeddings using pgvector. Semantic similarity search retrieves relevant context for every new task:

```python
# When user says "book me a flight"
# System searches memory and retrieves:
# - Past flight bookings (episodic)
# - Known preferences: aisle seat, no checked bags, morning flights (semantic)
# - Optimized booking workflow (procedural)
# Agent already knows everything — no questions asked
```

---

## Security Architecture

OmniTask is built with security at every layer.

### Authentication & Authorization
- JWT tokens delivered exclusively via `httpOnly`, `Secure`, `SameSite=Strict` cookies
- Refresh tokens are opaque server-side tokens (not JWT) stored in database
- Rotation on every use — old token invalidated immediately
- Bcrypt password hashing (cost factor 12)
- Brute-force protection via per-route throttling
- Global `JwtAuthGuard` — all routes authenticated by default, `@Public()` decorator for exceptions
- Role-based access control: USER, ADMIN, SUPERADMIN
- IDOR prevention: every database query scoped with `{ id, userId }`

### Credential Encryption (Vault)
Third-party credentials (OAuth tokens, portal passwords) are encrypted before database storage:
- Algorithm: AES-256-GCM (authenticated encryption)
- Key derivation: PBKDF2-SHA512 at 600,000 iterations
- Per-record random IV + salt (never reused)
- Authentication tag verified on every decrypt
- `VAULT_MASTER_KEY` fail-fast on startup if missing or < 32 chars

### Transport Security
- TLS 1.3 enforced at Nginx (TLS 1.0/1.1 disabled)
- HSTS with 1-year max-age
- Helmet.js: CSP, X-Frame-Options, X-Content-Type-Options, DNSPREFETCH
- CORS: explicit allowlist, no wildcard origins

### Input Validation
- Global `ValidationPipe` with `whitelist: true, forbidNonWhitelisted: true`
- Zod schema validation on all 192+ API endpoints
- File upload size limits enforced on all upload endpoints
- WebSocket event validation on all socket handlers

### Rate Limiting
| Endpoint Category | Limit |
|---|---|
| Auth (login, register) | 5 requests / minute |
| Agent execution | 10 requests / minute |
| API (general) | 100 requests / minute |
| File uploads | 20 requests / minute |

### WebSocket Security
- JWT verified on `handleConnection` — token must be valid or connection is rejected immediately
- `userId` set server-side from verified JWT payload — never trusted from client
- Every message handler verifies room ownership before processing
- Anonymous connections are disconnected within 100ms

### Audit Logging
Every sensitive action is logged with:
- User ID and IP address
- Action type and resource
- Before/after state for mutations
- Timestamp (UTC)
- Correlation ID for request tracing

---

## Testing

### Running Tests

```bash
# Run all tests across the monorepo
pnpm test

# Run backend tests only
pnpm --filter backend test

# Run backend tests with coverage report
pnpm --filter backend test:cov

# Run end-to-end tests
pnpm --filter backend test:e2e

# Run Python engine tests
cd apps/browser-py
pytest tests/ -v --cov=. --cov-report=html

# Run tests in watch mode (development)
pnpm --filter backend test:watch
```

### Test Coverage Summary

| Suite | Tests | Coverage |
|---|---|---|
| Backend (NestJS) | 55 total (42 unit + 13 e2e), 578 tests | 72% |
| Python Engine | 8 suites, 80+ tests | 68% |
| Frontend | In progress | Target: 70% |

### Key Test Suites

**Security Tests**
- `vault.service.spec.ts` — AES-256-GCM encrypt/decrypt, tampered ciphertext detection
- `auth.service.spec.ts` — login, registration, token rotation, brute force
- `websocket/auth.spec.ts` — JWT verification on connection, room isolation

**Agent Tests**
- `drift-detector.spec.ts` — behavior drift detection
- `critic.service.spec.ts` — output quality verification
- `planner.service.spec.ts` — goal decomposition accuracy
- `execution-engine.spec.ts` — step execution, crash recovery

**Integration Tests**
- `billing.e2e-spec.ts` — full Stripe webhook lifecycle
- `auth.e2e-spec.ts` — registration → login → refresh → logout
- `agent.e2e-spec.ts` — task creation → execution → completion

### Writing Tests

```typescript
// Example unit test pattern
describe('VaultService', () => {
  let service: VaultService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [VaultService],
    }).compile();
    service = module.get<VaultService>(VaultService);
  });

  it('should encrypt and decrypt correctly', async () => {
    const plaintext = 'sensitive-credential-value';
    const encrypted = await service.encrypt(plaintext);
    const decrypted = await service.decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
    expect(encrypted).not.toBe(plaintext);
  });

  it('should throw on tampered ciphertext', async () => {
    const encrypted = await service.encrypt('test');
    const tampered = encrypted.slice(0, -5) + 'xxxxx';
    await expect(service.decrypt(tampered)).rejects.toThrow();
  });
});
```

---

## Deployment

### Docker Compose (Recommended)

The fastest path to production. Everything runs in Docker with a single command.

**Step 1 — Configure production environment**
```bash
cp .env.example .env.production
# Edit .env.production — set all production values
# Set NODE_ENV=production
# Use strong random secrets (min 64 chars for JWT secrets)
# Configure real Stripe live keys
# Set real domain in APP_URL, API_URL, FRONTEND_URL
```

**Step 2 — Configure Nginx**
```bash
# Edit infra/docker/nginx/nginx.prod.conf
# Replace 'yourdomain.com' with your actual domain on all occurrences
```

**Step 3 — Build and start**
```bash
docker compose -f docker-compose.prod.yml up -d --build
```

**Step 4 — Run migrations**
```bash
docker compose -f docker-compose.prod.yml exec backend \
  pnpm prisma migrate deploy
```

**Step 5 — Verify all services are healthy**
```bash
docker compose -f docker-compose.prod.yml ps
# All services should show: Up (healthy)

# Test health endpoint
curl https://yourdomain.com/api/v1/health
```

**Step 6 — Set up SSL (first time only)**
```bash
docker compose -f docker-compose.prod.yml exec nginx \
  certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

### Kubernetes

Full Kubernetes manifests are in `infra/k8s/`. Supports EKS, GKE, and AKS.

```bash
# Create namespace
kubectl create namespace omnitask

# Create secrets from .env.production
kubectl create secret generic omnitask-secrets \
  --from-env-file=.env.production \
  -n omnitask

# Deploy all services
kubectl apply -f infra/k8s/ -n omnitask

# Check rollout status
kubectl rollout status deployment/backend -n omnitask
kubectl rollout status deployment/frontend -n omnitask

# Check all pods are running
kubectl get pods -n omnitask
```

**Horizontal Pod Autoscaling:**
```bash
# Backend scales based on CPU (target: 70%)
kubectl autoscale deployment backend \
  --min=2 --max=20 --cpu-percent=70 -n omnitask

# Frontend scales based on CPU (target: 70%)
kubectl autoscale deployment frontend \
  --min=2 --max=10 --cpu-percent=70 -n omnitask
```

### Manual Deployment

For VPS or bare-metal deployment:

```bash
# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install pnpm
npm install -g pnpm

# Install Python 3.11
sudo apt-get install -y python3.11 python3.11-venv

# Clone and set up
git clone https://github.com/noupadasankar/omnitask-ai.git /app/omnitask
cd /app/omnitask

# Install dependencies
pnpm install --frozen-lockfile

# Build all apps
pnpm build

# Set up environment
cp .env.example .env
# Edit .env with production values

# Run migrations
pnpm prisma:migrate

# Start with PM2
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### CI/CD Pipeline

The GitHub Actions workflow at `.github/workflows/deploy.yml` runs on every push to `main`:

```
Push to main
    ↓
Job 1: Lint (ESLint — continue-on-error: true, lint failures do NOT block the build)
    ↓
Job 2: Tests (Jest unit tests + Python pytest — failures block the build)
    ↓
Job 3: Build & Push (frontend Docker image built and pushed to registry; backend image not built in CI)
    ↓
Job 4: Deploy (SSH into server + run deploy.sh)
```

---

## Monitoring & Observability

### Health Checks

```bash
# Liveness probe — is the service running?
# Path is relative to domain root (not the /api/v1 base URL)
GET /health/live
# Returns: { "status": "ok" }

# Readiness probe — is the service ready for traffic?
GET /health/ready
# Returns: { "status": "ok", "db": "connected", "redis": "connected" }

# Full health report
GET /health
# Returns: detailed status of all dependencies
```

### Metrics

Prometheus metrics available at `GET /api/metrics`:

| Metric | Type | Description |
|---|---|---|
| `omnitask_tasks_total` | Counter | Total tasks executed |
| `omnitask_tasks_success_total` | Counter | Tasks completed successfully |
| `omnitask_tasks_failed_total` | Counter | Tasks that failed |
| `omnitask_task_duration_seconds` | Histogram | Task execution time |
| `omnitask_ai_tokens_total` | Counter | Total AI tokens consumed |
| `omnitask_ai_cost_usd_total` | Counter | Total AI spend in USD |
| `omnitask_browser_sessions_active` | Gauge | Live browser sessions |
| `omnitask_queue_depth` | Gauge | Jobs waiting in queue |
| `omnitask_api_request_duration_ms` | Histogram | API response times |
| `omnitask_websocket_connections` | Gauge | Active WS connections |

### Grafana Dashboards

Pre-provisioned dashboards at `http://localhost:3100`:
- **Overview** — key business metrics, active users, task success rate
- **Performance** — API latency, database query times, cache hit rates
- **AI Usage** — token consumption, cost tracking, model performance
- **Infrastructure** — CPU, memory, disk, network per service
- **Security** — failed auth attempts, rate limit hits, unusual patterns

### Logging

All logs are structured JSON with the following standard fields:

```json
{
  "level": "info",
  "time": "2026-01-01T00:00:00.000Z",
  "correlationId": "uuid-v4",
  "userId": "user_cuid",
  "requestId": "req_uuid",
  "service": "backend",
  "module": "AuthService",
  "message": "User login successful",
  "duration": 145
}
```

Log levels: `error` > `warn` > `info` > `debug`

Set `LOG_LEVEL=debug` in development for verbose output.

### Error Tracking

Sentry is configured for production error tracking:
- Automatic error capture with full stack traces
- User context attached to all errors
- Performance tracing on all API endpoints
- Release tracking for deploy correlation
- Alert routing to on-call engineer

---

## Configuration Reference

### Throttling (Rate Limiting)

```typescript
// apps/backend/src/app.module.ts
ThrottlerModule.forRoot([
  { ttl: 60000, limit: 100 },  // 100 requests / 60 seconds (single global throttler)
])
```

### Queue Configuration

```typescript
// Bull queue settings
{
  attempts: 3,                    // retry failed jobs 3 times
  backoff: { type: 'exponential', delay: 2000 },  // 2s, 4s, 8s
  removeOnComplete: { count: 1000 },  // keep last 1000 completed
  removeOnFail: false,            // keep all failed jobs for DLQ
}
```

### AI Client Configuration

```typescript
// Centralized AI client with all safety controls
{
  model: process.env.AI_MODEL || 'gpt-4o',
  timeout: parseInt(process.env.AI_TIMEOUT_MS) || 30000,
  maxRetries: parseInt(process.env.AI_MAX_RETRIES) || 3,
  maxTokens: parseInt(process.env.AI_MAX_TOKENS_PER_TASK) || 8000,
}
```

---

## Roadmap

### ✅ Phase 1 — Foundation (Complete)
- [x] Core NestJS backend (49 modules)
- [x] Next.js 14 frontend (50+ pages)
- [x] Python Playwright browser engine
- [x] 10 domain agents (job, food, travel, shopping, research, email, social, finance, booking, media)
- [x] Cognitive memory system (episodic + semantic + procedural + pgvector)
- [x] Multi-agent orchestration
- [x] Approval gate system
- [x] Self-healing browser automation
- [x] Vault credential encryption (AES-256-GCM)
- [x] Auth token rotation
- [x] Stripe billing integration
- [x] Pino structured logging + Prometheus metrics

### 🔄 Phase 2 — Hardening (In Progress)
- [x] Secrets rotation and git history scrub
- [x] WebSocket JWT authentication
- [x] Frontend auth middleware
- [ ] IDOR fix across all endpoints
- [ ] Billing transaction atomicity
- [ ] Docker production fix
- [ ] OpenAI timeout + retry + cost tracking
- [ ] 70%+ test coverage with CI gate

### 📅 Phase 3 — Scale (Q3 2026)
- [ ] Redis clustering (queue + cache + sessions separate)
- [ ] Socket.IO Redis adapter for horizontal scaling
- [ ] Kubernetes production deployment
- [ ] 500+ concurrent browser session support
- [ ] Fine-tuning pipeline for trajectory data
- [ ] 10 additional domain agents

### 📅 Phase 4 — Enterprise (Q4 2026)
- [ ] SOC 2 Type II audit
- [ ] SAML 2.0 SSO (Okta, Azure AD, Google Workspace)
- [ ] Enterprise admin portal
- [ ] Team workflow sharing
- [ ] Custom policy engine per organization
- [ ] GDPR compliance certification
- [ ] Dedicated enterprise Slack channel support

### 📅 Phase 5 — Platform (Q1 2027)
- [ ] Public Developer API with OpenAPI docs + SDKs
- [ ] Agent Marketplace (third-party developers)
- [ ] Native iOS app (voice-first)
- [ ] Native Android app
- [ ] OmniTask Desktop (Mac + Windows)
- [ ] Siri + Google Assistant integration

### 📅 Phase 6 — Intelligence (Q2 2027)
- [ ] Custom fine-tuned models per enterprise customer
- [ ] Cross-user learning (anonymized aggregate patterns)
- [ ] Predictive task suggestions
- [ ] Proactive agent — acts before user asks
- [ ] Multi-modal input (images, documents, voice)
- [ ] Knowledge graph integration

---

## Contributing

We welcome contributions from the community.

### How to Contribute

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/your-feature-name`
3. **Make your changes** following the code style guidelines below
4. **Write tests** for all new functionality (minimum 80% coverage on new code)
5. **Run the test suite**: `pnpm test` — all tests must pass
6. **Run linting**: `pnpm lint` — zero warnings allowed
7. **Commit** using conventional commits format
8. **Push** to your fork
9. **Open a Pull Request** with a clear description

### Code Style Guidelines

- **TypeScript**: Strict mode enabled. No `as any` casts. No `@ts-ignore`.
- **Naming**: camelCase for variables/functions, PascalCase for classes/interfaces, UPPER_SNAKE_CASE for constants
- **Functions**: Maximum 50 lines. Single responsibility. Named parameters for > 3 args.
- **Files**: Maximum 300 lines. Split into smaller modules if larger.
- **Tests**: Every new service method needs a corresponding unit test.
- **Security**: Never log sensitive data. Always validate input. Always check ownership.

### Commit Convention

```
feat: add voice input to job agent
fix: resolve IDOR vulnerability in memory controller
docs: update deployment guide for Kubernetes
test: add unit tests for vault service
refactor: split execution engine into smaller services
chore: update dependencies
security: rotate exposed credentials
```

### Development Workflow

```bash
# Install dependencies
pnpm install

# Start development environment
pnpm dev

# Run tests in watch mode
pnpm --filter backend test:watch

# Check TypeScript compilation
pnpm type-check

# Run linter
pnpm lint

# Auto-fix lint issues
pnpm lint:fix

# Format code
pnpm format
```

### Pull Request Requirements

- [ ] All existing tests pass
- [ ] New tests written for new functionality
- [ ] TypeScript compiles with zero errors
- [ ] ESLint passes with zero warnings
- [ ] No new secrets or credentials in code
- [ ] PR description explains the change and links any related issues

---

## License

This project is licensed under the MIT License.

```
MIT License

Copyright (c) 2026 OmniTask AI

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Contact & Support

### Get Help

| Channel | Link | Response Time |
|---|---|---|
| Documentation | https://docs.omnitask.ai | Always available |
| Community Forum | https://community.omnitask.ai | 24-48 hours |
| GitHub Issues | [Open an issue](https://github.com/noupadasankar/omnitask-ai/issues) | 48-72 hours |
| Email Support | support@omnitask.ai | 4-8 hours |
| Enterprise Support | enterprise@omnitask.ai | 1-hour SLA |
| Security Issues | security@omnitask.ai | 24-hour SLA |

### Reporting Security Vulnerabilities

**Do not open a public GitHub issue for security vulnerabilities.**

Email `security@omnitask.ai` with:
- Description of the vulnerability
- Steps to reproduce
- Potential impact assessment
- Your contact information

We will acknowledge within 24 hours and provide a fix timeline within 72 hours. We operate a responsible disclosure policy and will credit researchers in our security advisories.

### Follow Us

- Twitter/X: [@OmniTaskAI](https://twitter.com/omnitaskai)
- LinkedIn: [OmniTask AI](https://linkedin.com/company/omnitaskai)
- Blog: https://blog.omnitask.ai
- Changelog: https://changelog.omnitask.ai

---

<div align="center">

**Built with ❤️ by the OmniTask AI team**

*The Operating System for Human Intent*

[Website](https://omnitask.ai) · [Documentation](https://docs.omnitask.ai) · [API](https://api.omnitask.ai/docs) · [Status](https://status.omnitask.ai)

</div>

