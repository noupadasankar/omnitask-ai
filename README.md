# OmniTask AI - Autonomous Agent Workforce Platform

A production-ready platform for autonomous AI agents that can browse the web, manage files, and execute complex tasks with human-in-the-loop approvals.

## Features

- **Autonomous Browser Automation** - AI agents that can navigate websites and extract data
- **Task Planning & Execution** - LLM-powered planning with step-by-step execution
- **Human-in-the-loop Approvals** - Critical actions require human approval (CAPTCHA, payments, etc.)
- **Memory & Learning** - Builds skills from past successful task executions
- **Shadow Mode** - Test plans without executing them
- **Real-time WebSocket Updates** - Live progress updates during execution
- **File Management** - S3-compatible storage with MinIO

## Tech Stack

- **Backend**: NestJS, Prisma, PostgreSQL (with pgvector), Redis, BullMQ
- **Frontend**: Next.js 14, TailwindCSS
- **Browser**: Playwright with pooled browsers
- **Deployment**: Docker, Kubernetes

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