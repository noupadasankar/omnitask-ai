# OmniTask Python Browser Engine (`browser-py`)

Playwright (Python) service that drives the browser for AI-planned tasks and
streams the **live view** to the dashboard in real time. It replaces the
Node/Puppeteer worker for live execution while keeping all of the Node-side
intelligence (LLM planning, cognitive OS, self-healing, verifier).

## How it fits in

```
Dashboard ─launch─▶ NestJS API (plans the task)
                       │  BROWSER_RUNTIME=python
                       ▼
            LPUSH omnitask:py:jobs  (Redis list)
                       ▼
        ┌─────────  browser-py  ─────────┐
        │ BRPOP job → Playwright Chromium │
        │ CDP screencast → JPEG frames    │
        └─────────────────┬───────────────┘
                          │ PUBLISH omnitask:worker:events
                          ▼
        WorkerEventRelayService (NestJS) ──▶ Socket.IO ──▶ CHROMIUM SANDBOX box
                          └──▶ Prisma (session/step/screenshot status)
```

The engine speaks the **exact same Redis envelope and event names** the legacy
Node worker used, so the relay, gateway, DB writes, and frontend are unchanged.

- **Job intake:** `BRPOP omnitask:py:jobs` (plain JSON pushed by the backend).
- **Events out:** `PUBLISH omnitask:worker:events` with
  `{ sessionId, event, data, timestamp }`.
- **Liveness:** `SET omnitask:py:alive 1 EX 10` every 5s. If the backend sees no
  heartbeat it falls back to in-process Puppeteer (never abandons a task).
- **Approval / self-healing:** polls `omnitask:approval:<sid>:<idx>` and
  `omnitask:healing:<sid>:<idx>` (written by the relay).
- **Final screenshot:** captured at the end and sent in `execution:completed`
  (`finalScreenshot`); the relay persists it.

## Setup

Requires Python 3.10+.

```bash
cd apps/browser-py
python -m venv .venv && source .venv/bin/activate   # optional; on Windows: .venv\Scripts\activate
pip install -r requirements.txt
playwright install chromium
python main.py
```

Or from the repo root: `pnpm dev:browser-py`.

You should see: `Python browser engine connected (headless=True) — waiting on omnitask:py:jobs`
and `redis-cli get omnitask:py:alive` returns `1`.

## Configuration (env)

Reads `../../.env` then `apps/browser-py/.env` (same Redis as the backend):

| Var | Default | Meaning |
|-----|---------|---------|
| `REDIS_HOST` | `localhost` | Redis host (must match backend) |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | — | Redis password |
| `PLAYWRIGHT_HEADLESS` | `true` | `false` runs a visible window (needs a display / xvfb) |
| `PY_STREAM_QUALITY` | `60` | JPEG quality for the screencast frames |

On the **backend**, set `BROWSER_RUNTIME=python` (the default) to route live
execution here.

## Files

| File | Responsibility |
|------|----------------|
| `main.py` | Redis job loop, heartbeat, display detection, Playwright lifecycle |
| `executor.py` | Routes a job to a **skill** or a step plan; per-step exec, telemetry, approval, self-healing |
| `streamer.py` | CDP `Page.startScreencast` → `screenshot:frame` (interval fallback) |
| `events.py` | Redis publisher + approval/healing key polling |
| `dom.py` | Interactive-DOM extraction for the self-healing payload |
| `ai.py` | Optional OpenAI helper (extract JSON / summarize); degrades gracefully |
| `skills/` | AI automation skills (see below) |

## AI automation skills

When a job carries a `skill` hint (the backend sends one only when **no site
plugin matched** the goal), the engine runs a real domain skill instead of a
step plan. Each skill drives the live browser (search → extract → optional AI
synthesis) and streams progress as dashboard log lines.

| Skill | What it does |
|-------|--------------|
| `skills/search.py` | Real Google search (consent handling) + Bing fallback |
| `skills/extract.py` | Site-agnostic DOM extraction: search results, product/job cards, page text |
| `skills/research.py` | Search → read top sources → AI-summarized cited brief |
| `skills/shopping.py` | Marketplace search → product listings (fed to `POST /shopping/evaluate`) |
| `skills/job.py` | Portal search → job postings (fed to `POST /job/evaluate`) |
| `skills/food.py` | Restaurant/dish discovery |
| `skills/social.py` | AI post drafting (posting stays approval-gated, never autonomous) |
| `skills/generic.py` | Universal "do anything" fallback: search → extract → answer |

Skills emit structured data via an `agent:result` event and never replace the
plugin apply/checkout flows (those keep their step plans + approval gates).
Set `OPENAI_API_KEY` (and optionally `PY_LLM_MODEL`, default `gpt-4o-mini`) to
enable the AI synthesis; without it, skills fall back to pure DOM heuristics.
