"""Job domain, ported from apps/backend/src/job/ (job-agent + job-match-scorer +
job-tracker + job-preference + dto/job.dto.ts). Same 8 endpoints and the frontend
contract from services/job.service.ts, reverse-proxied at /api/job.

Two deliberate reconciliations (the Node code was broken against the live DB):
- **Preferences** persist to the real JobPreference columns (roles/locations/
  skills/minSalary/maxDailyApps) with the rest packed into `metadata` jsonb
  (see db/session_db.py). The API shape matches the frontend's JobPreference.
- **launch** accepts the frontend's LaunchJobAgentInput (roles/minScore/
  autoApprove/userProfile/credentials) rather than the stale backend DTO that
  silently stripped them.
launch/stop use the shared bridge (bridge.py) — same Redis list + cancel key the
existing executor loop already consumes. Nothing in executor.py changes.
"""

import math
import re
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, UploadFile
from pydantic import BaseModel, Field

from bridge import cancel_job, dispatch_job, is_engine_alive
from db.session_db import (
    create_job_run,
    find_execution_session,
    get_job_preference,
    job_applied_today,
    job_already_seen,
    job_stats,
    list_job_applications,
    mark_job_cancelled,
    record_job_match,
    upsert_job_preference,
)
from http_api.auth import AuthedUser, require_user

router = APIRouter(prefix="/job", dependencies=[Depends(require_user)])

_CONFIG_DIR = Path(__file__).resolve().parent.parent / "agents" / "job_agent" / "config"


# ── Rule-based scorer (ported from JobMatchScorerService, deterministic) ──────

_WEIGHTS = {"role": 30, "location": 20, "required": 25, "preferred": 15, "skills": 10, "exclude_penalty": -50}


def _js_round(x: float) -> int:
    """Match JS Math.round (round half UP), not Python's round-half-to-even."""
    return math.floor(x + 0.5)


def _haystack(job: dict) -> str:
    parts = [job.get("title"), job.get("company"), job.get("location"), job.get("description")]
    parts += job.get("tags") or []
    return " ".join(p for p in parts if p).lower()


def _contains(haystack: str, keyword: str) -> bool:
    k = keyword.strip().lower()
    return len(k) > 0 and k in haystack


def _first_match(text: Optional[str], keywords: list) -> Optional[str]:
    t = (text or "").lower()
    for raw in keywords:
        k = raw.strip().lower()
        if k and k in t:
            return raw
    return None


def _score_job(job: dict, prefs: dict) -> dict:
    haystack = _haystack(job)
    reasons: list[str] = []
    breakdown: dict = {}
    score = 0

    exclude_hit = _first_match(haystack, prefs["excludeKeywords"])
    if exclude_hit:
        breakdown["exclude"] = _WEIGHTS["exclude_penalty"]
        score += _WEIGHTS["exclude_penalty"]
        reasons.append(f'Excluded keyword present: "{exclude_hit}" ({_WEIGHTS["exclude_penalty"]})')

    role_hit = _first_match(f'{job.get("title", "")} {haystack}', prefs["roles"])
    if role_hit:
        breakdown["role"] = _WEIGHTS["role"]
        score += _WEIGHTS["role"]
        reasons.append(f'Role match: "{role_hit}" (+{_WEIGHTS["role"]})')
    elif prefs["roles"]:
        reasons.append("No preferred role keyword matched")

    if prefs["remoteOnly"] and (job.get("remote") or re.search(r"\bremote\b", haystack)):
        breakdown["location"] = _WEIGHTS["location"]
        score += _WEIGHTS["location"]
        reasons.append(f'Remote role (+{_WEIGHTS["location"]})')
    else:
        loc_hit = _first_match(job.get("location") or haystack, prefs["locations"])
        if loc_hit:
            breakdown["location"] = _WEIGHTS["location"]
            score += _WEIGHTS["location"]
            reasons.append(f'Location match: "{loc_hit}" (+{_WEIGHTS["location"]})')

    for key, weight_key in (("requiredKeywords", "required"), ("preferredKeywords", "preferred"), ("skills", "skills")):
        wanted = prefs[key]
        if wanted:
            matched = [k for k in wanted if _contains(haystack, k)]
            pts = _js_round(len(matched) / len(wanted) * _WEIGHTS[weight_key])
            if pts > 0:
                breakdown[weight_key] = pts
                score += pts
                label = {"required": "Required keywords", "preferred": "Preferred keywords", "skills": "Skills"}[weight_key]
                reasons.append(f"{label} {len(matched)}/{len(wanted)} (+{pts})")

    salary = job.get("salary")
    if (
        prefs["minSalary"]
        and isinstance(salary, (int, float))
        and not isinstance(salary, bool)
        and salary < prefs["minSalary"]
    ):
        breakdown["salary"] = -999
        reasons.append(f'Salary {salary} below floor {prefs["minSalary"]} — disqualified')
        return {"score": score, "qualifies": False, "reasons": reasons, "breakdown": breakdown}

    qualifies = score >= prefs["minScore"] and not exclude_hit
    return {"score": score, "qualifies": qualifies, "reasons": reasons, "breakdown": breakdown}


