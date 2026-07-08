"""Intelligent scrolling engine — reads every pixel of a page, nothing hidden.

Instead of blind scrolling: measures viewport, detects unread regions, scrolls
section-by-section, waits for lazy loading, and expands all collapsible content.
"""

import asyncio
import logging
import random

log = logging.getLogger("browser-py.engine.scroll_engine")

# JS helpers
_PAGE_HEIGHT_JS = "document.documentElement.scrollHeight"
_SCROLL_TOP_JS = "window.scrollY"
_VIEWPORT_HEIGHT_JS = "window.innerHeight"

_EXPANDABLE_SELECTORS = [
    '[aria-expanded="false"]',
    'button[data-toggle]',
    '.accordion:not(.show) .accordion-button',
    '.collapse-trigger',
    '[class*="show-more"]',
    '[class*="read-more"]',
    '[class*="load-more"]',
    'button[class*="expand"]',
    'details:not([open]) summary',
    '[class*="see-more"]',
    '[class*="view-more"]',
]

_LOAD_MORE_TEXT = [
    "load more", "show more", "view more", "see more", "more results",
    "next page", "show all", "expand", "read more",
]


class ScrollEngine:
    """Intelligent section-by-section scrolling with lazy-load detection."""

    async def full_page_scroll(
        self,
        page,
        *,
        pause_ms: int = 350,
        max_scrolls: int = 60,
    ) -> dict:
        """Scroll the entire page ensuring every region is rendered.

        Returns:
            sections_scrolled, total_height, new_content_found, expandable_found
        """
        sections_scrolled = 0
        expandable_found: list[str] = []
        prev_height = 0
        new_content = False

        await self._wait_for_load(page)

        for _ in range(max_scrolls):
            viewport_h = await page.evaluate(_VIEWPORT_HEIGHT_JS)
            page_h = await page.evaluate(_PAGE_HEIGHT_JS)
            scroll_top = await page.evaluate(_SCROLL_TOP_JS)

            if page_h != prev_height:
                new_content = True
                prev_height = page_h

            # Scroll one viewport height at a time (human-like)
            await self.smooth_scroll(page, viewport_h * 0.9)
            sections_scrolled += 1

            # Wait for lazy-loaded content
            await asyncio.sleep(pause_ms / 1000)
            await self._wait_for_load(page, timeout_ms=2000)

            new_h = await page.evaluate(_PAGE_HEIGHT_JS)
            new_scroll = await page.evaluate(_SCROLL_TOP_JS)

            # Detect "show more" buttons that appeared after scroll
            buttons = await self._find_load_more_buttons(page)
            for btn in buttons:
                if btn not in expandable_found:
                    expandable_found.append(btn)

            # End condition: at bottom AND height stable
            at_bottom = (new_scroll + viewport_h) >= new_h - 5
            if at_bottom and new_h == prev_height:
                break

            prev_height = new_h

        return {
            "sections_scrolled": sections_scrolled,
            "total_height": await page.evaluate(_PAGE_HEIGHT_JS),
            "new_content_found": new_content,
            "expandable_found": expandable_found,
        }

    async def scroll_to_element(
        self, page, selector: str, *, offset_px: int = 100
    ) -> bool:
        """Scroll a specific element into view. Returns True if found."""
        try:
            el = page.locator(selector).first
            await el.scroll_into_view_if_needed(timeout=5000)
            # Extra offset so element isn't at the very top
            await page.evaluate(f"window.scrollBy(0, -{offset_px})")
            return True
        except Exception:
            return False

    async def scroll_until_stable(self, page, *, timeout_ms: int = 12000) -> int:
        """Scroll until page height stops growing (infinite scroll detection).

        Returns final page height.
        """
        deadline = asyncio.get_event_loop().time() + timeout_ms / 1000
        prev_height = -1
        stable_rounds = 0

        while asyncio.get_event_loop().time() < deadline:
            height = await page.evaluate(_PAGE_HEIGHT_JS)
            if height == prev_height:
                stable_rounds += 1
                if stable_rounds >= 3:
                    return height
            else:
                stable_rounds = 0
                prev_height = height

            # Scroll to bottom
            await page.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)")
            await asyncio.sleep(0.6)
            await self._wait_for_load(page, timeout_ms=2000)

        return await page.evaluate(_PAGE_HEIGHT_JS)

    async def expand_all_collapsible(self, page) -> int:
        """Find and click all expandable/collapsible elements. Returns count expanded."""
        expanded = 0

        for selector in _EXPANDABLE_SELECTORS:
            try:
                elements = await page.locator(selector).all()
                for el in elements:
                    try:
                        visible = await el.is_visible()
                        if visible:
                            await el.click(timeout=2000)
                            await asyncio.sleep(0.2)
                            expanded += 1
                    except Exception:
                        pass
            except Exception:
                pass

        # Also click text-based "Load more" buttons
        load_more = await self._find_load_more_buttons(page)
        for selector in load_more:
            try:
                await page.locator(selector).first.click(timeout=2000)
                await asyncio.sleep(0.5)
                expanded += 1
            except Exception:
                pass

        return expanded

    async def detect_viewport_coverage(self, page) -> dict:
        """Return how much of the page has been scrolled through."""
        try:
            viewport_h = await page.evaluate(_VIEWPORT_HEIGHT_JS)
            page_h = await page.evaluate(_PAGE_HEIGHT_JS)
            scroll_top = await page.evaluate(_SCROLL_TOP_JS)
            seen = scroll_top + viewport_h
            coverage = min(100.0, seen / max(page_h, 1) * 100)
            return {
                "viewport_height": viewport_h,
                "page_height": page_h,
                "scroll_position": scroll_top,
                "coverage_pct": round(coverage, 1),
                "has_more": seen < page_h - 10,
            }
        except Exception:
            return {"viewport_height": 0, "page_height": 0, "coverage_pct": 0.0, "has_more": False, "scroll_position": 0}

    async def smooth_scroll(
        self, page, pixels: float, *, direction: str = "down"
    ) -> None:
        """Human-like scroll with micro-variations to avoid bot detection."""
        if direction == "up":
            pixels = -abs(pixels)
        else:
            pixels = abs(pixels)

        # Split into 3-5 micro-scrolls with random pauses
        steps = random.randint(3, 5)
        chunk = pixels / steps
        for _ in range(steps):
            variation = random.uniform(0.85, 1.15)
            await page.mouse.wheel(0, chunk * variation)
            await asyncio.sleep(random.uniform(0.04, 0.12))

    async def scroll_to_top(self, page) -> None:
        await page.evaluate("window.scrollTo(0, 0)")
        await asyncio.sleep(0.2)

    # ── Private helpers ───────────────────────────────────────────────────────

    async def _wait_for_load(self, page, *, timeout_ms: int = 3000) -> None:
        """Wait for network idle / no spinner."""
        try:
            await page.wait_for_load_state("networkidle", timeout=timeout_ms)
        except Exception:
            pass  # timeout is fine — page may have persistent connections

    async def _find_load_more_buttons(self, page) -> list[str]:
        """Detect "Load more" style buttons by text content."""
        found = []
        try:
            result = await page.evaluate(
                """() => {
                const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]'));
                const targets = """ + str(_LOAD_MORE_TEXT) + """;
                return buttons
                  .filter(el => {
                    const t = (el.textContent || '').toLowerCase().trim();
                    return targets.some(target => t.includes(target));
                  })
                  .map((el, i) => {
                    if (el.id) return '#' + el.id;
                    const cls = (el.className || '').split(' ').filter(Boolean)[0];
                    return cls ? el.tagName.toLowerCase() + '.' + cls : el.tagName.toLowerCase() + ':nth-of-type(' + (i+1) + ')';
                  });
              }"""
            )
            found = result or []
        except Exception:
            pass
        return found
