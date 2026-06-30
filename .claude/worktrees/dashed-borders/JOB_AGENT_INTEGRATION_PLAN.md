# Job Agent Integration — Reconciled Plan

> Status: **Plan for approval. No code written yet.**
> Supersedes the pasted "Advanced Autonomous Job Agent Integration Plan" where it conflicts with what already exists on disk.

## Context

**Goal:** Make the existing standalone Python job-application agent
(`apps/browser-py/agents/job_agent`) run *inside* OmniTask so the Next.js dashboard
can launch it, watch a live view of the browser, approve each submission, and see
results — with **no external LLM API** (already true: matching is rule-based).

**Why this differs from the pasted plan:** the pasted plan assumes a greenfield build
(new stdio bridge, new `agent_controller.py`, new screenshot loop, new Prisma models,
local-LLM revival). In reality ~70% of that already exists in a *better* form. Two
decisions (confirmed with the user) anchor this plan:

1. **Transport = the existing Redis bridge**, not a new stdio protocol.
2. **Intervention v1 = headful browser + approval gate**, not in-canvas remote control.

So the actual work is small and surgical: the `job_agent` is **standalone** today
(`JobAgentOrchestrator(config_path)` launches its own browser and only logs). We make it
run as a **skill** under the existing `executor.py`, sharing the page + streamer + event
publisher that already power the live view.

---

## What already exists (reuse — do NOT rebuild)

| Capability | Where it lives | Reuse as-is |
| --- | --- | --- |
| Node→Python job dispatch | `apps/backend/src/agent/runtime/python-bridge.service.ts` (LPUSH `omnitask:py:jobs`) + `worker-dispatcher.service.ts` | ✅ |
| Python job consumer | `apps/browser-py/main.py` (BRPOP) → `executor.py` (skill routing) | ✅ (add a skill) |
| Live screenshot stream | `apps/browser-py/streamer.py` (CDP screencast → `screenshot:frame`) | ✅ |
| Python→Node events + approval/healing polling | `apps/browser-py/events.py` (publish `omnitask:worker:events`; poll `omnitask:approval:*`) | ✅ |
| Event relay → Socket.IO | `apps/backend/src/websocket/worker-event-relay.service.ts` (`/agent` ns) | ✅ (+1 handler) |
| Gateway + approval round-trip | `apps/backend/src/websocket/agent.gateway.ts` (`approval:respond` → Redis key) | ✅ |
| Live view UI | `apps/frontend/src/components/execution/LiveBrowserView.tsx` (canvas, `screenshot:frame`) | ✅ render-only |
| Approval UI | `apps/frontend/src/components/execution/ApprovalPanel.tsx` (`approval:requested`) | ✅ |
| Session/event hook | `apps/frontend/src/hooks/useAgentSession.ts` (stable-deps subscription) | ✅ |
| Job decision logic | `apps/backend/src/job/*` (score, dedupe, prefs, tracker) | ✅ |
| Rule-based matching (zero API) | `apps/browser-py/agents/job_agent/src/agent/llm_client.py` | ✅ already local |
| Prisma models | `JobApplication` (unique `userId_portal_externalJobId`), `JobPreference`, `ExecutionSession`, `Task`, `ApprovalRequest`, `Screenshot` | ✅ **no migration needed** |

**Explicitly dropped from the pasted plan:** new stdio protocol, `agent_controller.py`,
new `job-agent` NestJS module, new `screenshot` loop, `AgentSession` Prisma model,
coordinate→selector remote control, local-LLM revival for matching (already rule-based).

---

## The gap to close

`JobAgentOrchestrator` (`.../job_agent/src/agent/orchestrator.py`):
- `__init__(config_path)` loads YAML + **creates its own `PlaywrightClient`** in `run()`.
- Portals (`src/portals/base_portal.py`, `linkedin.py`, …) drive that owned browser.
- It **only logs + writes a local SQLite db**; emits nothing to Redis.

We need it to: accept an **injected page + event publisher + preferences**, stream through
the shared CDP screencast, **request approval before each submit**, and **emit a structured
`application_result`** per job.

---

## Implementation

### Phase 1 — Run job_agent as a skill (the core deliverable)

**A. Python: adapter skill** — `apps/browser-py/skills/job_application.py` (new, thin)
- Entry point invoked by `executor.py` when `job.skill == "job_application"`.
- Receives the already-launched `page`, the `EventPublisher`, and `job.config.preferences`.
- Constructs the orchestrator in "injected" mode and runs it.