# ── Request models (match the frontend contract, not the stale backend DTO) ───

class JobPreferenceBody(BaseModel):
    roles: list[str] = []
    locations: list[str] = []
    requiredKeywords: list[str] = []
    preferredKeywords: list[str] = []
    excludeKeywords: list[str] = []
    skills: list[str] = []
    minScore: int = 60
    dailyLimit: int = 20
    remoteOnly: bool = False
    minSalary: Optional[int] = None


class JobPostingBody(BaseModel):
    model_config = {"extra": "allow"}  # mirrors the Zod .passthrough()
    portal: str = Field(min_length=1)
    externalJobId: str = Field(min_length=1)
    title: str = Field(min_length=1)
    company: Optional[str] = None
    location: Optional[str] = None
    url: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[list[str]] = None
    salary: Optional[float] = None
    remote: Optional[bool] = None


class EvaluateJobsBody(BaseModel):
    jobs: list[JobPostingBody] = Field(min_length=1)


class UserProfileBody(BaseModel):
    name: str
    email: str
    phone: str


class LaunchJobBody(BaseModel):
    portals: Optional[list[str]] = None
    roles: Optional[list[str]] = None
    locations: Optional[list[str]] = None
    minScore: Optional[int] = None
    maxApplications: Optional[int] = None
    dryRun: Optional[bool] = None
    autoApprove: Optional[bool] = None
    userProfile: Optional[UserProfileBody] = None
    credentials: Optional[dict[str, Any]] = None


class StopJobBody(BaseModel):
    sessionId: str = Field(min_length=1)


# ── evaluateBatch (ported from JobAgentService.evaluateBatch) ─────────────────

async def _evaluate_batch(user_id: str, jobs: list[dict]) -> dict:
    pref = await get_job_preference(user_id)
    daily_limit = pref["dailyLimit"]
    applied_today = await job_applied_today(user_id)
    remaining_today = max(0, daily_limit - applied_today)

    qualified: list[dict] = []
    skipped: list[dict] = []
    duplicates = 0
    evaluated = 0

    for job in jobs:
        if await job_already_seen(user_id, job["portal"], job["externalJobId"]):
            duplicates += 1
            continue
        evaluated += 1
        match = _score_job(job, pref)
        if match["qualifies"] and remaining_today > 0:
            status = "PENDING_APPROVAL"
            remaining_today -= 1
        else:
            status = "SKIPPED"
        record = await record_job_match(
            user_id,
            portal=job["portal"],
            external_job_id=job["externalJobId"],
            title=job["title"],
            company=job.get("company"),
            location=job.get("location"),
            url=job.get("url"),
            score=match["score"],
            match_reasons=match["reasons"],
            status=status,
        )
        evaluation = {
            "job": job,
            "score": match["score"],
            "qualifies": match["qualifies"],
            "reasons": match["reasons"],
            "status": status,
            "applicationId": record["id"],
        }
        (qualified if status == "PENDING_APPROVAL" else skipped).append(evaluation)

    return {
        "evaluated": evaluated,
        "duplicates": duplicates,
        "qualified": qualified,
        "skipped": skipped,
        "dailyLimitReached": remaining_today <= 0,
        "remainingToday": remaining_today,
    }


