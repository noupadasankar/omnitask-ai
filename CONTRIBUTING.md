# Contributing to OmniTask AI

> Thank you for your interest in contributing. This document explains the code standards, PR process, and architecture rules that keep the codebase clean and maintainable.

---

## Table of Contents

1. [Before You Start](#1-before-you-start)
2. [Development Setup](#2-development-setup)
3. [Code Architecture Rules](#3-code-architecture-rules)
4. [Coding Standards](#4-coding-standards)
5. [Git Workflow](#5-git-workflow)
6. [Commit Message Format](#6-commit-message-format)
7. [Pull Request Process](#7-pull-request-process)
8. [Testing Requirements](#8-testing-requirements)
9. [Adding New Features](#9-adding-new-features)
10. [Adding a New Agent](#10-adding-a-new-agent)
11. [What We Won't Accept](#11-what-we-wont-accept)
12. [Getting Help](#12-getting-help)

---

## 1. Before You Start

### Read first, then code

1. **Read `ARCHITECTURE.md`** — Understand WHY decisions were made before changing them. If you disagree with an architectural decision, open an issue to discuss it before writing code that contradicts it.

2. **Read `docs/agents.md`** — If you're adding an agent or changing execution behavior.

3. **Search existing issues** — Your bug/feature may already be tracked. Don't open a duplicate.

4. **Open an issue before a large PR** — A PR that changes 500+ lines without prior discussion will likely be closed. Open an issue, describe your approach, get feedback, then implement.

### Contribution types we actively want

- Bug fixes with reproduction test cases
- Performance improvements with benchmark evidence
- New agent types (see [Adding a New Agent](#10-adding-a-new-agent))
- New browser action types
- Improved LLM prompts with measurable quality improvement
- Documentation improvements
- Test coverage improvements

---

## 2. Development Setup

### Requirements

- Node.js 20+
- pnpm 8+
- Docker Desktop
- Git

### Setup

```bash
# Fork and clone
git clone https://github.com/YOUR_USERNAME/omnitask-ai.git
cd omnitask-ai

# Install dependencies
pnpm install

# Copy env
cp .env.example .env
# Edit .env with your values

# Start services
docker-compose up -d

# Run migrations
docker-compose exec backend npx prisma migrate deploy

# Verify everything works
docker-compose exec backend pnpm test
```

### IDE Setup (VSCode recommended)

Install these extensions:

- **ESLint** — `dbaeumer.vscode-eslint`
- **Prettier** — `esbenp.prettier-vscode`
- **Prisma** — `Prisma.prisma`
- **TypeScript Hero** — `ms-vscode.vscode-typescript-next`

The repo includes `.vscode/settings.json` that configures format-on-save.

---

## 3. Code Architecture Rules

These are non-negotiable. PRs that violate them will be asked to fix before merge.

### Rule 1 — Module boundaries are sacred

```typescript
// ✅ CORRECT — import from the module's exported service
import { FilesService } from '../files/files.service';

// ❌ WRONG — never bypass the service layer and import Prisma directly
import { PrismaService } from '../../prisma.service';
// (unless you ARE inside that module's own service/repository)
```

### Rule 2 — Controllers do zero business logic

```typescript
// ✅ CORRECT
@Post()
create(@Req() req: AuthRequest, @Body() dto: CreateTaskDto) {
  return this.tasks.create(req.user.id, dto);
}

// ❌ WRONG — business logic in controller
@Post()
async create(@Req() req: AuthRequest, @Body() dto: CreateTaskDto) {
  const existing = await this.prisma.task.findMany({ where: { userId: req.user.id } });
  if (existing.length >= 100) throw new ForbiddenException('Task limit reached');
  // ... more logic
}
```

### Rule 3 — Never use `any` type

```typescript
// ✅ CORRECT
async execute(step: PlanStep): Promise<StepResult>

// ❌ WRONG
async execute(step: any): Promise<any>
```

### Rule 4 — All shared types go in packages/shared-types

If both frontend and backend need a type, it goes in `packages/shared-types/src/`. Never duplicate type definitions across apps.

### Rule 5 — DTOs use class-validator, not manual checks

```typescript
// ✅ CORRECT
export class CreateTaskDto {
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  rawInput: string;

  @IsBoolean()
  @IsOptional()
  shadowMode?: boolean;
}

// ❌ WRONG — manual validation in service
if (!dto.rawInput || dto.rawInput.length < 5) {
  throw new BadRequestException('...');
}
```

### Rule 6 — All WebSocket events emit via WsGateway, never direct socket access

```typescript
// ✅ CORRECT — through the gateway
this.ws.emitToUser(userId, 'task:complete', payload);

// ❌ WRONG — bypass the gateway
this.server.to(`user:${userId}`).emit('task:complete', payload);
```

### Rule 7 — No console.log — use NestJS Logger

```typescript
// ✅ CORRECT
private readonly logger = new Logger(MyService.name);
this.logger.log('Task started');
this.logger.error('Step failed', err.stack);

// ❌ WRONG
console.log('Task started');
```

---

## 4. Coding Standards

### TypeScript

- **Strict mode** — `tsconfig.json` has `"strict": true`. All files must compile with zero errors.
- **No `any`** — Use `unknown` + type guards if you genuinely don't know the type.
- **Explicit return types** — All public service methods must have explicit return type annotations.
- **Readonly where possible** — `private readonly service: Service` in constructors.

### File naming

```
service files:       kebab-case.service.ts
controller files:    kebab-case.controller.ts
module files:        kebab-case.module.ts
dto files:           kebab-case.dto.ts
entity files:        kebab-case.entity.ts
test files:          kebab-case.spec.ts
React components:    PascalCase.tsx
hooks:               useCamelCase.ts
```

### Import ordering (enforced by ESLint)

```typescript
// 1. Node.js built-ins
import * as crypto from 'crypto';

// 2. External packages
import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';

// 3. Internal monorepo packages
import { TaskStatus } from '@omnitask/shared-types';

// 4. Local imports (relative)
import { PrismaService } from '../../prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
```

### Error handling

Always use typed NestJS exceptions. Never throw raw `Error`:

```typescript
// ✅ CORRECT
throw new NotFoundException(`Task ${id} not found`);
throw new ForbiddenException("Cannot access another user's task");
throw new BadRequestException(`Invalid action: ${step.action}`);
throw new ServiceUnavailableException('OpenAI API unavailable');

// ❌ WRONG
throw new Error('not found');
throw 'task not found';
```

### Async/Await

Always `await` promises. Never `.then()` chains in application code (they're harder to read and error-prone):

```typescript
// ✅ CORRECT
const task = await this.tasks.findOne(userId, taskId);
const plan = await this.planning.generatePlan(task.rawInput);

// ❌ WRONG
return this.tasks.findOne(userId, taskId)
  .then(task => this.planning.generatePlan(task.rawInput))
  .then(plan => { ... });
```

---

## 5. Git Workflow

### Branch naming

```
feature/short-description          New feature
fix/short-description              Bug fix
refactor/short-description         Refactoring (no behavior change)
docs/short-description             Documentation only
test/short-description             Tests only
chore/short-description            Build, config, deps

Examples:
feature/email-agent
fix/playwright-context-leak
refactor/planning-service-extract-validator
docs/improve-agent-guide
```

### Workflow

```bash
# 1. Sync with upstream
git checkout main
git pull upstream main

# 2. Create branch
git checkout -b feature/my-feature

# 3. Make changes
# ... code ...

# 4. Run checks locally
pnpm turbo lint
pnpm turbo type-check
docker-compose exec backend pnpm test

# 5. Commit (see commit format below)
git add .
git commit -m "feat(agents): add email agent with Gmail API support"

# 6. Push and open PR
git push origin feature/my-feature
```

---

## 6. Commit Message Format

We use [Conventional Commits](https://www.conventionalcommits.org/).

### Format

```
type(scope): short description

[optional body]

[optional footer]
```

### Types

| Type       | When to use                         |
| ---------- | ----------------------------------- |
| `feat`     | New feature                         |
| `fix`      | Bug fix                             |
| `refactor` | Code change with no behavior change |
| `test`     | Adding or updating tests            |
| `docs`     | Documentation only                  |
| `chore`    | Build, config, dependency updates   |
| `perf`     | Performance improvement             |
| `ci`       | CI/CD changes                       |

### Scopes (use the module/area name)

```
auth, tasks, planning, execution, browser, agents, memory,
skills, approvals, files, scheduler, policies, billing,
frontend, worker, infra, docs, deps
```

### Examples

```
feat(agents): add email agent with Gmail OAuth support

fix(browser): fix context leak when playwright page throws on navigation

refactor(planning): extract risk scorer to separate service

test(execution): add unit tests for compensation service

docs(agents): add email agent tutorial to agents.md

chore(deps): upgrade playwright to 1.42.0

perf(memory): add IVFFlat index to memory embeddings table

BREAKING CHANGE: PlanStep interface now requires 'description' field
```

### Breaking changes

If your change breaks the public API or shared types, add `BREAKING CHANGE:` in the commit footer:

```
feat(shared-types): add 'description' as required field to PlanStep

BREAKING CHANGE: PlanStep.description is now required.
Update all plan generators to include a description for each step.
```

---

## 7. Pull Request Process

### PR checklist (complete all before requesting review)

- [ ] Branch is up to date with `main`
- [ ] All tests pass: `docker-compose exec backend pnpm test`
- [ ] Type check passes: `pnpm turbo type-check`
- [ ] Lint passes: `pnpm turbo lint`
- [ ] New code has tests (unit or integration, whichever fits)
- [ ] No `console.log` statements in production code
- [ ] No `any` types introduced
- [ ] Documentation updated if behavior changed
- [ ] `CHANGELOG.md` updated with summary of change

### PR title format

Same as commit format:

```
feat(agents): add email agent with Gmail API support
fix(browser): resolve context leak on navigation timeout
```

### PR size guidelines

- **Small (< 200 lines)**: Merge same day
- **Medium (200–500 lines)**: Review within 2 days
- **Large (500+ lines)**: Split into smaller PRs if possible; requires prior issue discussion

### What happens after you open a PR

1. CI runs automatically (lint, type-check, tests, security scan, Docker build)
2. If CI fails: fix it before requesting review
3. Maintainer reviews within 3 business days
4. Address review comments with new commits (no force-push during review)
5. After approval: maintainer squash-merges to `main`

---

## 8. Testing Requirements

### What must be tested

**Every new service method needs at minimum:**

1. A happy path test (normal operation)
2. An error path test (the most likely failure case)

**Specific requirements:**

- `planning/plan-validator.ts` — test every allowed action, test rejection of unknown actions
- `execution/` services — test state transitions, test compensation
- `browser/` services — integration tests using Playwright test browser
- API controllers — integration tests with full request lifecycle
- New agents — canHandle tests, execute happy path, execute error path

### Test file location

```
Unit tests:       modules/tasks/tasks.service.spec.ts (next to the file)
Integration:      test/integration/tasks.spec.ts
E2E:              test/e2e/full-task-flow.spec.ts
```

### Test naming convention

```typescript
describe('TasksService', () => {
  describe('create()', () => {
    it('should create a task and push to queue', async () => { ... });
    it('should throw ForbiddenException when user quota exceeded', async () => { ... });
  });

  describe('findOne()', () => {
    it('should return task with steps when found', async () => { ... });
    it('should throw NotFoundException when task does not exist', async () => { ... });
    it('should throw ForbiddenException when task belongs to different user', async () => { ... });
  });
});
```

### Mocking policy

- **Mock external services** (OpenAI, S3, Playwright) in unit and integration tests
- **Use real database** (test PostgreSQL container) in integration and E2E tests
- **Never mock the module under test** — only mock its dependencies

---

## 9. Adding New Features

### Adding a new API endpoint

1. Add the route to the controller with full Swagger decorators
2. Add the business logic to the service
3. Add a DTO with class-validator decorators
4. Add integration tests
5. Update `docs/api.md` with the new endpoint

### Adding a new Prisma model

1. Add the model to `prisma/schema.prisma`
2. Run `npx prisma migrate dev --name add_model_name`
3. Add necessary indexes (see Database Design in `ARCHITECTURE.md`)
4. Add the model to `packages/shared-types/src/` if the frontend needs it
5. Update `prisma/seed.ts` to include example data

### Adding a new WebSocket event

1. Add the event name constant to `shared/websocket/events/task.events.ts`
2. Emit it in the service via `ws.emitToUser()`
3. Add the event to the TypeScript event map in `packages/shared-types/src/websocket.types.ts`
4. Handle it in the frontend via `useWebSocket()` hook
5. Document it in `docs/api.md` under WebSocket Events

---

## 10. Adding a New Agent

Adding an agent is the most common contribution type. Follow this exact pattern:

### Step 1 — Create the agent file

```typescript
// apps/backend/src/modules/agents/my-feature/my-feature.agent.ts

@Injectable()
export class MyFeatureAgent implements IAgent {
  readonly type = AgentType.MY_FEATURE; // Add to enum first

  canHandle(step: PlanStep): boolean {
    return ['my_action_1', 'my_action_2'].includes(step.action as string);
  }

  async execute(input: AgentInput): Promise<AgentOutput> {
    const start = Date.now();
    try {
      // ... implementation
      return { success: true, data: result, duration: Date.now() - start };
    } catch (err: any) {
      return { success: false, error: err.message, duration: Date.now() - start };
    }
  }
}
```

### Step 2 — Register in AgentsModule

```typescript
// agents.module.ts — add to providers array
providers: [...existingAgents, MyFeatureAgent],
```

### Step 3 — Add to AgentType enum in Prisma schema

```prisma
enum AgentType { BROWSER API FILE RESEARCH DATA NOTIFICATION SUPERVISOR MY_FEATURE }
```

### Step 4 — Add allowed actions to PlanValidator

```typescript
export const ALLOWED_ACTIONS = [...existingActions, 'my_action_1', 'my_action_2'] as const;
```

### Step 5 — Update system prompt

Add your new actions to `modules/planning/prompts/system.prompt.ts` with usage examples.

### Step 6 — Add few-shot examples

Add 1–2 example plans using your new actions to `few-shot.examples.ts`.

### Step 7 — Write tests

```typescript
// test/unit/agents/my-feature.agent.spec.ts
describe('MyFeatureAgent', () => {
  it('canHandle should return true for my_action_1', ...);
  it('execute should ...', ...);
  it('execute should return error result when ...', ...);
});
```

### Step 8 — Document in agents.md

Add a section to `docs/agents.md` explaining what the agent does and when to use it.

---

## 11. What We Won't Accept

### Hard rejections (no exceptions)

- PRs that add `any` types without justification
- PRs that bypass the module system (cross-module raw DB access)
- PRs that add business logic to controllers
- PRs without tests for new functionality
- PRs that break existing tests without fixing them
- PRs that introduce environment-specific hardcoding

### Things that need discussion first

- Major architectural changes (open an issue)
- New dependencies (especially large ones like ML libraries)
- Changes to shared types that break existing APIs
- New queue types or job patterns
- Changes to the security model

### Not in scope

- Switching from PostgreSQL to another database
- Switching from Playwright to another automation library
- Moving from NestJS to another framework
- Adding blockchain/crypto functionality
- Generating or executing AI-produced code at runtime

---

## 12. Getting Help

- **Architecture questions**: Read `ARCHITECTURE.md` first, then open a GitHub Discussion
- **Bug reports**: Use the bug report issue template
- **Feature ideas**: Use the feature request issue template
- **General questions**: GitHub Discussions → Q&A category

Response time: 2–5 business days (solo maintainer).

---

_This document was last updated for v1.0. For older contribution patterns, check the git history._
