"""Job executor: drives Playwright through the Node-generated plan steps.

Port of apps/worker/src/processors/browser-task.processor.ts (Puppeteer →
Playwright). Node still does all planning / cognitive-OS / self-healing vision;
this module only executes steps and streams the result.
"""

import asyncio
import base64
import os

from events import EventPublisher, now_ms
from streamer import Screencaster
from input_control import InputController
from browser_manager import get_browser_manager
from dom import extract_raw_dom

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)

STEALTH_JS = """
() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => false });
  Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
  window.chrome = { runtime: {} };
}
"""

# Chromium launch flags. The engine runs HEADLESS by default (no desktop window —
# the dashboard live view is the only surface), so these flags + STEALTH_JS reduce
# bot-detection without a real window. The CDP screencast streams in both modes.
LAUNCH_ARGS = [
    "--disable-infobars",
    "--disable-dev-shm-usage",
    "--no-default-browser-check",
    "--no-first-run",
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-blink-features=AutomationControlled",
]

ACTION_TIMEOUT = 15_000

# Max automatic crash-recovery relaunches per run, so a reproducibly-crashing
# page can't loop forever. Override with BROWSER_MAX_RECOVERIES.
_MAX_RECOVERIES = int(os.environ.get("BROWSER_MAX_RECOVERIES", "2"))


def _is_crash_error(err: Exception) -> bool:
    """Heuristic: did this step fail because the page/context died (renderer
    crash, target closed, browser closed) rather than a normal automation error?"""
    msg = str(err).lower()
    return any(s in msg for s in (
        "crash", "target closed", "target page, context or browser has been closed",
        "browser has been closed", "page has been closed", "connection closed",
    ))


class _LiveSession:
    """Mutable holder for the live page + its stream/input bindings, so the step
    loop can swap to a recovered page after a crash without unwinding the run."""

    def __init__(self, manager, user_id, headless, publisher, session_id):
        self.manager = manager
        self.user_id = user_id
        self.headless = headless
        self.publisher = publisher
        self.session_id = session_id
        self.page = None
        self.streamer = None
        self.input_ctl = None
        self.recoveries = 0
        # Serialize recovery so the crash handler and the step loop can't both
        # relaunch at once.
        self._lock = asyncio.Lock()

    async def recover(self) -> bool:
        """Relaunch a fresh page in the SAME persistent context (session intact),
        then rebind the stream + remote input to it. Returns True on success."""
        async with self._lock:
            if self.recoveries >= _MAX_RECOVERIES:
                return False
            self.recoveries += 1
            attempt = self.recoveries
            await self.publisher.publish(self.session_id, "browser:recovering", {
                "sessionId": self.session_id, "attempt": attempt,
            })
            try:
                # new_page() reuses the warm persistent context (same cookies/login);
                # if that context itself died, BrowserManager relaunches the profile.
                _ctx, page = await self.manager.new_page(self.user_id, headless=self.headless)
                old = self.page
                self.page = page
                if self.streamer is not None:
                    await self.streamer.rebind(page)
                if self.input_ctl is not None:
                    self.input_ctl.rebind(page)
                if old is not None:
                    try:
                        await old.close()
                    except Exception:
                        pass
                await self.publisher.publish(self.session_id, "browser:recovered", {
                    "sessionId": self.session_id, "attempt": attempt,
                })
                await self.publisher.publish(self.session_id, "worker:browser_state", {"state": "RUNNING"})
                return True
            except Exception as exc:  # noqa: BLE001 — recovery is best-effort
                await self.publisher.publish(self.session_id, "browser:recovery_failed", {
                    "sessionId": self.session_id, "message": str(exc),
                })
                return False


async def _recover_if_idle(live) -> None:
    """Recover from a crash that happened while no step was executing (e.g. the
    user was driving the live view). Best-effort; the step loop handles crashes
    that occur mid-step itself."""
    try:
        await live.recover()
    except Exception:  # noqa: BLE001
        pass




def _fire(coro) -> None:
    """Schedule a fire-and-forget coroutine from a sync Playwright callback."""
    try:
        asyncio.create_task(coro)
    except Exception:
        pass


async def _safe_screenshot(page) -> str | None:
    try:
        buf = await page.screenshot(type="jpeg", quality=70)
        return base64.b64encode(buf).decode()
    except Exception:
        return None


