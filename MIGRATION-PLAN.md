# Backend migration plan: NestJS → Express + Inversify, domain logic → browser-py

Tracks the ongoing, multi-session replacement of `apps/backend`'s NestJS
framework with a plain Express + Inversify stack (models / routes / repos /
services, bound through an explicit container), and the removal of
domain-agent logic that duplicates `apps/browser-py`'s Playwright agents —
moved into Python with direct Postgres access instead of an HTTP round-trip
back to Node. Version A ("Prepare & Confirm" — ConfirmationGate pipeline
stage + vertical agents) is out of scope until this restructuring lands.

## Status

| Track | Module | Status |
|---|---|---|
| A (Express+Inversify) | `feedback/` | ✅ Done — pilot, establishes the pattern |
| B (→ browser-py) | `media/` | ✅ Done — pilot, establishes the pattern |
| A | `ab-testing/` | ✅ Done — Wave 1 (true leaf, zero deps) |
| A | `users/` | ✅ Done — Wave 1 (dropped dead CacheService; added `requireRole`) |
| A | `files/` | ✅ Done — Wave 1 (multipart via multer; BigInt→string) |
| B | `travel/` | ✅ Done — Wave 2 (12 pytest + backend tsc + live-DB insert round-trip, DB left clean) |
| B | `social/` | ✅ Done — Wave 2 (13 pytest + backend tsc + live create→schedule→publish→list round-trip, DB left clean) |
| B | `job/` | ✅ Done — Wave 3 (19 pytest + backend tsc + live round-trip: reconciled prefs, JobApplication dedupe, Task+ExecutionSession txn + cancel; **preferences reconciled** to real columns + metadata jsonb; **bridge** = LPUSH to existing executor loop via bridge.py) |
| B | `shopping/` | ✅ Done — Wave 3 (17 pytest + backend tsc + live round-trip: reconciled prefs, TrackedProduct upsert + priceHistory jsonb, observe-price drop detection; **preferences reconciled** — preferredBrands→brands, maxPrice→maxBudget, rest→metadata jsonb) |
| A | everything else below | Not started |
| B | `food`, `email`, `calendar` | Not started (see per-domain design notes below) |

**Verified live via `pnpm stack`:** all six ported domains (`media`, `travel`,
`social`, `job`, `shopping` + the `feedback` Track-A one) serve through the Node
reverse-proxy → browser-py FastAPI → asyncpg → live Postgres, returning 200 with
real data when authed. The `.venv` (Python 3.13) at repo root — which `dev.mjs`
prefers — must have the full `requirements.txt` (installed via `uv pip install`);
system Python is separate.

**Schema-drift warning (discovered in Wave 2).** `schema.prisma` is out of sync
with what several tables actually have in Postgres — always check the migration
SQL and/or query `information_schema.columns` on the live DB before writing an
asyncpg port. Confirmed cases:
- `ShoppingPreference` — 4-way drift (like job): live cols are `categories/
  brands/maxBudget/currency/autoApprove/metadata`; the service wrote
  `mustHaveFeatures/minScore/autoBuyLimit` etc. (nonexistent → 500). **Reconciled
  & done** (Wave 3): API follows the frontend `ShoppingPreference`; maps
  `preferredBrands`→`brands`, `maxPrice`→`maxBudget`, packs the rest into
  `metadata` jsonb. TrackedProduct half ported faithfully.
- `TravelBooking` — live table (per migration) has `travelers`, `currency`,
  `sessionId` and `budget INTEGER` that `schema.prisma` omits/disagrees on. All
  extras are defaulted/nullable so the port omits them; `budget` is passed as an
  int (accepted by both int4 and float8). `type`/`status` are Postgres enums —
  raw string labels (`FLIGHT`, `FOUND`, `BOOKED`…) insert fine. **Verified via a
  live insert:** the migration's `CREATE TYPE TravelBookingType` listed `PACKAGE`
  but the *live* enum is `FLIGHT/HOTEL/ITINERARY` only (a later alter dropped it),
  so a `PACKAGE` booking 500s at the DB. The port keeps `PACKAGE` in the request
  Literal (faithful to the Node DTO, which 500s identically) — a pre-existing
  UI/DB mismatch, not introduced here. **Lesson: always confirm against the live
  DB, not the migration SQL — both `schema.prisma` and old migrations can lie.**
