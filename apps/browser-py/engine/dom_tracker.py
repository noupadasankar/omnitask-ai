"""DOM tracker — monitors dynamic DOM changes via MutationObserver injected into page."""

import asyncio
import json
import logging
from dataclasses import dataclass
from typing import Optional

log = logging.getLogger("browser-py.engine.dom_tracker")

_SIGNIFICANT_TAGS = {"button", "form", "input", "select", "dialog", "a"}
_SIGNIFICANT_CLASSES = ("error", "success", "modal", "alert", "warning", "notification", "toast")

_OBSERVER_JS = """
(function() {
    if (window.__domChanges !== undefined) return;
    window.__domChanges = [];
    window.__domObserver = new MutationObserver(function(mutations) {
        mutations.forEach(function(m) {
            var change = null;
            if (m.type === 'childList') {
                m.addedNodes.forEach(function(n) {
                    if (n.nodeType === 1) {
                        change = {
                            change_type: 'added',
                            tag: n.tagName ? n.tagName.toLowerCase() : '',
                            text_preview: (n.textContent || '').trim().slice(0, 80),
                            selector: n.id ? '#' + n.id : (n.className ? '.' + (n.className + '').split(' ')[0] : n.tagName || ''),
                            timestamp: Date.now(),
                        };
                        window.__domChanges.push(change);
                    }
                });
                m.removedNodes.forEach(function(n) {
                    if (n.nodeType === 1) {
                        window.__domChanges.push({
                            change_type: 'removed',
                            tag: n.tagName ? n.tagName.toLowerCase() : '',
                            text_preview: (n.textContent || '').trim().slice(0, 80),
                            selector: n.id ? '#' + n.id : '',
                            timestamp: Date.now(),
                        });
                    }
                });
            } else if (m.type === 'attributes') {
                window.__domChanges.push({
                    change_type: 'attribute',
                    tag: m.target.tagName ? m.target.tagName.toLowerCase() : '',
                    text_preview: (m.attributeName || '') + '=' + (m.target.getAttribute(m.attributeName) || ''),
                    selector: m.target.id ? '#' + m.target.id : '',
                    timestamp: Date.now(),
                });
            } else if (m.type === 'characterData') {
                window.__domChanges.push({
                    change_type: 'text',
                    tag: m.target.parentElement ? m.target.parentElement.tagName.toLowerCase() : 'text',
                    text_preview: (m.target.data || '').trim().slice(0, 80),
                    selector: '',
                    timestamp: Date.now(),
                });
            }
            // Keep max 200 changes
            if (window.__domChanges.length > 200) {
                window.__domChanges.shift();
            }
        });
    });
    window.__domObserver.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: false,
    });
})();
"""


@dataclass
class DOMChange:
    change_type: str    # added | removed | attribute | text | visibility
    selector: str
    tag: str
    text_preview: str
    timestamp: float
    is_significant: bool


class DOMTracker:
    """Monitors dynamic DOM changes via MutationObserver."""

    async def start_tracking(self, page) -> None:
        """Inject MutationObserver into the page."""
        try:
            await page.evaluate(_OBSERVER_JS)
            log.debug("DOMTracker: observer injected")
        except Exception as exc:
            log.warning("start_tracking failed: %s", exc)

    async def stop_tracking(self, page) -> None:
        """Disconnect the observer."""
        try:
            await page.evaluate("""() => {
                if (window.__domObserver) {
                    window.__domObserver.disconnect();
                    window.__domObserver = null;
                }
            }""")
        except Exception:
            pass

    async def get_changes(self, page) -> list[DOMChange]:
        """Read and return all recorded DOM changes."""
        try:
            raw = await page.evaluate("() => window.__domChanges || []")
            changes = []
            for r in (raw or []):
                tag = r.get("tag", "")
                text = r.get("text_preview", "")
                selector = r.get("selector", "")
                change_type = r.get("change_type", "")
                ts = r.get("timestamp", 0) / 1000

                significant = self._is_significant(tag, text, selector, change_type)
                changes.append(DOMChange(
                    change_type=change_type,
                    selector=selector,
                    tag=tag,
                    text_preview=text,
                    timestamp=ts,
                    is_significant=significant,
                ))
            return changes
        except Exception as exc:
            log.warning("get_changes failed: %s", exc)
            return []

    async def clear_changes(self, page) -> None:
        """Reset the changes array in the page."""
        try:
            await page.evaluate("() => { window.__domChanges = []; }")
        except Exception:
            pass

    async def get_significant_changes(self, page) -> list[DOMChange]:
        """Return only changes where is_significant=True."""
        all_changes = await self.get_changes(page)
        return [c for c in all_changes if c.is_significant]

    async def detect_shadow_dom(self, page) -> list[dict]:
        """Return elements that have shadow roots."""
        try:
            return await page.evaluate("""() => {
                const result = [];
                const all = document.querySelectorAll('*');
                for (const el of all) {
                    if (el.shadowRoot) {
                        result.push({
                            tag: el.tagName.toLowerCase(),
                            id: el.id || '',
                            class: (el.className || '').split(' ')[0] || '',
                            child_count: el.shadowRoot.children.length,
                        });
                    }
                }
                return result;
            }""") or []
        except Exception:
            return []

    async def detect_iframes(self, page) -> list[dict]:
        """Return list of iframe info currently in DOM."""
        try:
            return await page.evaluate("""() => {
                return Array.from(document.querySelectorAll('iframe')).map((f, i) => ({
                    index: i,
                    src: f.src || '',
                    name: f.name || '',
                    id: f.id || '',
                    width: f.width || '',
                    height: f.height || '',
                }));
            }""") or []
        except Exception:
            return []

    async def wait_for_dom_change(self, page, timeout_ms: int = 5000) -> bool:
        """Poll until at least one new DOM change is detected."""
        before_count = len(await self.get_changes(page))
        deadline = asyncio.get_event_loop().time() + timeout_ms / 1000
        while asyncio.get_event_loop().time() < deadline:
            await asyncio.sleep(0.1)
            after = len(await self.get_changes(page))
            if after > before_count:
                return True
        return False

    async def watch_element(self, page, selector: str, timeout_ms: int = 5000) -> bool:
        """Wait for a specific selector to appear or change in the DOM."""
        deadline = asyncio.get_event_loop().time() + timeout_ms / 1000
        while asyncio.get_event_loop().time() < deadline:
            try:
                el = page.locator(selector).first
                visible = await el.is_visible()
                if visible:
                    return True
            except Exception:
                pass
            # Also check via DOM changes
            changes = await self.get_changes(page)
            for c in changes:
                if selector in c.selector or selector.lstrip("#.") in c.text_preview:
                    return True
            await asyncio.sleep(0.1)
        return False

    def _is_significant(
        self, tag: str, text: str, selector: str, change_type: str
    ) -> bool:
        """Determine if a DOM change is significant enough to report."""
        if tag in _SIGNIFICANT_TAGS and change_type == "added":
            return True
        text_lower = text.lower()
        sel_lower = selector.lower()
        if any(kw in text_lower or kw in sel_lower for kw in _SIGNIFICANT_CLASSES):
            return True
        if change_type == "removed" and tag in ("dialog", "form"):
            return True
        return False
