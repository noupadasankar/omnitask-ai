"""Direct Postgres access for browser-py domains ported off the Node backend.

Talks to the SAME tables the NestJS Prisma schema owns (apps/backend/prisma/
schema.prisma) — the schema stays Prisma-authored (migrations run from Node
only, per CLAUDE.md's pgvector-drift precedent). This module only reads and
writes rows; it never runs a migration.

IDs are generated client-side with uuid4(), mirroring Prisma's `@default(uuid())`
behavior (Prisma generates UUIDs in the calling process, not via a DB function),
so rows created from here are indistinguishable from rows Prisma would create.
"""

import json
import math
import os
import uuid
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import parse_qs, urlparse

import asyncpg

_pool: Optional[asyncpg.Pool] = None


async def _init_connection(conn: asyncpg.Connection) -> None:
    """Make JSON/JSONB columns (e.g. TravelBooking.results / selectedOption)
    encode from and decode to native Python objects, so callers pass and receive
    dict|list exactly like Prisma's `Json` fields — not raw JSON strings."""
    for typename in ("json", "jsonb"):
        await conn.set_type_codec(
            typename, encoder=json.dumps, decoder=json.loads, schema="pg_catalog"
        )


def _database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not set — required for direct Postgres access")
    return url


def _dsn_without_sslmode(url: str) -> str:
    # asyncpg's connect()/create_pool() don't understand Prisma's `sslmode`
    # query param — strip it from the DSN and pass SSL via the `ssl` kwarg
    # instead, same split apps/backend/src/core/db/prisma.ts does for pg.Pool.
    parsed = urlparse(url)
    if not parsed.query:
        return url
    query = parse_qs(parsed.query)
    if "sslmode" not in query:
        return url
    return parsed._replace(query="").geturl()


def _ssl_required(url: str) -> bool:
    return "sslmode" in parse_qs(urlparse(url).query)


async def get_pool() -> asyncpg.Pool:
    """Lazily-constructed singleton connection pool, mirroring the Node side's
    lazily-constructed singleton PrismaClient (core/db/prisma.ts)."""
    global _pool
    if _pool is None:
        url = _database_url()
        _pool = await asyncpg.create_pool(
            dsn=_dsn_without_sslmode(url),
            ssl="require" if _ssl_required(url) else None,
            min_size=1,
            max_size=10,
            init=_init_connection,
        )
    return _pool


async def find_user_by_id(user_id: str) -> Optional[dict]:
    if not user_id:
        return None
    pool = await get_pool()
    row = await pool.fetchrow(
        'SELECT id, email, role FROM "User" WHERE id = $1 LIMIT 1', user_id
    )
    return dict(row) if row else None


async def create_media_session(
    user_id: str,
    provider: str,
    action: str,
    track_id: Optional[str],
    status: str = "completed",
) -> dict:
    pool = await get_pool()
    row = await pool.fetchrow(
        '''
        INSERT INTO "MediaSession" (id, "userId", provider, action, "trackId", status, "createdAt")
        VALUES ($1, $2, $3, $4, $5, $6, now())
        RETURNING id, "userId", provider, action, "trackId", status, "createdAt"
        ''',
        str(uuid.uuid4()),
        user_id,
        provider,
        action,
        track_id,
        status,
    )
    return dict(row)


async def find_media_history(user_id: str, limit: int = 20) -> list[dict]:
    pool = await get_pool()
    rows = await pool.fetch(
        '''
        SELECT id, "userId", provider, action, "trackId", status, "createdAt"
        FROM "MediaSession"
        WHERE "userId" = $1
        ORDER BY "createdAt" DESC
        LIMIT $2
        ''',
        user_id,
        limit,
    )
    return [dict(r) for r in rows]


# ── TravelBooking (domains/travel.py) ────────────────────────────────────────
# The live table carries a few columns schema.prisma doesn't list (travelers,
# currency, sessionId) — all defaulted/nullable, so we omit them and let the DB
# fill defaults. `budget` is passed as an int: the creating migration typed the
# column INTEGER, and an int is accepted by both an int4 and a float8 column, so
# this is safe regardless of any later ALTER. results/selectedOption round-trip
# as native Python objects via the JSON codec registered in _init_connection.

