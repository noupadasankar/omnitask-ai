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

# ---------------------------------------------------------------------------
# Agent registry (informational — agents are loaded lazily by the skill layer)
#
# Each entry maps a domain → the agent class that provides live-browser
# automation for that domain. The skills layer imports these on demand when a
# job payload carries a matching `skill` key; they are not pre-imported here
# to keep cold-start memory low.
#
#   'job'    → agents/job_agent/src/agent/orchestrator.JobAgentOrchestrator
#              (skills/job.py + skills/job_application.py via web_task bridge)
#
#   'social' → agents/social_agent/social_agent.SocialAgent
#              (skills/social.py, activated when job['action'] is post/read/draft
#               with an explicit platform — Twitter/X and LinkedIn)
#
#   'email'  → agents/email_agent/email_agent.EmailAgentOrchestrator
#              (skills/email.py, activated for all email actions: read, search,
#               compose, send — send is always gated by user approval before the
#               Send button is pressed; supports Gmail and Outlook webmail)
#
#   'shopping' → agents/shopping_agent/shopping_agent.ShoppingAgent
#                (skills/shopping.py, activated for all shopping actions: compare,
#                 cart, purchase — compare is the default safe action; add-to-cart
#                 navigates to the best-deal product page; checkout is ALWAYS gated
#                 by an APPROVAL GATE log before any 'Place Order' click is made.
#                 Searches Amazon, eBay, and Walmart; supports coupon/promo codes.)
#
#   'booking'  → agents/booking_agent/booking_agent.BookingAgent
#                (skills/booking.py, activated for all booking task types:
#                 ticket_booking, hotel_booking, restaurant_booking, appointment,
#                 reservation. Supports OpenTable/Resy for restaurants, Booking.com/
#                 Expedia for hotels, Ticketmaster/StubHub/Eventbrite for tickets,
#                 and Zocdoc/Calendly for appointments. Every confirm/checkout/submit
#                 is ALWAYS gated by the dashboard approval panel before any click.
#                 Set BOOKING_AUTO_APPROVE=true to skip the gate (autonomous mode).
#                 Falls back to Google search when portals are unreachable.
#                 Self-heals on selector failures via a chain of CSS selector probes.)
#
#   'food'     → agents/food_agent/food_agent.FoodAgent
#                (skills/food.py, activated for skill='food' and aliases:
#                 food_order, restaurant_booking. Capabilities:
#                   find_restaurant — discovers restaurants via Yelp, Google Maps,
#                     and web search; extracts name/rating/price/snippet per card;
#                     optional AI one-sentence summary per result.
#                   read_menu — navigates to a restaurant page and extracts menu
#                     items (name, description, price) via CSS selector cascade +
#                     schema.org LD+JSON; heuristic price-line fallback.
#                   reserve_table — searches OpenTable / Resy for available time
#                     slots, then ALWAYS gates the confirmation through the dashboard
#                     approval panel before opening the reservation page.
#                   order_delivery — searches DoorDash / Uber Eats / Grubhub for
#                     the requested dish, then ALWAYS gates the checkout through the
#                     dashboard approval panel.  OmniTask never clicks Place Order
#                     without explicit user action on the live browser view.
#                 Set FOOD_AUTO_APPROVE=true to skip the gate (autonomous mode).
#                 Falls back to Google search when portals are unreachable.
#                 Self-heals on selector failures via a chain of CSS selector probes.)
#
#   'travel'   → agents/travel_agent/travel_agent.TravelAgent
#                (skills/travel.py, activated for all travel task types:
#                 search_flights, flight_search, flights — searches Google Flights
#                 then Kayak as a fallback; search_hotels, hotel_search — searches
#                 Booking.com then Hotels.com; build_itinerary — combines flight +
#                 hotel results into a single multi-leg plan. Every payment action
#                 (book_flight, book_hotel, book_itinerary) is ALWAYS gated by the
#                 dashboard approval panel before any click. Set TRAVEL_AUTO_APPROVE=true
#                 to skip the gate (autonomous mode, off by default). Self-heals on
#                 selector failures via a JS → CSS → body.innerText cascade.)
#
#   'calendar' → agents/calendar_agent/calendar_agent.CalendarAgent
#                (skills/calendar.py, activated for all calendar task types:
#                 create_event, find_slot, detect_conflict, reschedule,
#                 add_travel_buffer. Supports Google Calendar and Outlook Web.
#                 Every create/modify action (create_event, reschedule,
#                 add_travel_buffer) is ALWAYS gated by the dashboard approval
#                 panel before any browser click is made. Read-only operations
#                 (find_slot, detect_conflict) do not require approval.
#                 Set CALENDAR_AUTO_APPROVE=true to skip the gate (autonomous
#                 mode, off by default). Self-heals on selector failures via a
#                 chain of CSS selector probes. Falls back to the Google
#                 Calendar day-view URL when direct portal navigation fails.)
#
# To register a new agent:
#   1. Create  apps/browser-py/agents/<domain>_agent/<domain>_agent.py
#              with a class following the SocialAgent interface (execute() method).
#   2. Create  apps/browser-py/agents/<domain>_agent/__init__.py
#              that re-exports the class.
#   3. Update  apps/browser-py/skills/<domain>.py to import and call the agent.
#   4. Add a comment here so the registry stays up-to-date.
# ---------------------------------------------------------------------------

