# OmniTask AI — Production Guide

## 1. Architecture

Autonomous multi-layer platform:

| Layer | Responsibility |
|-------|----------------|
| **Planner** | Natural language → validated JSON plan (`PlanningService` + `AiPlannerService`) |
| **Executor** | Runs steps, tools, browser (`AgentService`) |
| **Critic** | Scores execution, gates completion (`CriticService`) |
| **Memory** | Working, episodic, semantic stores (`MemoryService`) |
| **Queue** | Bull on Redis: `execute-after-plan`, `process-task`, `process-step` |
| **WebSocket** | Real-time step/agent events (`AgentGateway`) |

### Task lifecycle

```
CREATE → PLANNING → PLANNED → RUNNING → COMPLETED | FAILED
```

### Queue jobs

| Job | Handler | Purpose |
|-----|---------|---------|
| `execute-after-plan` | `TasksProcessor` | Start execution after plan |
| `process-task` | `ExecutionTaskWorker` | Full agent cycle (executor + critic) |
| `process-step` | `ExecutionStepWorker` | Single step + retry |

## 2. Folder structure

See repository root `apps/backend`, `apps/frontend`, `apps/worker`, `packages/shared-types`, `infra/`, `docker-compose.yml`.

## 3. Run locally

```bash
cp .env.example .env
cp apps/frontend/.env.example apps/frontend/.env.local

docker compose up -d postgres redis

cd apps/backend
npm install
npx prisma generate
npx prisma db push   # or migrate dev
npx ts-node prisma/seed.ts
npm run start:dev

cd apps/frontend
npm install
npm run dev
```

Demo user: `demo@omnitask.ai` / `demo12345`

## 4. Docker (full stack)

```bash
cp .env.example .env
# Set JWT_SECRET to a secure 32+ char string

docker compose up --build
```

- API: http://localhost:4000/api  
- UI: http://localhost:3000  
- Health: http://localhost:4000/api/health  

## 5. API reference

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/auth/register` | No |
| POST | `/api/auth/login` | No |
| GET | `/api/auth/profile` | JWT |
| GET/POST | `/api/tasks` | JWT |
| POST | `/api/tasks/:id/execute` | JWT |
| GET | `/api/executions/:id` | JWT |
| GET | `/api/health` | No |

## 6. WebSocket

```ts
import { io } from 'socket.io-client';
const socket = io('http://localhost:4000', { auth: { userId: 'USER_ID' } });
socket.on('agent:step:result', console.log);
```

Events: `agent:started`, `agent:step:start`, `agent:step:result`, `agent:step:error`, `agent:completed`, `agent:error`, `agent:selfheal`, `task:execution:started`.

## 7. Removed / legacy

- `apps/backend/src/modules/*` monolith agents  
- Duplicate `task.worker.ts`, `execution/processors/task.processor.ts`  
- BullMQ mismatch in tasks service  
- Mock analytics (`mockData.ts`, `apiClient.ts`, `useDashboard.ts`, legacy `components/dashboards/*`)  

## 8. Production checklist

- [ ] Set `JWT_SECRET`, `DATABASE_URL`, Redis host  
- [ ] Run `prisma migrate deploy`  
- [ ] Configure `OPENAI_API_KEY` for real planner (optional; mock planner works)  
- [ ] Put API behind TLS reverse proxy  
- [ ] Scale API replicas; workers share Redis queue  
- [ ] Enable Redis persistence for queue durability  