_TRAVEL_COLUMNS = (
    'id, "userId", type, origin, destination, "departDate", "returnDate", '
    'budget, status, results, "selectedOption", "createdAt"'
)


async def create_travel_booking(
    user_id: str,
    booking_type: str,
    *,
    origin: Optional[str] = None,
    destination: Optional[str] = None,
    depart_date: Optional[datetime] = None,
    return_date: Optional[datetime] = None,
    budget: Optional[int] = None,
    status: str = "FOUND",
    results: Optional[object] = None,
    selected_option: Optional[object] = None,
) -> dict:
    pool = await get_pool()
    row = await pool.fetchrow(
        f'''
        INSERT INTO "TravelBooking"
          (id, "userId", type, origin, destination, "departDate", "returnDate",
           budget, status, results, "selectedOption", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), now())
        RETURNING {_TRAVEL_COLUMNS}
        ''',
        str(uuid.uuid4()),
        user_id,
        booking_type,
        origin,
        destination,
        depart_date,
        return_date,
        budget,
        status,
        results,
        selected_option,
    )
    return dict(row)


async def list_travel_bookings(
    user_id: str, take: int, cursor_id: Optional[str] = None
) -> list[dict]:
    """Keyset page of a user's bookings, newest first. `cursor_id` is the id of
    the last row from the previous page; rows older than its createdAt follow.
    Mirrors the Node service's Prisma cursor pagination (orderBy createdAt desc).
    """
    pool = await get_pool()
    if cursor_id:
        rows = await pool.fetch(
            f'''
            SELECT {_TRAVEL_COLUMNS}
            FROM "TravelBooking"
            WHERE "userId" = $1
              AND "createdAt" < (SELECT "createdAt" FROM "TravelBooking" WHERE id = $2)
            ORDER BY "createdAt" DESC
            LIMIT $3
            ''',
            user_id,
            cursor_id,
            take,
        )
    else:
        rows = await pool.fetch(
            f'''
            SELECT {_TRAVEL_COLUMNS}
            FROM "TravelBooking"
            WHERE "userId" = $1
            ORDER BY "createdAt" DESC
            LIMIT $2
            ''',
            user_id,
            take,
        )
    return [dict(r) for r in rows]


# ── SocialPost (domains/social.py) ───────────────────────────────────────────
# SocialPost's live schema matches schema.prisma (verified). status is the
# SocialPostStatus enum (DRAFT/SCHEDULED/PUBLISHED/FAILED) — asyncpg accepts the
# string labels. updatedAt is NOT NULL with no DB default (Prisma @updatedAt), so
# every write sets it to now() explicitly.

_SOCIAL_COLUMNS = (
    'id, "userId", platform, content, status, "scheduledAt", "publishedAt", '
    '"sessionId", likes, shares, comments, views, "createdAt"'
)


async def create_social_post(
    user_id: str, platform: str, content: str, status: str = "DRAFT"
) -> dict:
    pool = await get_pool()
    row = await pool.fetchrow(
        f'''
        INSERT INTO "SocialPost" (id, "userId", platform, content, status, "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, now(), now())
        RETURNING {_SOCIAL_COLUMNS}
        ''',
        str(uuid.uuid4()),
        user_id,
        platform,
        content,
        status,
    )
    return dict(row)


async def find_social_post(user_id: str, post_id: str) -> Optional[dict]:
    pool = await get_pool()
    row = await pool.fetchrow(
        f'SELECT {_SOCIAL_COLUMNS} FROM "SocialPost" WHERE id = $1 AND "userId" = $2',
        post_id,
        user_id,
    )
    return dict(row) if row else None


async def schedule_social_post(post_id: str, scheduled_at: datetime) -> dict:
    pool = await get_pool()
    row = await pool.fetchrow(
        f'''
        UPDATE "SocialPost"
        SET status = 'SCHEDULED', "scheduledAt" = $2, "updatedAt" = now()
        WHERE id = $1
        RETURNING {_SOCIAL_COLUMNS}
        ''',
        post_id,
        scheduled_at,
    )
    return dict(row)


