"""Fixture capture — snapshots complete browser page state for offline testing and regression detection.

Captures: hydrated DOM, accessibility tree, screenshot, browser storage,
console logs. Produces FixtureBundle — the canonical evidence artifact.
"""

import base64
import hashlib
import json
import logging
import time
import uuid
from dataclasses import dataclass, field, asdict
from typing import Optional

log = logging.getLogger("browser-py.engine.fixture_capture")


@dataclass
class FixtureBundle:
    fixture_id: str
    workflow_id: str
    label: str
    url: str
    captured_at: float
    dom_html: str
    dom_hash: str
    accessibility_tree: dict
    screenshot_b64: Optional[str]
    screenshot_hash: Optional[str]
    storage: dict                    # keys: cookies, local_storage, session_storage
    network_summary: list
    console_logs: list
    element_count: int
    viewport: dict
    metadata: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        d = asdict(self)
        if d.get("screenshot_b64") and len(d["screenshot_b64"]) > 200:
            d["screenshot_b64"] = d["screenshot_b64"][:200] + "...[truncated]"
        return d

    def to_json(self) -> str:
        return json.dumps(asdict(self), default=str, indent=2)


class FixtureCapturer:
    """Captures complete browser page state as a FixtureBundle."""

    def __init__(self, wait_for_idle: bool = True, capture_screenshot: bool = True):
        self.wait_for_idle = wait_for_idle
        self.capture_screenshot = capture_screenshot

    async def capture(
        self,
        page,
        label: str,
        workflow_id: str = "",
        metadata: Optional[dict] = None,
    ) -> FixtureBundle:
        fixture_id = str(uuid.uuid4())

        if self.wait_for_idle:
            try:
                await page.wait_for_load_state("networkidle", timeout=8000)
            except Exception:
                pass

        url = ""
        try:
            url = page.url
        except Exception:
            pass

        dom_html, dom_hash, element_count = await self._capture_dom(page)
        accessibility_tree = await self._capture_accessibility(page)
        screenshot_b64, screenshot_hash = await self._capture_screenshot(page)
        storage = await self._capture_storage(page)
        console_logs = await self._capture_console(page)
        viewport = await self._capture_viewport(page)

        log.debug("Fixture captured: label=%s url=%s elements=%d", label, url, element_count)
        return FixtureBundle(
            fixture_id=fixture_id,
            workflow_id=workflow_id,
            label=label,
            url=url,
            captured_at=time.time(),
            dom_html=dom_html,
            dom_hash=dom_hash,
            accessibility_tree=accessibility_tree,
            screenshot_b64=screenshot_b64,
            screenshot_hash=screenshot_hash,
            storage=storage,
            network_summary=[],
            console_logs=console_logs,
            element_count=element_count,
            viewport=viewport,
            metadata=metadata or {},
        )

    async def _capture_dom(self, page) -> tuple:
        try:
            html = await page.evaluate("() => document.documentElement.outerHTML")
            dom_hash = hashlib.md5(html.encode()).hexdigest()
            element_count = await page.evaluate("() => document.querySelectorAll('*').length")
            return html, dom_hash, int(element_count or 0)
        except Exception as exc:
            log.warning("DOM capture failed: %s", exc)
            return "", "", 0

    async def _capture_accessibility(self, page) -> dict:
        try:
            tree = await page.accessibility.snapshot()
            return tree or {}
        except Exception:
            return {}

    async def _capture_screenshot(self, page) -> tuple:
        if not self.capture_screenshot:
            return None, None
        try:
            raw = await page.screenshot(type="jpeg", quality=75, full_page=False)
            b64 = base64.b64encode(raw).decode()
            h = hashlib.md5(raw).hexdigest()
            return b64, h
        except Exception:
            return None, None

    async def _capture_storage(self, page) -> dict:
        storage = {"cookies": [], "local_storage": {}, "session_storage": {}}
        try:
            ctx = page.context
            raw_cookies = await ctx.cookies()
            storage["cookies"] = [
                {
                    "name": c["name"],
                    "domain": c.get("domain", ""),
                    "path": c.get("path", "/"),
                    "secure": c.get("secure", False),
                }
                for c in raw_cookies
            ]
        except Exception:
            pass
        try:
            storage["local_storage"] = await page.evaluate("""() => {
                const out = {};
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    out[k] = localStorage.getItem(k);
                }
                return out;
            }""")
        except Exception:
            pass
        try:
            storage["session_storage"] = await page.evaluate("""() => {
                const out = {};
                for (let i = 0; i < sessionStorage.length; i++) {
                    const k = sessionStorage.key(i);
                    out[k] = sessionStorage.getItem(k);
                }
                return out;
            }""")
        except Exception:
            pass
        return storage

    async def _capture_console(self, page) -> list:
        try:
            return await page.evaluate("() => window.__consoleLogs || []")
        except Exception:
            return []

    async def _capture_viewport(self, page) -> dict:
        try:
            vp = page.viewport_size
            if vp:
                return {"width": vp["width"], "height": vp["height"]}
        except Exception:
            pass
        return {"width": 1280, "height": 720}