# Console is quiet by default — the live browser view in the dashboard is the
# place to watch a run. Set BROWSER_PY_LOG_LEVEL=INFO (or DEBUG) to restore the
# Python terminal output. Playwright's own chatter is pinned to WARNING.
_LOG_LEVEL = getattr(
    logging, os.environ.get("BROWSER_PY_LOG_LEVEL", "INFO").upper(), logging.INFO
)
logging.basicConfig(level=_LOG_LEVEL, format="%(asctime)s [browser-py] %(levelname)s %(message)s")
log = logging.getLogger("browser-py")

# Tracks in-flight jobs by sessionId so the health endpoint can report activeJobs.
_active_jobs: dict = {}


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
    """Load env vars in priority order (earlier = higher priority via setdefault).

    Priority (highest first):
      1. Already-set process env (forwarded by dev.mjs or the OS)
      2. apps/browser-py/.env  — engine-specific overrides
      3. <repo-root>/.env      — shared defaults
      4. apps/backend/.env     — infra creds (REDIS_*) only, filled in last
         so the backend's remote Redis host/port/password are used when not
         overridden by the caller.
    """
    here = Path(__file__).resolve().parent
    # Snapshot the REAL process env (OS / dev.mjs) BEFORE loading any file, so an
    # explicit operator override is never clobbered by a file value below.
    _os_provided = set(os.environ.keys())

    for candidate in (here / ".env", here.parent.parent / ".env"):
        if not candidate.exists():
            continue
        for line in candidate.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key, value = key.strip(), value.strip()
            # An empty value (e.g. `REDIS_PASSWORD=` in the root .env) means
            # "not configured" — it must NOT shadow a real value supplied by a
            # more-specific source like backend/.env below. Skip empties.
            if not value:
                continue
            os.environ.setdefault(key, value)

    # Backend .env is authoritative for Redis infra credentials, so for REDIS_*
    # keys it OVERRIDES any value seeded from the .env files above (but a real
    # OS/dev.mjs override still wins). This is what lets the engine reach the
    # same authenticated Redis the backend uses.
    backend_env = here.parent / "backend" / ".env"
    if backend_env.exists():
        for line in backend_env.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key, value = key.strip(), value.strip()
            if key.startswith("REDIS_") and value and key not in _os_provided:
                os.environ[key] = value


def _redis_client() -> "redis.Redis":
    host = os.environ.get("REDIS_HOST", "localhost")
    port = int(os.environ.get("REDIS_PORT", "6379"))
    password = os.environ.get("REDIS_PASSWORD") or None
    log.info("Redis → %s:%d  auth=%s", host, port, bool(password))
    return redis.Redis(
        host=host,
        port=port,
        password=password,
        decode_responses=True,
        socket_keepalive=True,
        health_check_interval=30,
    )