async def publish_social_post(
    post_id: str, session_id: str, likes: int, shares: int, comments: int, views: int
) -> dict:
    pool = await get_pool()
    row = await pool.fetchrow(
        f'''
        UPDATE "SocialPost"
        SET status = 'PUBLISHED', "publishedAt" = now(), "sessionId" = $2,
            likes = $3, shares = $4, comments = $5, views = $6, "updatedAt" = now()
        WHERE id = $1
        RETURNING {_SOCIAL_COLUMNS}
        ''',
        post_id,
        session_id,
        likes,
        shares,
        comments,
        views,
    )
    return dict(row)


async def set_social_post_status(post_id: str, status: str) -> dict:
    pool = await get_pool()
    row = await pool.fetchrow(
        f'UPDATE "SocialPost" SET status = $2, "updatedAt" = now() WHERE id = $1 '
        f'RETURNING {_SOCIAL_COLUMNS}',
        post_id,
        status,
    )
    return dict(row)


async def list_social_posts(
    user_id: str, take: int, cursor_id: Optional[str] = None, status: Optional[str] = None
) -> list[dict]:
    """Keyset page of a user's posts, newest first, optionally filtered by status.
    Column names are literals; every value is a bound parameter."""
    pool = await get_pool()
    conds = ['"userId" = $1']
    params: list = [user_id]
    if status:
        params.append(status)
        conds.append(f"status = ${len(params)}")
    if cursor_id:
        params.append(cursor_id)
        conds.append(
            f'"createdAt" < (SELECT "createdAt" FROM "SocialPost" WHERE id = ${len(params)})'
        )
    params.append(take)
    sql = (
        f'SELECT {_SOCIAL_COLUMNS} FROM "SocialPost" '
        f'WHERE {" AND ".join(conds)} ORDER BY "createdAt" DESC LIMIT ${len(params)}'
    )
    rows = await pool.fetch(sql, *params)
    return [dict(r) for r in rows]


async def fetch_social_posts_for_stats(user_id: str) -> list[dict]:
    pool = await get_pool()
    rows = await pool.fetch(
        'SELECT likes, shares, comments, views, status FROM "SocialPost" WHERE "userId" = $1',
        user_id,
    )
    return [dict(r) for r in rows]


# ── JobPreference (domains/job.py) — RECONCILED ──────────────────────────────
# The live JobPreference table is portals/roles/locations/skills/minSalary/
# maxDailyApps/metadata. The Node service (and the frontend contract) use a
# richer shape: roles/locations/requiredKeywords/preferredKeywords/
# excludeKeywords/skills/minScore/dailyLimit/remoteOnly/minSalary. We map the
# overlapping fields to real columns (dailyLimit -> maxDailyApps) and pack the
# rest (minScore, *Keywords, remoteOnly) into the real `metadata` jsonb column.
# This makes preferences actually persist (the Node save() wrote non-existent
# columns and 500'd). The API shape returned matches the frontend's JobPreference.

_JOBPREF_API_DEFAULTS = {
    "roles": [],
    "locations": [],
    "requiredKeywords": [],
    "preferredKeywords": [],
    "excludeKeywords": [],
    "skills": [],
    "minScore": 60,
    "dailyLimit": 20,
    "remoteOnly": False,
    "minSalary": None,
}


def _jobpref_row_to_api(row: dict) -> dict:
    md = row.get("metadata") or {}
    return {
        "id": row["id"],
        "userId": row["userId"],
        "roles": row.get("roles") or [],
        "locations": row.get("locations") or [],
        "skills": row.get("skills") or [],
        "requiredKeywords": md.get("requiredKeywords", []),
        "preferredKeywords": md.get("preferredKeywords", []),
        "excludeKeywords": md.get("excludeKeywords", []),
        "minScore": md.get("minScore", 60),
        "remoteOnly": md.get("remoteOnly", False),
        "dailyLimit": row["maxDailyApps"] if row.get("maxDailyApps") is not None else 20,
        "minSalary": row.get("minSalary"),
    }


