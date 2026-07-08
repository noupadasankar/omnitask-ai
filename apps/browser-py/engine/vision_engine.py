"""Vision engine — DOM/screenshot comparison, visual reasoning, element detection by coordinate.

Uses the existing AIClient for screenshot analysis. Provides OCR-like text extraction,
visual element detection, and page-state comparison via screenshot hashing.
"""

import asyncio
import base64
import hashlib
import logging
import re
from dataclasses import dataclass
from typing import Optional

log = logging.getLogger("browser-py.engine.vision_engine")


@dataclass
class VisualElement:
    description: str
    x: float
    y: float
    width: float
    height: float
    element_type: str     # button|input|text|image|icon|table|list
    confidence: float
    selector_hint: str    # best guess at a selector


@dataclass
class VisualDiff:
    changed: bool
    change_type: str      # "navigation"|"modal_appeared"|"content_changed"|"form_submitted"|"error_appeared"|"minor"
    confidence: float
    regions_changed: list  # [{x, y, w, h, description}]
    before_hash: str
    after_hash: str


@dataclass
class PageClassification:
    page_type: str        # same as SemanticPage.get_page_purpose output
    confidence: float
    key_elements: list    # [{type, description, selector_hint}]
    blockers: list        # ["captcha", "login_wall", "cookie_banner", ...]
    recommended_action: str