async def _get_box(page, selector: str):
    try:
        el = await page.query_selector(selector)
        if not el:
            return None
        return await el.bounding_box()
    except Exception:
        return None


def _attach_telemetry(page, publisher: EventPublisher, session_id: str) -> None:
    def on_nav(frame):
        if frame == page.main_frame:
            _fire(publisher.publish(session_id, "browser:navigation", {
                "sessionId": session_id, "timestamp": now_ms(),
                "url": frame.url, "label": "Page redirected",
            }))

    def on_console(msg):
        text = msg.text or ""
        if text and "[WDS]" not in text and "Failed to load resource" not in text:
            _fire(publisher.publish(session_id, "browser:console", {
                "sessionId": session_id, "timestamp": now_ms(),
                "type": msg.type, "text": text[:300], "label": "Console log output",
            }))

    def on_pageerror(err):
        _fire(publisher.publish(session_id, "browser:error", {
            "sessionId": session_id, "timestamp": now_ms(),
            "message": str(err), "label": "Page javascript error occurred",
        }))

    def on_request(req):
        if req.resource_type in ("xhr", "fetch", "document"):
            _fire(publisher.publish(session_id, "browser:network", {
                "sessionId": session_id, "timestamp": now_ms(), "direction": "request",
                "url": req.url[:300], "method": req.method, "resourceType": req.resource_type,
                "label": f"API request sent: {req.method} {req.url.split('?')[0]}",
            }))

    def on_response(res):
        rtype = res.request.resource_type
        if rtype in ("xhr", "fetch", "document"):
            _fire(publisher.publish(session_id, "browser:network", {
                "sessionId": session_id, "timestamp": now_ms(), "direction": "response",
                "url": res.url[:300], "status": res.status, "resourceType": rtype,
                "label": f"Response received: {res.status}",
            }))

    page.on("framenavigated", on_nav)
    page.on("console", on_console)
    page.on("pageerror", on_pageerror)
    page.on("request", on_request)
    page.on("response", on_response)


async def _emit_interaction(publisher, session_id, event, data):
    await publisher.publish(session_id, event, {"sessionId": session_id, "timestamp": now_ms(), **data})


async def execute_action(page, step: dict, publisher: EventPublisher, session_id: str):
    action = step.get("action")
    target = step.get("target")
    value = step.get("value")

    if action == "navigate":
        await page.goto(value, wait_until="domcontentloaded", timeout=30_000)
        await _emit_interaction(publisher, session_id, "browser:cursor", {"url": page.url, "label": "Navigated"})
        return {"url": page.url, "title": await page.title()}

    if action == "click":
        await page.wait_for_selector(target, timeout=ACTION_TIMEOUT)
        box = await _get_box(page, target)
        if box:
            await _emit_interaction(publisher, session_id, "browser:click", {
                "x": box["x"] + box["width"] / 2, "y": box["y"] + box["height"] / 2,
                "target": target, "highlightedElement": box, "label": step.get("description"),
            })
        await page.click(target)
        return {"clicked": target}

    if action == "type":
        await page.wait_for_selector(target, timeout=ACTION_TIMEOUT)
        box = await _get_box(page, target)
        if box:
            await _emit_interaction(publisher, session_id, "browser:type", {
                "x": box["x"] + box["width"] / 2, "y": box["y"] + box["height"] / 2,
                "target": target, "value": value, "highlightedElement": box,
                "label": step.get("description"),
            })
        await page.click(target)
        await page.keyboard.press("Control+A")
        await page.keyboard.type(value or "", delay=50)
        return {"typed": value, "into": target}

    if action == "select":
        await page.wait_for_selector(target, timeout=ACTION_TIMEOUT)
        await page.select_option(target, value)
        return {"selected": value, "in": target}

    if action == "scroll":
        amount = int(value or "500")
        await _emit_interaction(publisher, session_id, "browser:scroll", {"amount": amount, "direction": "down"})
        await page.evaluate("(px) => window.scrollBy(0, px)", amount)
        return {"scrolled": amount}

    if action == "wait":
        ms = int(value or "1000")
        await asyncio.sleep(ms / 1000)
        return {"waited": ms}

    if action == "press_key":
        await page.keyboard.press(value)
        return {"pressed": value}

    if action == "hover":
        await page.wait_for_selector(target, timeout=ACTION_TIMEOUT)
        await page.hover(target)
        return {"hovered": target}

    if action == "extract_text":
        await page.wait_for_selector(target, timeout=ACTION_TIMEOUT)
        text = await page.eval_on_selector(target, "el => (el.textContent || '').trim()")
        return {"text": text, "from": target}

    if action == "screenshot":
        return {"base64": await _safe_screenshot(page)}

    if action == "wait_for_selector":
        await page.wait_for_selector(target, timeout=20_000)
        return {"found": target}

    if action == "wait_for_navigation":
        await page.wait_for_load_state("domcontentloaded", timeout=30_000)
        return {"url": page.url}

    return {"skipped": True, "action": action}


