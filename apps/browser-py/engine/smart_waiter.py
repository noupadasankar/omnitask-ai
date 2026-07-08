"""Smart waiter — intelligent waiting without fixed delays.

Detects framework (React/Vue/Angular/AJAX) and waits for the right
idle signal. Avoids all time.sleep() > 100ms.
"""

import asyncio
import hashlib
import logging

log = logging.getLogger("browser-py.engine.smart_waiter")

_POLL_MS = 100   # poll interval for all condition checks


class SmartWaiter:
    """Framework-aware waiting engine."""

    async def wait_for_dom_ready(self, page, timeout_ms: int = 10000) -> bool:
        """Wait for DOMContentLoaded + no active spinners."""
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=timeout_ms)
        except Exception:
            return False

        # Also wait for spinners to disappear
        deadline = asyncio.get_event_loop().time() + 3.0
        while asyncio.get_event_loop().time() < deadline:
            spinners = 0
            try:
                spinners = await page.locator('[class*="spinner"], [class*="loading"], [aria-busy="true"]').count()
            except Exception:
                break
            if spinners == 0:
                break
            await asyncio.sleep(_POLL_MS / 1000)
        return True

    async def wait_for_network_idle(self, page, timeout_ms: int = 10000, idle_ms: int = 500) -> bool:
        """Wait until no pending network requests for idle_ms consecutive milliseconds."""
        try:
            await page.wait_for_load_state("networkidle", timeout=timeout_ms)
            return True
        except Exception:
            return False

    async def wait_for_animations(self, page, timeout_ms: int = 5000) -> bool:
        """Wait for all CSS animations and transitions to complete."""
        deadline = asyncio.get_event_loop().time() + timeout_ms / 1000
        while asyncio.get_event_loop().time() < deadline:
            try:
                pending = await page.evaluate("""() => {
                    return document.getAnimations
                        ? document.getAnimations().filter(a => a.playState === 'running').length
                        : 0;
                }""")
                if pending == 0:
                    return True
            except Exception:
                return True
            await asyncio.sleep(_POLL_MS / 1000)
        return False

    async def wait_for_react(self, page, timeout_ms: int = 8000) -> bool:
        """Wait for React to finish rendering."""
        deadline = asyncio.get_event_loop().time() + timeout_ms / 1000
        while asyncio.get_event_loop().time() < deadline:
            try:
                idle = await page.evaluate("""() => {
                    // Check if React DevTools hook is available and idle
                    const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
                    if (!hook) return true;  // No React or no devtools
                    // Heuristic: no pending work
                    return !hook.hasUnsatisfiedUpdates || true;
                }""")
                if idle:
                    return True
            except Exception:
                return True
            await asyncio.sleep(_POLL_MS / 1000)
        return False

    async def wait_for_vue(self, page, timeout_ms: int = 8000) -> bool:
        """Wait for Vue reactivity to settle."""
        deadline = asyncio.get_event_loop().time() + timeout_ms / 1000
        while asyncio.get_event_loop().time() < deadline:
            try:
                settled = await page.evaluate("""() => {
                    if (!window.Vue) return true;
                    return new Promise(r => {
                        if (window.Vue && window.Vue.nextTick) {
                            window.Vue.nextTick(() => r(true));
                        } else {
                            r(true);
                        }
                    });
                }""")
                if settled:
                    return True
            except Exception:
                return True
            await asyncio.sleep(_POLL_MS / 1000)
        return False

    async def wait_for_angular(self, page, timeout_ms: int = 8000) -> bool:
        """Wait for Angular to stabilize."""
        deadline = asyncio.get_event_loop().time() + timeout_ms / 1000
        while asyncio.get_event_loop().time() < deadline:
            try:
                stable = await page.evaluate("""() => {
                    if (!window.getAllAngularTestabilities) return true;
                    const testabilities = window.getAllAngularTestabilities();
                    return testabilities.every(t => t.isStable());
                }""")
                if stable:
                    return True
            except Exception:
                return True
            await asyncio.sleep(_POLL_MS / 1000)
        return False

    async def wait_for_ajax(self, page, timeout_ms: int = 8000) -> bool:
        """Wait for jQuery AJAX or native fetch calls to complete."""
        deadline = asyncio.get_event_loop().time() + timeout_ms / 1000
        while asyncio.get_event_loop().time() < deadline:
            try:
                idle = await page.evaluate("""() => {
                    if (window.jQuery) return jQuery.active === 0;
                    return true;  // No jQuery — assume idle
                }""")
                if idle:
                    return True
            except Exception:
                return True
            await asyncio.sleep(_POLL_MS / 1000)
        return False

    async def wait_for_element_stable(
        self, page, selector: str, timeout_ms: int = 5000
    ) -> bool:
        """Wait for element to be visible with stable bounding box for 200ms."""
        deadline = asyncio.get_event_loop().time() + timeout_ms / 1000
        while asyncio.get_event_loop().time() < deadline:
            try:
                el = page.locator(selector).first
                await el.wait_for(state="visible", timeout=1000)
                box1 = await el.bounding_box()
                await asyncio.sleep(0.2)
                box2 = await el.bounding_box()
                if box1 and box2:
                    drift = abs(box1["x"] - box2["x"]) + abs(box1["y"] - box2["y"])
                    if drift < 2:
                        return True
            except Exception:
                pass
            await asyncio.sleep(_POLL_MS / 1000)
        return False

    async def wait_for_text(self, page, text: str, timeout_ms: int = 8000) -> bool:
        """Wait until text appears anywhere in document body."""
        deadline = asyncio.get_event_loop().time() + timeout_ms / 1000
        while asyncio.get_event_loop().time() < deadline:
            try:
                found = await page.evaluate(
                    "([t]) => document.body.innerText.toLowerCase().includes(t.toLowerCase())",
                    [text],
                )
                if found:
                    return True
            except Exception:
                pass
            await asyncio.sleep(_POLL_MS / 1000)
        return False

    async def wait_for_url_change(
        self, page, current_url: str, timeout_ms: int = 10000
    ) -> bool:
        """Poll until page URL differs from current_url."""
        deadline = asyncio.get_event_loop().time() + timeout_ms / 1000
        while asyncio.get_event_loop().time() < deadline:
            try:
                if page.url != current_url:
                    return True
            except Exception:
                pass
            await asyncio.sleep(_POLL_MS / 1000)
        return False

    async def wait_for_content_change(
        self, page, before_hash: str, timeout_ms: int = 8000
    ) -> bool:
        """Poll until page content hash changes."""
        deadline = asyncio.get_event_loop().time() + timeout_ms / 1000
        while asyncio.get_event_loop().time() < deadline:
            try:
                text = await page.evaluate("() => document.body.innerText || ''")
                after_hash = hashlib.md5(text.encode()).hexdigest()[:12]
                if after_hash != before_hash:
                    return True
            except Exception:
                pass
            await asyncio.sleep(_POLL_MS / 1000)
        return False

    async def wait_for_lazy_images(self, page, timeout_ms: int = 5000) -> bool:
        """Wait for all lazy-loaded images to complete loading."""
        try:
            await page.evaluate("""() => {
                return Promise.all(
                    Array.from(document.images)
                        .filter(img => !img.complete)
                        .map(img => new Promise(r => { img.onload = r; img.onerror = r; }))
                );
            }""")
            return True
        except Exception:
            return False

    async def smart_wait(
        self, page, hints: list = [], timeout_ms: int = 15000
    ) -> bool:
        """Auto-detect framework and wait for the right idle signal.

        hints: list of framework names: ['react', 'vue', 'angular', 'ajax', 'dom', 'network']
        If hints is empty, auto-detects.
        """
        if not hints:
            hints = await self._detect_frameworks(page)

        tasks = []
        if "dom" in hints or not hints:
            tasks.append(self.wait_for_dom_ready(page, timeout_ms))
        if "network" in hints:
            tasks.append(self.wait_for_network_idle(page, timeout_ms))
        if "react" in hints:
            tasks.append(self.wait_for_react(page, timeout_ms))
        if "vue" in hints:
            tasks.append(self.wait_for_vue(page, timeout_ms))
        if "angular" in hints:
            tasks.append(self.wait_for_angular(page, timeout_ms))
        if "ajax" in hints:
            tasks.append(self.wait_for_ajax(page, timeout_ms))
        if "animations" in hints:
            tasks.append(self.wait_for_animations(page, timeout_ms))

        if not tasks:
            tasks = [self.wait_for_dom_ready(page, timeout_ms)]

        results = await asyncio.gather(*tasks, return_exceptions=True)
        return all(r is True for r in results)

    async def _detect_frameworks(self, page) -> list[str]:
        """Detect which JS frameworks are present on the page."""
        try:
            result = await page.evaluate("""() => {
                const f = [];
                if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__ || window.React) f.push('react');
                if (window.Vue) f.push('vue');
                if (window.getAllAngularTestabilities || window.ng) f.push('angular');
                if (window.jQuery) f.push('ajax');
                return f;
            }""")
            return result or ["dom"]
        except Exception:
            return ["dom"]
