"""Social domain, ported from apps/backend/src/social/ (social.service.ts +
social-post.service.ts + social-tracker.service.ts + platform-adapters/* +
dto/social.dto.ts). Same 6 endpoints and shapes, so the frontend's
services/social.service.ts (reverse-proxied at /api/social) needs no changes.

Draft generation uses the shared LLM client (ai.py) with the identical
deterministic fallback string. The LinkedIn/Twitter "adapters" were stubs that
always succeed after a 1500ms sleep — the sleep is dropped; publish still stamps
a mock external id and randomized engagement, exactly as before.
"""

import base64
import random
import string
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from ai import AIClient
from db.session_db import (
    create_social_post,
    fetch_social_posts_for_stats,
    find_social_post,
    list_social_posts,
    publish_social_post,
    schedule_social_post,
)
from http_api.auth import AuthedUser, require_user

router = APIRouter(prefix="/social", dependencies=[Depends(require_user)])


# ── Request models ───────────────────────────────────────────────────────────

def _parse_date(value: str) -> datetime:
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        pass
    try:
        return datetime.strptime(value, "%Y-%m-%d")
    except ValueError as exc:
        raise ValueError("Invalid date format") from exc


class GeneratePostBody(BaseModel):
    topic: str = Field(min_length=1, max_length=500)
    platform: str = Field(min_length=1, max_length=50)
    tone: Optional[str] = Field(default=None, max_length=50)


class SchedulePostBody(BaseModel):
    postId: str = Field(min_length=1)
    scheduledAt: str = Field(min_length=1)

    @field_validator("scheduledAt")
    @classmethod
    def _valid_scheduled_at(cls, v: str) -> str:
        _parse_date(v)
        return v


# ── Draft generation + content validation (mirrors SocialPostService) ─────────

_FALLBACK_DRAFT = (
    "Autonomous AI agents are transforming how we think about productivity. In "
    "OmniTask-AI v2.0, you can orchestrate multi-agent workflows to automate your "
    "social scheduling, job tracking, and research in minutes. What workflows will "
    "you automate next? #AI #Productivity #TypeScript"
)


async def _generate_draft(topic: str, platform: str, tone: str) -> str:
    system = "You are an expert social media copywriter. Return only the post text."
    user = (
        f"Write a social media post for {platform}.\n"
        f"Topic: {topic}\n"
        f"Tone: {tone}\n"
        "Constraints: Follow standard character limits (Twitter: 280 chars, "
        "LinkedIn: professional length). Do not use excessive hashtags. Make it engaging."
    )
    draft = await AIClient().summarize(user, system)
    return draft if draft is not None else _FALLBACK_DRAFT


def _validate_content(content: str, platform: str) -> dict:
    if not content:
        return {"valid": False, "reason": "Content cannot be empty"}
    if platform == "twitter" and len(content) > 280:
        return {"valid": False, "reason": "Twitter post exceeds 280 characters"}
    if platform == "linkedin" and len(content) > 3000:
        return {"valid": False, "reason": "LinkedIn post exceeds 3000 characters"}
    return {"valid": True}


def _rand_b36(n: int) -> str:
    return "".join(random.choices(string.digits + string.ascii_lowercase, k=n))


# ── Analytics + trends (mirrors SocialTrackerService — stubbed follower data) ─

async def _track_stats(user_id: str) -> dict:
    posts = await fetch_social_posts_for_stats(user_id)
    total_likes = sum(p["likes"] for p in posts)
    total_shares = sum(p["shares"] for p in posts)
    total_comments = sum(p["comments"] for p in posts)
    total_views = sum(p["views"] for p in posts)
    return {
        "totalPosts": len(posts),
        "publishedCount": sum(1 for p in posts if p["status"] == "PUBLISHED"),
        "scheduledCount": sum(1 for p in posts if p["status"] == "SCHEDULED"),
        "engagement": {
            "likes": total_likes,
            "shares": total_shares,
            "comments": total_comments,
            "views": total_views,
            "rate": ((total_likes + total_shares + total_comments) / total_views * 100)
            if total_views > 0
            else 0,
        },
        "followers": {"linkedin": 1250, "twitter": 850},
        "growthRate": 12.5,
    }


def _get_trends() -> list[dict]:
    return [
        {"topic": "#AIagents", "volume": "125K posts", "domain": "Technology"},
        {"topic": "#AutonomousSystems", "volume": "84K posts", "domain": "Technology"},
        {"topic": "#TypeScript", "volume": "62K posts", "domain": "Development"},
        {"topic": "#WebDev2026", "volume": "45K posts", "domain": "Development"},
    ]


# ── Cursor helpers (base64url, no padding — matches the Node convention) ──────

def _encode_cursor(row_id: str) -> str:
    return base64.urlsafe_b64encode(row_id.encode()).decode().rstrip("=")


def _decode_cursor(cursor: str) -> Optional[str]:
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        return base64.urlsafe_b64decode(padded.encode()).decode()
    except Exception:
        return None


# ── Routes ───────────────────────────────────────────────────────────────────

@router.get("/posts")
async def list_posts(
    cursor: Optional[str] = None,
    take: int = 20,
    status: Optional[str] = None,
    user: AuthedUser = Depends(require_user),
):
    page_size = min(take, 100)
    decoded = _decode_cursor(cursor) if cursor else None
    items = await list_social_posts(user.id, page_size + 1, decoded, status)
    has_more = len(items) > page_size
    data = items[:page_size] if has_more else items
    last = data[-1] if data else None
    return {
        "data": data,
        "nextCursor": _encode_cursor(last["id"]) if (last and has_more) else None,
        "hasMore": has_more,
    }


@router.post("/posts/generate")
async def generate(body: GeneratePostBody, user: AuthedUser = Depends(require_user)):
    content = await _generate_draft(body.topic, body.platform, body.tone or "professional")
    return await create_social_post(user.id, body.platform, content, "DRAFT")


@router.post("/posts/schedule")
async def schedule(body: SchedulePostBody, user: AuthedUser = Depends(require_user)):
    post = await find_social_post(user.id, body.postId)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    validation = _validate_content(post["content"], post["platform"])
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation["reason"])
    return await schedule_social_post(body.postId, _parse_date(body.scheduledAt))


@router.post("/posts/{post_id}/publish")
async def publish(post_id: str, user: AuthedUser = Depends(require_user)):
    post = await find_social_post(user.id, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    validation = _validate_content(post["content"], post["platform"])
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation["reason"])

    platform = post["platform"]
    if platform == "linkedin":
        external_id = f"li_{_rand_b36(9)}"
    elif platform == "twitter":
        external_id = f"tw_{_rand_b36(9)}"
    else:
        external_id = f"mock_{_rand_b36(7)}"

    # The platform adapters are stubs that always succeed, so publish always
    # transitions to PUBLISHED with randomized engagement (as the Node side did).
    return await publish_social_post(
        post_id,
        external_id,
        random.randint(10, 59),
        random.randint(2, 11),
        random.randint(1, 5),
        random.randint(100, 599),
    )


@router.get("/analytics")
async def analytics(user: AuthedUser = Depends(require_user)):
    return await _track_stats(user.id)


@router.get("/trends")
async def trends(user: AuthedUser = Depends(require_user)):
    return _get_trends()