async def _handle_wait_condition(page, condition: dict) -> None:
    ctype = condition.get("type")
    value = condition.get("value")
    if ctype == "selector":
        await page.wait_for_selector(value, timeout=15_000)
    elif ctype == "navigation":
        await page.wait_for_load_state("domcontentloaded", timeout=30_000)
    elif ctype == "delay":
        await asyncio.sleep(float(value) / 1000)
    elif ctype == "url_contains":
        await page.wait_for_function("(s) => location.href.includes(s)", arg=value, timeout=15_000)


async def run_job(job: dict, publisher: EventPublisher, pw) -> None:
    session_id = job["sessionId"]
    user_id = job.get("userId")
    goal = job.get("goal")
    plan = job.get("plan") or {}
    steps = plan.get("steps") or []
    config = job.get("config") or {}
    viewport = config.get("viewport") or {"width": 1280, "height": 800}
    headless = config.get("headless", True)
    quality = int(os.environ.get("PY_STREAM_QUALITY", "60"))

    await publisher.publish(session_id, "session:worker:started", {
        "sessionId": session_id, "userId": user_id, "goal": goal,
        "totalSteps": len(steps), "attempt": 1,
    })
    # Authoritative browser lifecycle. The worker OWNS browser:state for this
    # path; the relay maps these signals onto the backend state authority. The
    # backend never guesses these — see SessionManagerService.
    await publisher.publish(session_id, "worker:browser_state", {"state": "INITIALIZING"})

    streamer = None
    page = None
    input_ctl = None
    live = None

    try:
        # Per-user PERSISTENT profile: stays logged in across runs/restarts and is
        # reused (no relaunch per run). Strictly isolated per user — never shared.
        manager = get_browser_manager(
            pw,
            launch_args=LAUNCH_ARGS,
            user_agent=USER_AGENT,
            stealth_js=STEALTH_JS,
            default_viewport=viewport,
        )
        context, page = await manager.new_page(user_id, headless=headless)
        try:
            await page.set_viewport_size(viewport)
        except Exception:
            pass
        _attach_telemetry(page, publisher, session_id)

        streamer = Screencaster(page, publisher, session_id, viewport["width"], viewport["height"], quality)
        await streamer.start()
        # Let the user click/type/scroll into the live view ("Take Control").
        input_ctl = InputController(page, publisher.client, session_id)
        await input_ctl.start()

        # Holder shared with the step loop so it can swap to a recovered page after
        # a crash without unwinding the run (stream + input rebind to the new page).
        live = _LiveSession(manager, user_id, headless, publisher, session_id)
        live.page = page
        live.streamer = streamer
        live.input_ctl = input_ctl

        # When a page element triggers a file-chooser dialog, store the Playwright
        # FileChooser on the controller and notify the dashboard so it can open the
        # native OS picker and send the file back via browser:input {type:"file_upload"}.
        def _on_filechooser(chooser):
            input_ctl.pending_file_chooser = chooser
            _fire(publisher.publish(session_id, "browser:filechooser", {
                "sessionId": session_id, "timestamp": now_ms(),
            }))
        page.on("filechooser", _on_filechooser)

        # Browser health: a renderer crash (OOM / GPU) freezes the live view. Flip
        # state to ERROR immediately so the dashboard reflects it. If the crash
        # happens DURING a step, the in-flight await raises and _run_steps drives
        # recovery (relaunch in the same logged-in context + retry). If it happens
        # while idle (e.g. the user is driving), recover here so the view returns.
        def _on_crash(*_):
            _fire(publisher.publish(session_id, "worker:browser_state", {"state": "ERROR"}))
            if live is not None:
                _fire(_recover_if_idle(live))
        page.on("crash", _on_crash)

        await publisher.publish(session_id, "browser:initialized", {"sessionId": session_id})
        # Chromium is up and the observer stream is attached, but no automation
        # has run yet → READY (not RUNNING).
        await publisher.publish(session_id, "worker:browser_state", {"state": "READY"})

        # Automation begins now — the browser is live and being driven → RUNNING.
        await publisher.publish(session_id, "worker:browser_state", {"state": "RUNNING"})

        # Route: an explicit `skill` hint runs the AI automation skill flow.
        # Without it we execute the Node-generated step plan unchanged, so plugin
        # apply/checkout flows (with their approval gates) are never replaced.
        skill_name = job.get("skill")
        if skill_name:
            from skills import run_domain_skill  # lazy: step-only runs stay dependency-free
            outcome = await run_domain_skill(
                str(skill_name), page, publisher, session_id, goal, job, user_id
            )
            results = outcome.get("results", [])
            total = outcome.get("total", len(results))
            status = outcome.get("status", "success")
            healed = 0
        else:
            results, healed = await _run_steps(page, steps, publisher, session_id, live)
            # A crash mid-run swaps in a recovered page — use it for the rest.
            page = live.page
            total = len(steps)
            all_passed = bool(results) and all(r["success"] for r in results) and len(results) == len(steps)
            status = "success" if all_passed else "partial"

        steps_completed = sum(1 for r in results if r.get("success"))
        final_shot = await _safe_screenshot(page) if page and not page.is_closed() else None

        await publisher.publish(session_id, "execution:completed", {
            "sessionId": session_id,
            "status": status,
            "stepsCompleted": steps_completed,
            "totalSteps": total,
            "healedStepsCount": healed,
            "finalScreenshot": final_shot,
            "results": [{"stepIndex": r.get("stepIndex"), "success": r.get("success"),
                         "error": r.get("error"), "durationMs": r.get("durationMs", 0)} for r in results],
        })
        # Browser run finished cleanly → STOPPED (browser closes in finally).
        await publisher.publish(session_id, "worker:browser_state", {"state": "STOPPED"})

    except Exception as err:  # noqa: BLE001 — fatal job error
        await publisher.publish(session_id, "execution:failed", {
            "sessionId": session_id, "reason": "worker_error", "message": str(err),
        })
        await publisher.publish(session_id, "worker:browser_state", {"state": "ERROR"})
    finally:
        if input_ctl is not None:
            await input_ctl.stop()
        if streamer is not None:
            await streamer.stop()
        # Close only the PAGE — the per-user persistent context stays warm in the
        # BrowserManager so the next run reuses the logged-in session (and the
        # profile persists on disk regardless). Contexts close on engine shutdown.
        # After a crash recovery the live page is live.page, so prefer that.
        final_page = live.page if live is not None and live.page is not None else page
        if final_page is not None:
            try:
                await final_page.close()
            except Exception:
                pass