**B. Python: orchestrator/portals accept an injected page** — edit
`.../job_agent/src/agent/orchestrator.py`, `src/portals/base_portal.py`, `src/browser/playwright_client.py`
- Add an injected-page path: when a `page`/`context` is supplied, **skip `PlaywrightClient.start()`** and use the shared page (keeps the streamer's CDP session attached → live view works).
- Thread an `emit(event, data)` callback (the `EventPublisher`) into `base_portal`:
  - `log` lines → `log` events.
  - per job → `application_result` event `{ portal, externalJobId, title, company, location, url, score, matchReasons, status }`.
- Keep the local SQLite db write (harmless) but the **source of truth becomes the emitted event**.

**C. Python: approval before submit** — edit `src/portals/base_portal.py` (`apply_to_job`)
- Before the final submit click, call the existing approval mechanism in `events.py`
  (request `approval:required` with a `stepIndex`, then poll `omnitask:approval:{sessionId}:{stepIndex}`).
- Respect a **dry-run safety flag** (`JOB_AGENT_DRY_RUN`, default `true`): run the full flow + approval but **stop before the real submit** until explicitly flipped. (Mirrors the prior `WORKFLOW_DRY_RUN` convention.)
- A denied/expired approval is **non-fatal**: record `SKIPPED`, continue to next job.

**D. Python: register the skill** — edit `apps/browser-py/executor.py`
- In the existing skill-routing branch (`job.get("skill")`), add `"job_application" → skills.job_application.run(page, publisher, config)`.

**E. Backend: launch endpoint** — edit `apps/backend/src/job/job.controller.ts` + `job-agent.service.ts`
- `POST /job/launch`: load prefs via `JobPreferenceService`, create a `Task` + `ExecutionSession`,
  then dispatch via the existing `PythonBridgeService.dispatch({ sessionId, userId, skill: "job_application", config: { headless: false, preferences } })`.
- Return `{ sessionId }` for the frontend to join. Reuse `WorkerDispatcher` heartbeat check (falls back gracefully if Python worker is down).

**F. Backend: persist results** — edit `apps/backend/src/websocket/worker-event-relay.service.ts`
- Add an `application_result` handler that upserts `JobApplication` (unique `userId_portal_externalJobId`),
  reusing `JobTrackerService`. (`agent:result` already persists to the Digital Twin; this adds the typed row.)
- All other events (`screenshot:frame`, `log`, `approval:required`, `execution:completed`) already relay unchanged.

**G. Frontend: launch + watch UI** — `apps/frontend/src/app/(dashboard)/jobs/page.tsx` (new) + `services/job.service.ts`
- Add `launchJobAgent()` → `POST /job/launch`; on `{ sessionId }`, bind `useAgentSession(sessionId)`.
- Compose existing pieces: `LiveBrowserView` (live frames) + `ApprovalPanel` (per-submit gate) +
  an applications table from `job.service.getJobApplications()` / the `application:result` stream.
- A small preferences form (roles, portals, max applications, min score) writing through the existing `PUT /job/preferences`.

### Phase 2 — Optional local AI (only if wanted later)
- `llm_client.py` already has stubs for cover letters / question answering → wire to **Ollama** (`http://localhost:11434`) behind a feature flag.
- Optional: upgrade rule-based scoring with a local `sentence-transformers` BERT model. Not required for v1.

### Out of scope for v1 (revisit later)
- In-canvas click/type remote control (coordinate→selector). v1 uses the **headful Chrome window** for manual login / CAPTCHA / field fixes.
- Indeed/Wellfound portal coverage beyond what `job_agent` already supports.
- k8s/Helm packaging.

---

## Files touched (summary)

**Python (new):** `apps/browser-py/skills/job_application.py`
**Python (edit):** `apps/browser-py/executor.py`; `agents/job_agent/src/agent/orchestrator.py`; `agents/job_agent/src/portals/base_portal.py` (+ per-portal submit sites as needed); `agents/job_agent/src/browser/playwright_client.py`; `agents/job_agent/src/agent/llm_client.py` *(Phase 2 only)*
**Backend (edit):** `apps/backend/src/job/job.controller.ts`; `job-agent.service.ts`; `apps/backend/src/websocket/worker-event-relay.service.ts`
**Frontend (new/edit):** `apps/frontend/src/app/(dashboard)/jobs/page.tsx`; `apps/frontend/src/services/job.service.ts` *(reuses `LiveBrowserView`, `ApprovalPanel`, `useAgentSession` unchanged)*
**Prisma:** none (models already present).

---

## Verification (end to end)

1. **Infra up first** (per project memory — "slow" = infra down):
   `docker compose up -d postgres redis` → `pnpm db:push` → `npx playwright install chromium`.
2. Start backend + frontend (`pnpm dev`) and the Python worker (`apps/browser-py/main.py` in its venv).
3. Confirm the Python worker heartbeat: Redis key `omnitask:py:alive` present; backend `WorkerDispatcher.isAlive()` true.
4. In the dashboard `/jobs` page, set preferences, click **Launch**. Expect:
   - a visible **headful Chrome** window opens;
   - `LiveBrowserView` shows `screenshot:frame` frames;
   - per job, `ApprovalPanel` raises a submit approval (`approval:requested`).
5. With `JOB_AGENT_DRY_RUN=true`: approve a job → flow stops *before* real submit, row recorded as `MATCHED`/`PENDING_APPROVAL`. Flip to `false` for one real submit on a throwaway account → `JobApplication` row becomes `APPLIED`; appears in the applications table and `GET /job/applications`.
6. Deny a job → recorded `SKIPPED`, agent continues. Reach `max_applications` → `execution:completed`, Task `COMPLETED`.

**Safety rails:** dry-run default on; headful so a human can intervene; approval gate before every submit; dedupe via the `JobApplication` unique constraint prevents re-applying.

---

## Open follow-ups (not blocking)
- Decide the long-term direction vs. the recorded "deterministic zero-AI TS worker" pivot (that work is **not in this checkout**). This plan follows the Python+LLM direction you chose; the TS worker stays a possible future re-merge.
