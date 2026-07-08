"""Python-side equivalent of the Node `PythonBridgeService`
(apps/backend/src/agent/runtime/python-bridge.service.ts).

Domains ported off the Node backend that launch autonomous runs (job, and later
food/email/calendar) use this to enqueue a job onto the SAME Redis list the
engine's BRPOP loop already consumes (main.py → executor.run_job), to set the
cooperative cancel flag, and to check the engine heartbeat. No executor changes:
this is just the enqueue/cancel/alive side of the existing bridge, moved
in-process. Same list, same payload shape, same cancel key as the Node service.
"""

import json
import os
from typing import Optional

import redis.asyncio as redis

from events import PY_ALIVE_KEY, PY_JOB_LIST

_client: Optional[redis.Redis] = None


def _redis() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.Redis(
            host=os.environ.get("REDIS_HOST", "localhost"),
            port=int(os.environ.get("REDIS_PORT", "6379")),
            password=os.environ.get("REDIS_PASSWORD") or None,
            decode_responses=True,
        )
    return _client


async def dispatch_job(job: dict) -> None:
    """LPUSH a plain-JSON job onto the engine's queue (mirrors dispatch())."""
    await _redis().lpush(PY_JOB_LIST, json.dumps(job))


async def cancel_job(session_id: str) -> None:
    """Set the cooperative cancel flag the engine polls between candidates
    (`omnitask:job:cancel:<sid>`, EX 600) — mirrors cancel()."""
    await _redis().set(f"omnitask:job:cancel:{session_id}", "1", ex=600)


async def is_engine_alive() -> bool:
    """True when the engine heartbeat key is present (mirrors isAlive())."""
    try:
        return (await _redis().get(PY_ALIVE_KEY)) is not None
    except Exception:
        return False