async def _run_steps(page, steps, publisher, session_id, live=None):
    """Execute a Node-generated step plan (the original engine path).

    If a step fails because the page/browser CRASHED (not a normal automation
    error), and a `live` session is available, we relaunch a fresh page in the
    SAME persistent context (session intact), rebind the stream + input, and RETRY
    the same step — so a renderer crash mid-run self-heals instead of aborting.
    """
    results: list[dict] = []
    healed = 0

    i = 0
    while i < len(steps):
        step = steps[i]
        # Always act on the current live page (may have been swapped by recovery).
        if live is not None and live.page is not None:
            page = live.page
        idx = step.get("index")
        start = now_ms()

        await publisher.publish(session_id, "step:started", {
            "sessionId": session_id, "stepIndex": idx,
            "description": step.get("description"), "action": step.get("action"),
            "target": step.get("target"),
        })

        try:
            if step.get("requiresApproval"):
                await publisher.publish(session_id, "approval:required", {
                    "sessionId": session_id, "stepIndex": idx,
                    "description": step.get("description"), "action": step.get("action"),
                    "target": step.get("target"), "value": step.get("value"),
                })
                approved = await publisher.wait_for_approval(session_id, idx, 120_000)
                if not approved:
                    results.append({"success": False, "stepIndex": idx, "action": step.get("action"),
                                    "error": "Approval denied or timed out", "durationMs": now_ms() - start})
                    await publisher.publish(session_id, "step:denied", {
                        "sessionId": session_id, "stepIndex": idx,
                        "reason": "Approval denied or timed out",
                    })
                    break

            data = await execute_action(page, step, publisher, session_id)
            shot = await _safe_screenshot(page)
            results.append({"success": True, "stepIndex": idx, "action": step.get("action"),
                            "screenshot": shot, "data": data, "durationMs": now_ms() - start})

            await publisher.publish(session_id, "step:completed", {
                "sessionId": session_id, "stepIndex": idx,
                "description": step.get("description"), "screenshot": shot, "data": data,
                "durationMs": now_ms() - start,
                "url": page.url if not page.is_closed() else None,
            })

            if step.get("waitCondition"):
                await _handle_wait_condition(page, step["waitCondition"])

        except Exception as err:  # noqa: BLE001 — mirror worker self-healing
            # Crash recovery FIRST: if the page/browser died, relaunch in the same
            # logged-in context and retry this same step (don't advance `i`).
            if live is not None and _is_crash_error(err):
                if await live.recover():
                    page = live.page
                    await publisher.publish(session_id, "step:retrying", {
                        "sessionId": session_id, "stepIndex": idx,
                        "reason": "browser recovered after crash",
                    })
                    continue  # retry same step on the recovered page

            if await _attempt_healing(page, step, idx, start, err, publisher, session_id, results):
                healed += 1
                i += 1
                continue

            shot = await _safe_screenshot(page)
            results.append({"success": False, "stepIndex": idx, "action": step.get("action"),
                            "screenshot": shot, "error": str(err), "durationMs": now_ms() - start})
            await publisher.publish(session_id, "step:failed", {
                "sessionId": session_id, "stepIndex": idx, "error": str(err), "screenshot": shot,
            })
            break

        i += 1

    return results, healed