async def _heartbeat(client: "redis.Redis") -> None:
    """Refresh the liveness key so the backend dispatches to us (else it falls back)."""
    while True:
        try:
            await client.set(PY_ALIVE_KEY, "1", ex=10)
        except Exception:
            pass
        await asyncio.sleep(5)


async def _health_server(client: "redis.Redis") -> None:
    """Lightweight HTTP health endpoint at :8000/health using only stdlib asyncio.

    Returns JSON: {status, service, redis: {status, latencyMs}, activeJobs}
    No extra pip deps — asyncio.start_server is part of the Python stdlib.
    """
    async def _handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        try:
            first_line = await asyncio.wait_for(reader.readline(), timeout=2.0)
            while True:
                hdr = await asyncio.wait_for(reader.readline(), timeout=2.0)
                if hdr in (b"\r\n", b"\n", b""):
                    break
            decoded = first_line.decode(errors="replace")
            parts = decoded.split(" ")
            path = parts[1].split("?")[0] if len(parts) > 1 else "/"

            if path == "/health":
                t0 = asyncio.get_event_loop().time()
                try:
                    await asyncio.wait_for(client.ping(), timeout=2.0)
                    redis_ms = round((asyncio.get_event_loop().time() - t0) * 1000)
                    redis_ok = True
                except Exception:
                    redis_ms = None
                    redis_ok = False
                body = json.dumps({
                    "status": "up" if redis_ok else "degraded",
                    "service": "browser-py",
                    "redis": {"status": "up" if redis_ok else "down", "latencyMs": redis_ms},
                    "activeJobs": len(_active_jobs),
                }).encode()
                status_line = b"200 OK"
            else:
                body = b'{"error":"not found"}'
                status_line = b"404 Not Found"

            writer.write(
                b"HTTP/1.1 " + status_line + b"\r\n"
                b"Content-Type: application/json\r\n"
                b"Access-Control-Allow-Origin: *\r\n"
                b"Connection: close\r\n"
                b"Content-Length: " + str(len(body)).encode() + b"\r\n"
                b"\r\n" + body
            )
            await writer.drain()
        except Exception:
            pass
        finally:
            try:
                writer.close()
                await asyncio.wait_for(writer.wait_closed(), timeout=1.0)
            except Exception:
                pass

    port = int(os.environ.get("BROWSER_PY_HEALTH_PORT", "8000"))
    try:
        server = await asyncio.start_server(_handle, "127.0.0.1", port, reuse_address=True)
        log.info("Health endpoint → http://localhost:%d/health", port)
        async with server:
            await server.serve_forever()
    except OSError as exc:
        log.warning("Health server could not bind :%d — %s (continuing without it)", port, exc)


async def _handle_job(job: dict, publisher: EventPublisher, pw) -> None:
    session_id = job.get("sessionId", "?")
    _active_jobs[session_id] = True
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
    finally:
        _active_jobs.pop(session_id, None)


async def main() -> None:
    _load_env()
    # Headful by default for a trustworthy live view + lower bot detection;
    # auto-falls back to headless when no display exists (servers/CI), unless
    # PLAYWRIGHT_HEADLESS is set explicitly.
    headless = _resolve_headless()

    client = _redis_client()
    publisher = EventPublisher(client)
    asyncio.create_task(_heartbeat(client))
    asyncio.create_task(_health_server(client))
    from browser_manager import run_profile_gc_loop
    asyncio.create_task(run_profile_gc_loop())

    async with async_playwright() as pw:
        log.info("Python browser engine ready (headless=%s) — listening on %s", headless, PY_JOB_LIST)
        try:
            while True:
                try:
                    item = await client.brpop(PY_JOB_LIST, timeout=5)
                except TimeoutError:
                    # Expected: the server-side 5-second BRPOP window elapsed with no
                    # job. redis-py raises TimeoutError when the socket read times out
                    # before the server returns. Treat it as an empty poll and retry.
                    continue
                except Exception as err:  # noqa: BLE001 — keep the loop alive on Redis blips
                    log.warning("BRPOP connection error: %s", err)
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