- `JobPreference` — a FOUR-way mismatch (DTO ≠ service-input ≠ written-columns ≠
  live-columns); its get/save was non-functional (wrote nonexistent columns →
  500). **Reconciled** (option A): the API shape follows the frontend contract
  (`services/job.service.ts`), mapped onto real columns (`dailyLimit`→`maxDailyApps`)
  with `minScore`/keywords/`remoteOnly` packed into the real `metadata` jsonb.
  The launch DTO had the same rot (Zod stripped the frontend's fields) — the port
  accepts the frontend `LaunchJobAgentInput` instead.

## Reusable patterns established by `job` (Wave 3) — for food/email/calendar

- **Bridge (`apps/browser-py/bridge.py`)** — Python equivalent of the Node
  `PythonBridgeService`: `dispatch_job` LPUSHes to `omnitask:py:jobs` (the SAME
  list `main.py` BRPOPs → `executor.run_job` — no executor changes), `cancel_job`
  sets `omnitask:job:cancel:<sid>` EX 600, `is_engine_alive` reads `PY_ALIVE_KEY`.
  Any domain that launches an autonomous run creates the `Task`+`ExecutionSession`
  rows (asyncpg, one txn via `create_job_run`-style helper) then `dispatch_job`.
- **Multipart uploads** — FastAPI `UploadFile = File(...)`; needs `python-multipart`
  (added to requirements). Patch the module-level dest dir in tests (`tmp_path`).
- **JS-faithful math** — use `math.floor(x + 0.5)` for `Math.round` (Python's
  `round` is banker's rounding and will diverge on `.5` cases).
- **Reconciliation rule** — when a domain's schema drifts, follow the **frontend
  service contract** as the API shape and map onto real columns + `metadata` jsonb.

**Dependency audit (2026-07) refuted several earlier assumptions** — see the
corrected ordering below. Only `ab-testing`, `users`, `files` were genuinely
safe Track A leaves; the domain modules the old list called "leaves" are
actually Track B targets (they move to Python, not restructured in place).

## Track A pattern (established by `feedback/`)

Per module:
- `<module>/<module>.model.ts` — types + Zod schemas
- `<module>/<module>.repository.ts` — `@injectable()`, wraps Prisma calls
- `<module>/<module>.service.ts` — `@injectable()`, constructor-injects the repo via `@inject(TYPES.X)`
- `<module>/<module>.routes.ts` — Express `Router`, uses `core/http/auth.middleware.ts` + `core/http/validation.middleware.ts`
- `<module>/container.module.ts` — binds repo/service into the shared container
- Delete the old `*.controller.ts` / `*.module.ts`
- Mount in `main.ts`: `app.use('/api/<module>', build<Module>Router())`, after `await bootstrapContainer()`
- Remove the module from `app.module.ts`'s imports

Shared scaffolding (already built, reuse as-is): `core/container.ts`,
`core/container-bootstrap.ts`, `core/http/auth.middleware.ts`,
`core/http/error.middleware.ts`, `core/http/validation.middleware.ts`,
`core/db/prisma.ts`.

**Gotchas (accumulated across conversions):**
- *Inversify 7.x:* `ContainerModule`'s callback takes an options object, not a
  bare `bind` — `({ bind }) => {...}`. `container.load(...)` is `async`.
- *Express 5 params:* `req.params.id` widens to `string | string[]` under
  `@types/express` ^5 — cast `req.params.id as string` at `:id` handlers.
- *Role gating:* use `core/http/roles.middleware.ts` `requireRole(...roles)`
  (added in Wave 1) as route middleware after `authMiddleware`, replacing
  `RolesGuard` + `@Roles()`.
- *Multipart:* `@types/multer` isn't installed — `const multer = require('multer')`
  (typed `any` via `@types/node`), `multer.memoryStorage()`, `upload.single('file')`;
  re-type `req.file` at the service boundary. Avoids a dep install and keeps tsc green.
- *BigInt columns:* `res.json()` throws on `BigInt`. Serialize BigInt fields to
  string in the repository on the way out (e.g. `files` `sizeBytes`).
- *Dead infra deps:* verify a module actually uses an injected infra service
  before recreating it — `users`' `CacheService` was dead (cached an unrouted
  `findOne`; `del()` calls were no-ops), so it was dropped, not bridged. When a
  module genuinely needs Nest infra (cache/llm/queue), bridge the Nest singleton
  into the container via `container.bind(TYPES.X).toConstantValue(app.get(X))` in
  `main.ts` rather than reconstructing it. (Not yet needed as of Wave 1.)

**Remaining Track A modules** (dependency-verified ordering — leaves that are
NOT Track B domains and NOT depended-upon hubs): none remain that are *both*
safe-leaf *and* Track A — the next Track A work involves depended-upon modules
and must be sequenced: `audit` is injected by `admin`/`billing`/`gdpr`/`auth`/
`teams` (migrate together); `vault`→`email`; `places`→`food`; then `tasks`
(pulls `planning`/`execution`/`agent`/`websocket`); `auth` (passport strategies,
global guards); `websocket`/`event-bus` (Socket.IO, high blast radius); the
`forwardRef`-coupled `agent` ⇄ `websocket` ⇄ `execution` ⇄ `runtime` core last.
Delete the dead empty `agent/orchestration` module rather than migrating it.

## Track B pattern (established by `media/`)

Per domain:
- `apps/browser-py/domains/<domain>.py` — Pydantic models + FastAPI `APIRouter`, `prefix="/<domain>"`, `Depends(require_user)` for auth
- `apps/browser-py/db/session_db.py` (shared, growing file) — `asyncpg` queries against the SAME Prisma-owned tables, `userId`-scoped, client-side `uuid4()` ids to match Prisma's `@default(uuid())`
- Register the router in `http_api/app.py`'s `create_app()`
- Delete the old `apps/backend/src/<domain>/` entirely, remove its module from `app.module.ts`
- Add a reverse-proxy mount in `apps/backend/src/main.ts`: `app.use('/api/<domain>', createProxyMiddleware({ target: PYTHON_AGENT_URL, changeOrigin: true, pathRewrite: { '^/': '/<domain>/' } }))` — mounted **before** `express.json()`/`express.urlencoded()` so the request stream reaches the proxy unconsumed

**Gotcha (Express mount stripping):** `app.use('/api/media', proxyMiddleware)`
strips the `/api/media` prefix from `req.url` before the middleware runs.
`pathRewrite: { '^/api/media': '/media' }` looks correct but never matches —
the path the middleware actually sees is already `/search?...`. Use
`{ '^/': '/media/' }` instead. Verified by hand with a standalone Express +
http-proxy-middleware script pointed at a running `http_api` instance before
trusting it in `main.ts`.

**Env sharing:** browser-py's `_load_env()` in `main.py` now also pulls
`DATABASE_URL` and `JWT_SECRET` from `apps/backend/.env` (same override tier
as the existing `REDIS_*` pull) — Python must use the backend's actual
values, not independently configured ones, since it's reading the same
database and verifying the same JWTs.

**Remaining Track B domains**: `food`, `shopping`, `travel`, `social`,
`email`, `calendar`, `job` (largest — resume parsing, match scoring,
application tracking). `booking` and `finance` need no backend deletion step —
no backend module exists for them today; Python already fully owns them.
`digital-twin` and `learning` have no browser-py counterpart in CLAUDE.md's
domain-agent list — leave them in the Node backend unless told otherwise.

## Verification checklist per module/domain

- Track A: `cd apps/backend && npx tsc --noEmit` (zero errors) + `npx jest --testPathPattern="<module>"`
- Track B: `cd apps/browser-py && python -m pytest tests/test_<domain>_routes.py`, plus a manual proxy check — boot `http_api` standalone on a scratch port, hit it directly, then hit it through a throwaway Express+http-proxy-middleware script before touching the real `main.ts` wiring
- Never run ad-hoc writes against the real dev/shared Postgres beyond what's needed to prove the wiring — prefer read-only checks (`find_user_by_id`-style lookups) and mocked pytest fixtures first