# ── Routes ───────────────────────────────────────────────────────────────────

@router.get("/preferences")
async def get_preferences(user: AuthedUser = Depends(require_user)):
    return await get_job_preference(user.id)


@router.put("/preferences")
async def save_preferences(body: JobPreferenceBody, user: AuthedUser = Depends(require_user)):
    metadata = {
        "minScore": body.minScore,
        "requiredKeywords": body.requiredKeywords,
        "preferredKeywords": body.preferredKeywords,
        "excludeKeywords": body.excludeKeywords,
        "remoteOnly": body.remoteOnly,
    }
    return await upsert_job_preference(
        user.id,
        roles=body.roles,
        locations=body.locations,
        skills=body.skills,
        min_salary=body.minSalary,
        daily_limit=body.dailyLimit,
        metadata=metadata,
    )


@router.post("/evaluate")
async def evaluate(body: EvaluateJobsBody, user: AuthedUser = Depends(require_user)):
    return await _evaluate_batch(user.id, [j.model_dump() for j in body.jobs])


@router.post("/resume")
async def upload_resume(resume: UploadFile = File(...), user: AuthedUser = Depends(require_user)):
    # Mirrors JobAgentService.saveResume: a single shared resume.<ext> in the
    # job_agent config dir (not per-user — pre-existing behavior, preserved).
    ext = Path(resume.filename or "resume.pdf").suffix.lower() or ".pdf"
    _CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    dest = _CONFIG_DIR / f"resume{ext}"
    dest.write_bytes(await resume.read())
    return {"filename": f"resume{ext}", "saved": True}


@router.post("/launch")
async def launch(body: LaunchJobBody, user: AuthedUser = Depends(require_user)):
    pref = await get_job_preference(user.id)
    portals = body.portals or ["linkedin"]
    roles = body.roles or pref["roles"]
    locations = body.locations or pref["locations"]
    min_score = body.minScore if body.minScore is not None else pref["minScore"]
    max_applications = body.maxApplications if body.maxApplications is not None else pref["dailyLimit"]

    goal = f"Auto-apply to {', '.join(roles) if roles else 'matching'} roles on {', '.join(portals)}"
    run = await create_job_run(
        user.id, goal=goal, metadata={"goal": goal, "routedDomain": "job", "skill": "job_application"}
    )

    preferences: dict = {
        "portals": portals,
        "roles": roles,
        "locations": locations,
        "requiredKeywords": pref["requiredKeywords"],
        "preferredKeywords": pref["preferredKeywords"],
        "excludeKeywords": pref["excludeKeywords"],
        "minScore": min_score,
        "maxApplications": max_applications,
    }
    if body.dryRun is not None:
        preferences["dryRun"] = body.dryRun
    if body.autoApprove is not None:
        preferences["autoApprove"] = body.autoApprove
    if body.userProfile is not None:
        preferences["userProfile"] = body.userProfile.model_dump()
    if body.credentials is not None:
        preferences["credentials"] = body.credentials

    alive = await is_engine_alive()
    await dispatch_job(
        {
            "sessionId": run["sessionId"],
            "taskId": run["taskId"],
            "userId": user.id,
            "goal": goal,
            "skill": "job_application",
            "config": {"viewport": {"width": 1280, "height": 800}, "preferences": preferences},
        }
    )
    return {"sessionId": run["sessionId"], "taskId": run["taskId"], "dispatched": alive}


@router.post("/stop")
async def stop(body: StopJobBody, user: AuthedUser = Depends(require_user)):
    session = await find_execution_session(user.id, body.sessionId)
    if not session:
        return {"stopped": False}
    await cancel_job(body.sessionId)
    await mark_job_cancelled(body.sessionId, session["taskId"])
    return {"stopped": True}


@router.get("/applications")
async def applications(status: Optional[str] = None, user: AuthedUser = Depends(require_user)):
    return await list_job_applications(user.id, status)


@router.get("/stats")
async def stats(user: AuthedUser = Depends(require_user)):
    return await job_stats(user.id)
