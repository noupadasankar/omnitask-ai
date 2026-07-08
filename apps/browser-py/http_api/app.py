"""FastAPI app factory for browser-py's HTTP surface: the existing /health
endpoint plus routes for domains ported off the Node backend (starting with
media/). Served on the same port the old stdlib health server used
(BROWSER_PY_HEALTH_PORT), so there's exactly one HTTP server/port/env var.
"""

from fastapi import FastAPI

from domains.food import router as food_router
from domains.job import router as job_router
from domains.media import router as media_router
from domains.shopping import router as shopping_router
from domains.social import router as social_router
from domains.travel import router as travel_router
from http_api.health import build_health_router


def create_app(redis_client, active_jobs: dict) -> FastAPI:
    app = FastAPI(title="omnitask browser-py")
    app.include_router(build_health_router(redis_client, active_jobs))
    app.include_router(media_router)
    app.include_router(travel_router)
    app.include_router(social_router)
    app.include_router(job_router)
    app.include_router(shopping_router)
    app.include_router(food_router)
    return app
