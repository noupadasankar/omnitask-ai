"""FastAPI replacement for main.py's old hand-rolled stdlib `/health` server.

Same response shape as before: {status, service, redis: {status, latencyMs},
activeJobs} — anything polling this endpoint today (e.g. the Node backend's
health.controller.ts PYTHON_AGENT_URL check) keeps working unchanged.
"""

import time

from fastapi import APIRouter


def build_health_router(redis_client, active_jobs: dict) -> APIRouter:
    router = APIRouter()

    @router.get("/health")
    async def health():
        t0 = time.monotonic()
        try:
            await redis_client.ping()
            redis_ms = round((time.monotonic() - t0) * 1000)
            redis_ok = True
        except Exception:
            redis_ms = None
            redis_ok = False

        return {
            "status": "up" if redis_ok else "degraded",
            "service": "browser-py",
            "redis": {"status": "up" if redis_ok else "down", "latencyMs": redis_ms},
            "activeJobs": len(active_jobs),
        }

    return router