async def get_job_preference(user_id: str) -> dict:
    pool = await get_pool()
    row = await pool.fetchrow(
        'SELECT id, "userId", roles, locations, skills, "minSalary", "maxDailyApps", metadata '
        'FROM "JobPreference" WHERE "userId" = $1',
        user_id,
    )
    if not row:
        return {"userId": user_id, **_JOBPREF_API_DEFAULTS}
    return _jobpref_row_to_api(dict(row))


async def upsert_job_preference(
    user_id: str,
    *,
    roles: list,
    locations: list,
    skills: list,
    min_salary: Optional[int],
    daily_limit: int,
    metadata: dict,
) -> dict:
    pool = await get_pool()
    row = await pool.fetchrow(
        '''
        INSERT INTO "JobPreference"
          (id, "userId", roles, locations, skills, "minSalary", "maxDailyApps", metadata, "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())
        ON CONFLICT ("userId") DO UPDATE SET
          roles = $3, locations = $4, skills = $5, "minSalary" = $6,
          "maxDailyApps" = $7, metadata = $8, "updatedAt" = now()
        RETURNING id, "userId", roles, locations, skills, "minSalary", "maxDailyApps", metadata
        ''',
        str(uuid.uuid4()),
        user_id,
        roles,
        locations,
        skills,
        min_salary,
        daily_limit,
        metadata,
    )
    return _jobpref_row_to_api(dict(row))


# ── JobApplication (domains/job.py) ──────────────────────────────────────────

_JOBAPP_COLUMNS = (
    'id, "userId", portal, "externalJobId", title, company, location, url, '
    'score, "matchReasons", status, "appliedAt", "createdAt"'
)


async def job_already_seen(user_id: str, portal: str, external_job_id: str) -> bool:
    pool = await get_pool()
    row = await pool.fetchrow(
        'SELECT id FROM "JobApplication" WHERE "userId" = $1 AND portal = $2 AND "externalJobId" = $3',
        user_id,
        portal,
        external_job_id,
    )
    return row is not None


async def record_job_match(
    user_id: str,
    *,
    portal: str,
    external_job_id: str,
    title: str,
    company: Optional[str],
    location: Optional[str],
    url: Optional[str],
    score: float,
    match_reasons: list,
    status: str,
) -> dict:
    pool = await get_pool()
    row = await pool.fetchrow(
        f'''
        INSERT INTO "JobApplication"
          (id, "userId", portal, "externalJobId", title, company, location, url,
           score, "matchReasons", status, "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), now())
        ON CONFLICT ("userId", portal, "externalJobId") DO UPDATE SET
          title = $5, company = $6, location = $7, url = $8, score = $9,
          "matchReasons" = $10, status = $11, "updatedAt" = now()
        RETURNING {_JOBAPP_COLUMNS}
        ''',
        str(uuid.uuid4()),
        user_id,
        portal,
        external_job_id,
        title,
        company,
        location,
        url,
        score,
        match_reasons,
        status,
    )
    return dict(row)


async def list_job_applications(
    user_id: str, status: Optional[str] = None, take: int = 100
) -> list[dict]:
    pool = await get_pool()
    if status:
        rows = await pool.fetch(
            f'SELECT {_JOBAPP_COLUMNS} FROM "JobApplication" '
            f'WHERE "userId" = $1 AND status = $2 ORDER BY "createdAt" DESC LIMIT $3',
            user_id,
            status,
            take,
        )
    else:
        rows = await pool.fetch(
            f'SELECT {_JOBAPP_COLUMNS} FROM "JobApplication" '
            f'WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT $2',
            user_id,
            take,
        )
    return [dict(r) for r in rows]


async def job_applied_today(user_id: str) -> int:
    pool = await get_pool()
    start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    row = await pool.fetchrow(
        'SELECT count(*) AS c FROM "JobApplication" '
        'WHERE "userId" = $1 AND status = \'APPLIED\' AND "appliedAt" >= $2',
        user_id,
        start,
    )
    return int(row["c"])


