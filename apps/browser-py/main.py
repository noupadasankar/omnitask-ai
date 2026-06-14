"""OmniTask Python browser engine.

Standalone Playwright service that replaces the Node/Puppeteer worker for live
browser execution. It BRPOPs jobs the backend pushes onto `omnitask:py:jobs`,
drives Chromium with Playwright, streams the live view, and publishes events on
the existing `omnitask:worker:events` channel (relayed to the UI + DB by the
NestJS backend, unchanged).

Run:  python main.py   (after: pip install -r requirements.txt && playwright install chromium)
"""

import asyncio
import json
import logging
import os
import sys
from pathlib import Path

import redis.asyncio as redis
from playwright.async_api import async_playwright

from events import EventPublisher, PY_JOB_LIST, PY_ALIVE_KEY
from executor import run_job

# Console is quiet by default — the live browser view in the dashboard is the
# place to watch a run. Set BROWSER_PY_LOG_LEVEL=INFO (or DEBUG) to restore the
# Python terminal output. Playwright's own chatter is pinned to WARNING.
_LOG_LEVEL = getattr(
    logging, os.environ.get("BROWSER_PY_LOG_LEVEL", "WARNING").upper(), logging.WARNING
)
logging.basicConfig(level=_LOG_LEVEL, format="%(asctime)s [browser-py] %(message)s")
log = logging.getLogger("browser-py")


def _has_display() -> bool:
    """True when a GUI display is available for a headful Chromium window.

    - Windows / macOS: a desktop session is essentially always present.
    - Linux / X11: requires a non-empty DISPLAY (or WAYLAND_DISPLAY) — absent on
      bare servers/CI/containers, where headful would crash on launch.
    """
    if sys.platform in ("win32", "darwin"):
        return True
    return bool(os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY"))


def _resolve_headless() -> bool:
    """Headless by default — NO desktop window opens; the dashboard live view
    ("Chromium box") is the only surface, fed by the screencast stream.

    Set PLAYWRIGHT_HEADLESS=false to ALSO open a real Chromium window (requires a
    display; the request is ignored on bare servers/CI where it would crash).
    """
    override = os.environ.get("PLAYWRIGHT_HEADLESS")
    if override is not None and override.strip().lower() == "false":
        if _has_display():
            return False
        log.warning(
            "PLAYWRIGHT_HEADLESS=false but no display detected — staying headless."
        )
    # Default (and safe fallback): headless, so no window ever opens unexpectedly.
    return True


def _load_env() -> None:
    """Load ../../.env then ./.env (later wins), without a hard dotenv dependency."""
    here = Path(__file__).resolve().parent
    for candidate in (here.parent.parent / ".env", here / ".env"):
        if not candidate.exists():
            continue
        for line in candidate.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())


def _redis_client() -> "redis.Redis":
    return redis.Redis(
        host=os.environ.get("REDIS_HOST", "localhost"),
        port=int(os.environ.get("REDIS_PORT", "6379")),
        password=os.environ.get("REDIS_PASSWORD") or None,
        decode_responses=True,
        # Resilience for the long-lived BRPOP/heartbeat loop on Windows: keep the
        # socket alive, health-check idle connections, and retry transient
        # timeouts instead of surfacing them as errors every minute.
        socket_keepalive=True,
        health_check_interval=30,
        retry_on_timeout=True,
    )


async def _heartbeat(client: "redis.Redis") -> None:
    """Refresh the liveness key so the backend dispatches to us (else it falls back)."""
    while True:
        try:
            await client.set(PY_ALIVE_KEY, "1", ex=10)
        except Exception:
            pass
        await asyncio.sleep(5)


async def _handle_job(job: dict, publisher: EventPublisher, pw) -> None:
    session_id = job.get("sessionId", "?")
    log.info("Job received | session=%s | steps=%s", session_id, len((job.get("plan") or {}).get("steps") or []))
    try:
        await run_job(job, publisher, pw)
    except Exception as err:  # noqa: BLE001
        log.exception("Job %s crashed: %s", session_id, err)
        try:
            await publisher.publish(session_id, "execution:failed",
                                    {"sessionId": session_id, "reason": "worker_error", "message": str(err)})
        except Exception:
            pass


async def main() -> None:
    _load_env()
    # Headful by default for a trustworthy live view + lower bot detection;
    # auto-falls back to headless when no display exists (servers/CI), unless
    # PLAYWRIGHT_HEADLESS is set explicitly.
    headless = _resolve_headless()

    client = _redis_client()
    publisher = EventPublisher(client)
    asyncio.create_task(_heartbeat(client))
    # Background profile GC: trims caches over quota, closes idle browsers, and
    # (opt-in) evicts stale profiles. Self-disables when BROWSER_GC_INTERVAL_S=0.
    from browser_manager import run_profile_gc_loop
    asyncio.create_task(run_profile_gc_loop())

    async with async_playwright() as pw:
        log.info("Python browser engine connected (headless=%s) — waiting on %s", headless, PY_JOB_LIST)
        try:
            while True:
                try:
                    item = await client.brpop(PY_JOB_LIST, timeout=5)
                except Exception as err:  # noqa: BLE001 — keep the loop alive on Redis blips
                    log.warning("BRPOP failed: %s", err)
                    await asyncio.sleep(1)
                    continue

                if not item:
                    continue

                _key, raw = item
                try:
                    job = json.loads(raw)
                except Exception:
                    log.warning("Dropping unparseable job payload")
                    continue

                # The engine — not the API — owns the headful/headless decision,
                # because only this process knows whether it has a display. Override
                # whatever Node sent.
                job.setdefault("config", {})
                job["config"]["headless"] = headless

                asyncio.create_task(_handle_job(job, publisher, pw))
        finally:
            # Close every per-user persistent context cleanly on shutdown.
            from browser_manager import shutdown_browser_manager
            await shutdown_browser_manager()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        log.info("Shutting down")