async def _attempt_healing(page, step, idx, start, err, publisher, session_id, results) -> bool:
    """Emit self_healing:required and apply the Node verdict. Returns True if healed."""
    shot = await _safe_screenshot(page)
    if not shot:
        return False

    raw_dom = await extract_raw_dom(page)
    viewport = page.viewport_size or {"width": 1280, "height": 800}

    await publisher.publish(session_id, "self_healing:required", {
        "sessionId": session_id, "stepIndex": idx, "action": step.get("action"),
        "target": step.get("target"), "value": step.get("value"),
        "description": step.get("description"), "error": str(err), "screenshot": shot,
        "url": page.url, "title": await _safe_title(page), "rawDom": raw_dom, "viewport": viewport,
    })

    healing = await publisher.wait_for_healing(session_id, idx, 30_000)
    if not healing or not healing.get("healed"):
        return False

    try:
        for recovery in healing.get("recoverySteps") or []:
            await execute_action(page, recovery, publisher, session_id)
        for inserted in healing.get("insertSteps") or []:
            await execute_action(page, inserted, publisher, session_id)

        retry_step = dict(step)
        if healing.get("alternativeSelector"):
            retry_step["target"] = healing["alternativeSelector"]
        retry_data = await execute_action(page, retry_step, publisher, session_id)

        post = await _safe_screenshot(page)
        results.append({"success": True, "stepIndex": idx, "action": step.get("action"),
                        "screenshot": post,
                        "data": {**(retry_data or {}), "healed": True, "originalSelector": step.get("target")},
                        "durationMs": now_ms() - start})

        await publisher.publish(session_id, "healing:retry_success", {
            "sessionId": session_id, "stepIndex": idx,
            "recoveryType": healing.get("recoveryType"), "explanation": healing.get("explanation"),
        })
        await publisher.publish(session_id, "step:completed", {
            "sessionId": session_id, "stepIndex": idx,
            "description": f"{step.get('description')} (Healed: {healing.get('explanation')})",
            "screenshot": post, "data": results[-1]["data"], "durationMs": now_ms() - start,
            "url": page.url if not page.is_closed() else None,
        })
        return True
    except Exception:
        return False


async def _safe_title(page) -> str:
    try:
        return await page.title()
    except Exception:
        return ""