async def job_stats(user_id: str) -> dict:
    pool = await get_pool()
    rows = await pool.fetch(
        'SELECT status, count(*) AS c FROM "JobApplication" WHERE "userId" = $1 GROUP BY status',
        user_id,
    )
    counts = {r["status"]: int(r["c"]) for r in rows}
    return {
        "matched": counts.get("MATCHED", 0),
        "skipped": counts.get("SKIPPED", 0),
        "pendingApproval": counts.get("PENDING_APPROVAL", 0),
        "applied": counts.get("APPLIED", 0),
        "failed": counts.get("FAILED", 0),
        "appliedToday": await job_applied_today(user_id),
    }


# ── Task + ExecutionSession (job launch/stop) ────────────────────────────────
# launch() creates the orchestration rows the worker-event relay expects, then
# the domain LPUSHes the job (see bridge.py). Only the required columns are set;
# everything else takes its DB default. Both rows in one transaction.

async def create_job_run(user_id: str, *, goal: str, metadata: dict) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            task = await conn.fetchrow(
                '''
                INSERT INTO "Task"
                  (id, "userId", title, "naturalLanguage", status, trigger, "agentType", "startedAt", "createdAt", "updatedAt")
                VALUES ($1, $2, 'Job Application Agent', $3, 'RUNNING', 'SKILL', 'job_application', now(), now(), now())
                RETURNING id
                ''',
                str(uuid.uuid4()),
                user_id,
                goal,
            )
            session = await conn.fetchrow(
                '''
                INSERT INTO "ExecutionSession"
                  (id, "taskId", "userId", status, metadata, "createdAt", "updatedAt")
                VALUES ($1, $2, $3, 'RUNNING', $4, now(), now())
                RETURNING id
                ''',
                str(uuid.uuid4()),
                task["id"],
                user_id,
                metadata,
            )
    return {"taskId": task["id"], "sessionId": session["id"]}


async def find_execution_session(user_id: str, session_id: str) -> Optional[dict]:
    pool = await get_pool()
    row = await pool.fetchrow(
        'SELECT id, "taskId" FROM "ExecutionSession" WHERE id = $1 AND "userId" = $2',
        session_id,
        user_id,
    )
    return dict(row) if row else None


async def mark_job_cancelled(session_id: str, task_id: str) -> None:
    pool = await get_pool()
    await pool.execute(
        'UPDATE "ExecutionSession" SET status = \'CANCELLED\', "completedAt" = now(), "updatedAt" = now() WHERE id = $1',
        session_id,
    )
    await pool.execute(
        'UPDATE "Task" SET status = \'CANCELLED\', "completedAt" = now(), "updatedAt" = now() WHERE id = $1',
        task_id,
    )


# ── ShoppingPreference (domains/shopping.py) — RECONCILED ────────────────────
# Live cols: categories/brands text[], maxBudget float8, currency, autoApprove,
# metadata jsonb. The frontend/service shape has more fields; map preferredBrands
# -> brands, maxPrice -> maxBudget, and pack mustHaveFeatures/avoidKeywords/
# minRating/minScore/autoBuyLimit into metadata jsonb. API shape follows the
# frontend ShoppingPreference contract. (The Node save() wrote nonexistent
# columns and 500'd.)

_SHOPPREF_API_DEFAULTS = {
    "categories": [],
    "mustHaveFeatures": [],
    "avoidKeywords": [],
    "preferredBrands": [],
    "maxPrice": None,
    "minRating": 4.0,
    "minScore": 60,
    "autoBuyLimit": 0,
}


def _shoppref_row_to_api(row: dict) -> dict:
    md = row.get("metadata") or {}
    return {
        "id": row["id"],
        "userId": row["userId"],
        "categories": row.get("categories") or [],
        "preferredBrands": row.get("brands") or [],
        "maxPrice": row.get("maxBudget"),
        "mustHaveFeatures": md.get("mustHaveFeatures", []),
        "avoidKeywords": md.get("avoidKeywords", []),
        "minRating": md.get("minRating", 4.0),
        "minScore": md.get("minScore", 60),
        "autoBuyLimit": md.get("autoBuyLimit", 0),
    }


async def get_shopping_preference(user_id: str) -> dict:
    pool = await get_pool()
    row = await pool.fetchrow(
        'SELECT id, "userId", categories, brands, "maxBudget", metadata '
        'FROM "ShoppingPreference" WHERE "userId" = $1',
        user_id,
    )
    if not row:
        return {"userId": user_id, **_SHOPPREF_API_DEFAULTS}
    return _shoppref_row_to_api(dict(row))