class VisionEngine:
    """AI-powered visual reasoning over browser screenshots."""

    def __init__(self, ai_client=None):
        """
        ai_client: instance of AIClient from apps/browser-py/ai.py
                   If None, operates in DOM-only mode (screenshot analysis disabled).
        """
        self._ai = ai_client

    async def capture_screenshot(self, page) -> Optional[str]:
        """Capture a base64-encoded JPEG screenshot of the current page."""
        try:
            screenshot_bytes = await page.screenshot(
                type="jpeg",
                quality=75,
                full_page=False,  # visible viewport only
            )
            return base64.b64encode(screenshot_bytes).decode("utf-8")
        except Exception as exc:
            log.warning("capture_screenshot failed: %s", exc)
            return None

    async def screenshot_hash(self, page) -> str:
        """Compute a hash of the current screenshot for change detection."""
        b64 = await self.capture_screenshot(page)
        if not b64:
            return "unknown"
        return hashlib.md5(base64.b64decode(b64)).hexdigest()[:12]

    async def detect_change(
        self,
        page,
        before_screenshot_hash: str,
        *,
        before_url: str = "",
    ) -> VisualDiff:
        """Compare current state to a previous screenshot hash."""
        after_hash = await self.screenshot_hash(page)
        after_url = ""
        try:
            after_url = page.url
        except Exception:
            pass

        changed = after_hash != before_screenshot_hash

        # Classify the change type
        change_type = "minor"
        confidence = 0.5

        if before_url and after_url and before_url != after_url:
            change_type = "navigation"
            confidence = 0.95
        elif changed:
            # Try to classify via DOM
            try:
                classification = await page.evaluate("""() => {
                    const modal = document.querySelector('dialog[open], [role="dialog"]');
                    const error = document.querySelector('[class*="error"][class*="visible"], [role="alert"]');
                    const form = document.querySelector('form');
                    if (modal) return 'modal_appeared';
                    if (error) return 'error_appeared';
                    return 'content_changed';
                }""")
                change_type = classification or "content_changed"
                confidence = 0.75
            except Exception:
                change_type = "content_changed"
                confidence = 0.6

        return VisualDiff(
            changed=changed,
            change_type=change_type,
            confidence=confidence,
            regions_changed=[],
            before_hash=before_screenshot_hash,
            after_hash=after_hash,
        )

    async def classify_page(self, page, *, use_ai: bool = True) -> PageClassification:
        """Classify the current page type and detect blockers."""
        # DOM-based classification first (fast)
        dom_result = await page.evaluate("""() => {
            const text = (document.body.innerText || '').toLowerCase();
            const url = window.location.href.toLowerCase();
            const title = document.title.toLowerCase();

            const blockers = [];
            if (/captcha|are you a robot|recaptcha|hcaptcha/.test(text)) blockers.push('captcha');
            if (document.querySelector('input[type="password"]') && /sign.?in|log.?in/i.test(text)) blockers.push('login_wall');
            if (document.querySelector('[class*="cookie"], [id*="cookie"], [class*="consent"]')) blockers.push('cookie_banner');
            if (/subscribe to continue|premium only|paywall/.test(text)) blockers.push('paywall');
            if (/too many requests|rate limit|429/.test(text)) blockers.push('rate_limit');

            const pageType = (() => {
                if (/checkout|payment/.test(url)) return 'checkout';
                if (/cart|basket/.test(url)) return 'cart';
                if (/login|signin|sign-in/.test(url)) return 'login';
                if (/register|signup/.test(url)) return 'signup';
                if (/search|results|listing/.test(url)) return 'search_results';
                if (/product|item|dp[/]/.test(url)) return 'product_detail';
                if (/confirm|success|thank/.test(text)) return 'confirmation';
                if (/profile|account|settings/.test(url)) return 'profile';
                if (document.querySelector('form')) return 'form';
                return 'general';
            })();

            const elements = [];
            const cta = document.querySelector('button[type="submit"], .cta-btn, [class*="primary-btn"]');
            if (cta) elements.push({type: 'button', description: (cta.textContent || '').trim().slice(0, 50), selector_hint: 'button[type="submit"]'});

            return {page_type: pageType, blockers, key_elements: elements};
        }""")

        page_type = dom_result.get("page_type", "general")
        blockers = dom_result.get("blockers", [])
        key_elements = dom_result.get("key_elements", [])

        # If AI client available and page type unclear, use vision
        if use_ai and self._ai and page_type == "general":
            try:
                b64 = await self.capture_screenshot(page)
                if b64:
                    vision_result = await self._ai.decide_action(
                        b64,
                        dom_nodes=[],
                        task="Classify this page: what type is it? List any blockers.",
                    )
                    if isinstance(vision_result, dict):
                        page_type = vision_result.get("page_type", page_type)
            except Exception:
                pass

        recommended = "proceed"
        if "captcha" in blockers:
            recommended = "pause_for_captcha"
        elif "login_wall" in blockers:
            recommended = "handle_login"
        elif "cookie_banner" in blockers:
            recommended = "dismiss_cookie_banner"
        elif "rate_limit" in blockers:
            recommended = "wait_60s"

        return PageClassification(
            page_type=page_type,
            confidence=0.85 if blockers or page_type != "general" else 0.6,
            key_elements=key_elements,
            blockers=blockers,
            recommended_action=recommended,
        )

    async def find_element_by_coordinate(
        self, page, x: float, y: float, *, radius: int = 5
    ) -> Optional[VisualElement]:
        """Find the DOM element at or near a given coordinate."""
        try:
            result = await page.evaluate(
                """([x, y, r]) => {
                const el = document.elementFromPoint(x, y);
                if (!el) return null;
                const rect = el.getBoundingClientRect();
                const tag = el.tagName.toLowerCase();
                const role = el.getAttribute('role') || tag;
                const text = (el.textContent || el.value || '').trim().slice(0, 80);
                const ariaLabel = el.getAttribute('aria-label') || '';
                const id = el.id;
                const cls = (el.className || '').split(' ').filter(Boolean).slice(0, 2).join('.');
                const selector = id ? '#' + id : (cls ? tag + '.' + cls : tag);
                return {tag, role, text, ariaLabel, selector, x: rect.x, y: rect.y, w: rect.width, h: rect.height};
            }""",
                [x, y, radius],
            )

            if not result:
                return None

            elem_type = self._classify_element_type(result)
            return VisualElement(
                description=result.get("text") or result.get("ariaLabel") or result.get("tag", ""),
                x=result.get("x", x),
                y=result.get("y", y),
                width=result.get("w", 0),
                height=result.get("h", 0),
                element_type=elem_type,
                confidence=0.9,
                selector_hint=result.get("selector", ""),
            )
        except Exception as exc:
            log.debug("find_element_by_coordinate failed: %s", exc)
            return None

    async def extract_text_from_region(
        self,
        page,
        x: float,
        y: float,
        width: float,
        height: float,
    ) -> str:
        """Extract text content from a rectangular region of the page."""
        try:
            return await page.evaluate(
                """([x, y, w, h]) => {
                const elements = document.elementsFromPoint(x + w/2, y + h/2);
                const texts = elements
                    .filter(el => {
                        const rect = el.getBoundingClientRect();
                        return rect.left >= x && rect.top >= y && rect.right <= x + w && rect.bottom <= y + h;
                    })
                    .map(el => (el.textContent || '').trim())
                    .filter(t => t.length > 0);
                return [...new Set(texts)].join(' ');
            }""",
                [x, y, width, height],
            )
        except Exception:
            return ""

    async def detect_blockers(self, page) -> list[str]:
        """Quick check for common blockers without full page classification."""
        classification = await self.classify_page(page, use_ai=False)
        return classification.blockers

    async def wait_for_visual_change(
        self,
        page,
        before_hash: str,
        *,
        timeout_ms: int = 8000,
        poll_interval_ms: int = 300,
    ) -> bool:
        """Wait until the page visually changes from the before state."""
        deadline = asyncio.get_event_loop().time() + timeout_ms / 1000
        while asyncio.get_event_loop().time() < deadline:
            after = await self.screenshot_hash(page)
            if after != before_hash:
                return True
            await asyncio.sleep(poll_interval_ms / 1000)
        return False

    # ── Private helpers ───────────────────────────────────────────────────────

    def _classify_element_type(self, el_info: dict) -> str:
        tag = el_info.get("tag", "")
        role = el_info.get("role", "")
        text = (el_info.get("text", "") or "").lower()

        if tag in ("button",) or role == "button":
            return "button"
        if tag in ("input", "textarea", "select") or role in ("textbox", "combobox"):
            return "input"
        if tag == "a" or role == "link":
            return "link"
        if tag in ("img", "svg", "picture") or role == "img":
            return "image"
        if tag in ("table", "thead", "tbody", "tr"):
            return "table"
        if tag in ("ul", "ol", "li") or role == "list":
            return "list"
        if tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            return "heading"
        return "text"