async def upsert_shopping_preference(
    user_id: str,
    *,
    categories: list,
    preferred_brands: list,
    max_price: Optional[float],
    metadata: dict,
) -> dict:
    pool = await get_pool()
    row = await pool.fetchrow(
        '''
        INSERT INTO "ShoppingPreference"
          (id, "userId", categories, brands, "maxBudget", metadata, "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $6, now(), now())
        ON CONFLICT ("userId") DO UPDATE SET
          categories = $3, brands = $4, "maxBudget" = $5, metadata = $6, "updatedAt" = now()
        RETURNING id, "userId", categories, brands, "maxBudget", metadata
        ''',
        str(uuid.uuid4()),
        user_id,
        categories,
        preferred_brands,
        max_price,
        metadata,
    )
    return _shoppref_row_to_api(dict(row))


# ── TrackedProduct (domains/shopping.py) ─────────────────────────────────────

_TRACKED_COLUMNS = (
    'id, "userId", site, "externalProductId", title, brand, url, currency, '
    '"lastPrice", "targetPrice", rating, score, "matchReasons", "priceHistory", '
    'status, "createdAt"'
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def shopping_already_seen(user_id: str, site: str, external_product_id: str) -> bool:
    pool = await get_pool()
    row = await pool.fetchrow(
        'SELECT id FROM "TrackedProduct" WHERE "userId" = $1 AND site = $2 AND "externalProductId" = $3',
        user_id,
        site,
        external_product_id,
    )
    return row is not None


async def record_tracked_product(
    user_id: str,
    *,
    site: str,
    external_product_id: str,
    title: str,
    brand: Optional[str],
    url: Optional[str],
    currency: Optional[str],
    price: Optional[float],
    rating: Optional[float],
    score: float,
    match_reasons: list,
    status: str,
) -> dict:
    pool = await get_pool()
    existing = await pool.fetchrow(
        'SELECT "priceHistory" FROM "TrackedProduct" '
        'WHERE "userId" = $1 AND site = $2 AND "externalProductId" = $3',
        user_id,
        site,
        external_product_id,
    )
    history = existing["priceHistory"] if existing and isinstance(existing["priceHistory"], list) else []
    if isinstance(price, (int, float)) and not isinstance(price, bool):
        history = history + [{"price": price, "at": _now_iso()}]

    row = await pool.fetchrow(
        f'''
        INSERT INTO "TrackedProduct"
          (id, "userId", site, "externalProductId", title, brand, url, currency,
           "lastPrice", rating, score, "matchReasons", "priceHistory", status, "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now(), now())
        ON CONFLICT ("userId", site, "externalProductId") DO UPDATE SET
          title = $5, brand = $6, url = $7, currency = $8,
          "lastPrice" = COALESCE($9, "TrackedProduct"."lastPrice"),
          rating = $10, score = $11, "matchReasons" = $12, "priceHistory" = $13,
          status = $14, "updatedAt" = now()
        RETURNING {_TRACKED_COLUMNS}
        ''',
        str(uuid.uuid4()),
        user_id,
        site,
        external_product_id,
        title,
        brand,
        url,
        currency or "INR",
        price,
        rating,
        score,
        match_reasons,
        history,
        status,
    )
    return dict(row)


async def set_product_target_price(tracked_id: str, target_price: float) -> dict:
    pool = await get_pool()
    row = await pool.fetchrow(
        f'UPDATE "TrackedProduct" SET "targetPrice" = $2, "updatedAt" = now() WHERE id = $1 '
        f'RETURNING {_TRACKED_COLUMNS}',
        tracked_id,
        target_price,
    )
    return dict(row)


async def observe_price(tracked_id: str, new_price: float, drop_pct: float) -> Optional[dict]:
    pool = await get_pool()
    row = await pool.fetchrow(
        'SELECT id, title, "lastPrice", "targetPrice", "priceHistory" FROM "TrackedProduct" WHERE id = $1',
        tracked_id,
    )
    if not row:
        return None
    history = row["priceHistory"] if isinstance(row["priceHistory"], list) else []
    history = history + [{"price": new_price, "at": _now_iso()}]
    await pool.execute(
        'UPDATE "TrackedProduct" SET "lastPrice" = $2, "priceHistory" = $3, "updatedAt" = now() WHERE id = $1',
        tracked_id,
        new_price,
        history,
    )
    prev = row["lastPrice"]
    hit_target = row["targetPrice"] is not None and new_price <= row["targetPrice"]
    dropped = (
        isinstance(prev, (int, float)) and prev > 0 and ((prev - new_price) / prev) * 100 >= drop_pct
    )
    if hit_target or dropped:
        return {
            "trackedId": tracked_id,
            "title": row["title"],
            "previousPrice": prev if prev is not None else new_price,
            "newPrice": new_price,
            "dropPct": math.floor(((prev - new_price) / prev) * 100 + 0.5) if prev else 0,
        }
    return None


async def list_tracked_products(
    user_id: str, status: Optional[str] = None, take: int = 100
) -> list[dict]:
    pool = await get_pool()
    if status:
        rows = await pool.fetch(
            f'SELECT {_TRACKED_COLUMNS} FROM "TrackedProduct" '
            f'WHERE "userId" = $1 AND status = $2 ORDER BY "updatedAt" DESC LIMIT $3',
            user_id,
            status,
            take,
        )
    else:
        rows = await pool.fetch(
            f'SELECT {_TRACKED_COLUMNS} FROM "TrackedProduct" '
            f'WHERE "userId" = $1 ORDER BY "updatedAt" DESC LIMIT $2',
            user_id,
            take,
        )
    return [dict(r) for r in rows]


async def shopping_stats(user_id: str) -> dict:
    pool = await get_pool()
    rows = await pool.fetch(
        'SELECT status, count(*) AS c FROM "TrackedProduct" WHERE "userId" = $1 GROUP BY status',
        user_id,
    )
    counts = {r["status"]: int(r["c"]) for r in rows}
    return {
        "matched": counts.get("MATCHED", 0),
        "skipped": counts.get("SKIPPED", 0),
        "watching": counts.get("WATCHING", 0),
        "pendingApproval": counts.get("PENDING_APPROVAL", 0),
        "purchased": counts.get("PURCHASED", 0),
        "failed": counts.get("FAILED", 0),
    }


# ── FoodOrder (domains/food.py) ──────────────────────────────────────────────
# Only the FoodOrder-backed food routes (recipe is stateless) move to Python;
# the Places-dependent routes (restaurants/availability/book) stay in Node.
# Schema is clean (matches schema.prisma): items jsonb, status text default ORDERED.

_FOODORDER_COLUMNS = 'id, "userId", platform, "restaurantName", items, "totalAmount", status, "createdAt"'


async def create_food_order(
    user_id: str, *, platform: str, restaurant_name: str, items, total_amount: float
) -> dict:
    pool = await get_pool()
    row = await pool.fetchrow(
        f'''
        INSERT INTO "FoodOrder"
          (id, "userId", platform, "restaurantName", items, "totalAmount", status, "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $6, 'ORDERED', now(), now())
        RETURNING {_FOODORDER_COLUMNS}
        ''',
        str(uuid.uuid4()),
        user_id,
        platform,
        restaurant_name,
        items,
        total_amount,
    )
    return dict(row)


async def list_food_orders(user_id: str, take: int, cursor_id: Optional[str] = None) -> list[dict]:
    pool = await get_pool()
    if cursor_id:
        rows = await pool.fetch(
            f'SELECT {_FOODORDER_COLUMNS} FROM "FoodOrder" '
            f'WHERE "userId" = $1 AND "createdAt" < (SELECT "createdAt" FROM "FoodOrder" WHERE id = $2) '
            f'ORDER BY "createdAt" DESC LIMIT $3',
            user_id,
            cursor_id,
            take,
        )
    else:
        rows = await pool.fetch(
            f'SELECT {_FOODORDER_COLUMNS} FROM "FoodOrder" '
            f'WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT $2',
            user_id,
            take,
        )
    return [dict(r) for r in rows]
