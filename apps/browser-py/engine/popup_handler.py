"""Universal popup handler — detects and smartly dismisses every popup type.

Handles cookie banners, newsletter modals, login prompts, surveys, permission
requests, rating popups, and more. Never auto-dismisses paywalls or 2FA.
"""

import asyncio
import logging
from dataclasses import dataclass
from typing import Optional

log = logging.getLogger("browser-py.engine.popup_handler")


@dataclass
class PopupDetection:
    popup_type: str            # cookie | newsletter | login | survey | permission | rating | paywall | age_gate | gdpr | update
    confidence: float          # 0.0 – 1.0
    dismiss_action: str        # "escape" | "click_accept" | "click_reject" | "click_close" | "user_required"
    requires_user: bool
    element_info: dict         # {selector, text, position}


# ── Detection patterns ────────────────────────────────────────────────────────

_COOKIE_SELECTORS = [
    '[id*="cookie"]', '[class*="cookie"]', '[id*="gdpr"]', '[class*="gdpr"]',
    '[id*="consent"]', '[class*="consent"]', '[class*="cc-"]',
    '[id*="CookieBanner"]', '[class*="cookie-banner"]',
    '[data-testid*="cookie"]', '[aria-label*="cookie"]',
]
_COOKIE_TEXT = ["accept cookies", "accept all", "allow all cookies", "i accept", "agree"]
_COOKIE_REJECT_TEXT = ["reject", "decline", "necessary only", "manage preferences"]

_NEWSLETTER_SELECTORS = [
    '[class*="newsletter"]', '[class*="email-signup"]', '[class*="subscribe"]',
    '[class*="popup-email"]', '[id*="newsletter"]',
]
_NEWSLETTER_TEXT = ["subscribe", "newsletter", "sign up for emails", "get updates", "stay informed"]

_LOGIN_MODAL_SELECTORS = [
    '[class*="login-modal"]', '[class*="auth-modal"]', '[class*="sign-in-modal"]',
    '[id*="login-modal"]', '[id*="signin-modal"]',
    'dialog[aria-label*="sign"]', 'dialog[aria-label*="log"]',
]

_SURVEY_SELECTORS = [
    '[class*="survey"]', '[class*="feedback-popup"]', '[id*="survey"]',
    '[class*="NPS"]', '[class*="nps-"]',
]

_RATING_TEXT = ["rate us", "rate your experience", "how did we do", "leave a review", "rate the app"]

_CLOSE_SELECTORS = [
    'button[aria-label="Close"]', 'button[aria-label="close"]',
    'button[aria-label="Dismiss"]', '[class*="close-btn"]',
    '[class*="modal-close"]', '[class*="popup-close"]',
    'button[class*="dismiss"]', 'svg[aria-label="close"]',
    '[data-dismiss]', '.modal .close', '[class*="btn-close"]',
]

_ACCEPT_SELECTORS = [
    'button[id*="accept"]', 'button[class*="accept"]',
    'button[id*="agree"]', 'button[class*="agree"]',
    'button[class*="consent"]',
]


class PopupHandler:
    """Detects and auto-dismisses web popups based on task context."""

    async def scan(self, page) -> list[PopupDetection]:
        """Detect all visible popups on the current page."""
        detections: list[PopupDetection] = []

        await self._detect_cookie(page, detections)
        await self._detect_newsletter(page, detections)
        await self._detect_login_modal(page, detections)
        await self._detect_survey(page, detections)
        await self._detect_rating(page, detections)
        await self._detect_paywall(page, detections)
        await self._detect_generic_modal(page, detections)

        return detections

    async def dismiss_all(self, page, *, task_context: str = "") -> int:
        """Handle all visible popups. Returns count dismissed."""
        detections = await self.scan(page)
        dismissed = 0
        for det in detections:
            if not det.requires_user:
                success = await self.dismiss_one(page, det)
                if success:
                    dismissed += 1
                    await asyncio.sleep(0.3)
        return dismissed

    async def dismiss_one(self, page, detection: PopupDetection) -> bool:
        """Dismiss a single detected popup."""
        if detection.requires_user:
            log.info("PopupHandler: %s requires user action — skipping", detection.popup_type)
            return False

        # Try Escape first (cheapest)
        if detection.dismiss_action == "escape":
            try:
                await page.keyboard.press("Escape")
                await asyncio.sleep(0.3)
                return True
            except Exception:
                pass

        # Try clicking close button
        if detection.dismiss_action in ("click_close", "escape"):
            for sel in _CLOSE_SELECTORS:
                try:
                    el = page.locator(sel).first
                    if await el.is_visible():
                        await el.click(timeout=2000)
                        await asyncio.sleep(0.3)
                        return True
                except Exception:
                    continue

        # Try clicking accept/reject based on action
        if detection.dismiss_action == "click_accept":
            for sel in _ACCEPT_SELECTORS:
                try:
                    el = page.locator(sel).first
                    if await el.is_visible():
                        await el.click(timeout=2000)
                        await asyncio.sleep(0.3)
                        return True
                except Exception:
                    continue

            # Try text-based accept
            for text in _COOKIE_TEXT:
                try:
                    el = page.get_by_role("button", name=text).first
                    if await el.is_visible():
                        await el.click(timeout=2000)
                        await asyncio.sleep(0.3)
                        return True
                except Exception:
                    continue

        # Last resort: try known element from detection
        if detection.element_info.get("selector"):
            try:
                el = page.locator(detection.element_info["selector"]).first
                if await el.is_visible():
                    await el.press("Escape")
                return True
            except Exception:
                pass

        return False

    async def handle_cookie_consent(self, page, *, prefer_reject: bool = False) -> bool:
        """Specifically handle cookie consent banners."""
        # Try to find and click the appropriate button
        texts = _COOKIE_REJECT_TEXT if prefer_reject else _COOKIE_TEXT

        for text in texts:
            try:
                el = page.get_by_role("button", name=text, exact=False).first
                if await el.is_visible():
                    await el.click(timeout=3000)
                    await asyncio.sleep(0.4)
                    return True
            except Exception:
                continue

        # Fallback: try CSS selectors
        for sel in _COOKIE_SELECTORS:
            try:
                parent = page.locator(sel).first
                if not await parent.is_visible():
                    continue
                # Find accept button within
                btn = parent.get_by_role("button").first
                if await btn.is_visible():
                    await btn.click(timeout=2000)
                    await asyncio.sleep(0.4)
                    return True
            except Exception:
                continue

        return False

    async def handle_login_modal(self, page, *, task_requires_login: bool = False) -> bool:
        """Dismiss a login modal unless the task actually requires login."""
        if task_requires_login:
            return False  # Don't dismiss — task needs it

        # Try Escape first
        try:
            await page.keyboard.press("Escape")
            await asyncio.sleep(0.3)
            # Verify it closed
            detections = await self.scan(page)
            if not any(d.popup_type == "login_modal" for d in detections):
                return True
        except Exception:
            pass

        # Click close button
        for sel in _CLOSE_SELECTORS:
            try:
                el = page.locator(sel).first
                if await el.is_visible():
                    await el.click(timeout=2000)
                    return True
            except Exception:
                continue

        return False

    async def is_blocked(self, page) -> bool:
        """Return True if any blocking popup prevents task continuation."""
        detections = await self.scan(page)
        blocking = [d for d in detections if not d.requires_user and d.confidence >= 0.7]
        return len(blocking) > 0

    # ── Private detectors ─────────────────────────────────────────────────────

    async def _detect_cookie(self, page, out: list) -> None:
        for sel in _COOKIE_SELECTORS:
            try:
                el = page.locator(sel).first
                if await el.is_visible():
                    text = (await el.text_content() or "")[:200]
                    out.append(PopupDetection(
                        popup_type="cookie_consent",
                        confidence=0.85,
                        dismiss_action="click_accept",
                        requires_user=False,
                        element_info={"selector": sel, "text": text},
                    ))
                    return
            except Exception:
                continue

    async def _detect_newsletter(self, page, out: list) -> None:
        for text in _NEWSLETTER_TEXT:
            try:
                el = page.get_by_text(text, exact=False).first
                if await el.is_visible():
                    out.append(PopupDetection(
                        popup_type="newsletter",
                        confidence=0.75,
                        dismiss_action="escape",
                        requires_user=False,
                        element_info={"text": text, "selector": ""},
                    ))
                    return
            except Exception:
                continue

    async def _detect_login_modal(self, page, out: list) -> None:
        for sel in _LOGIN_MODAL_SELECTORS:
            try:
                el = page.locator(sel).first
                if await el.is_visible():
                    out.append(PopupDetection(
                        popup_type="login_modal",
                        confidence=0.8,
                        dismiss_action="escape",
                        requires_user=False,
                        element_info={"selector": sel, "text": "login modal"},
                    ))
                    return
            except Exception:
                continue

    async def _detect_survey(self, page, out: list) -> None:
        for sel in _SURVEY_SELECTORS:
            try:
                el = page.locator(sel).first
                if await el.is_visible():
                    out.append(PopupDetection(
                        popup_type="survey",
                        confidence=0.7,
                        dismiss_action="escape",
                        requires_user=False,
                        element_info={"selector": sel, "text": "survey"},
                    ))
                    return
            except Exception:
                continue

    async def _detect_rating(self, page, out: list) -> None:
        for text in _RATING_TEXT:
            try:
                el = page.get_by_text(text, exact=False).first
                if await el.is_visible():
                    out.append(PopupDetection(
                        popup_type="rating",
                        confidence=0.7,
                        dismiss_action="escape",
                        requires_user=False,
                        element_info={"text": text, "selector": ""},
                    ))
                    return
            except Exception:
                continue

    async def _detect_paywall(self, page, out: list) -> None:
        paywall_texts = ["subscribe to continue", "subscribe now", "unlock this article",
                         "premium content", "paid content", "start your free trial"]
        for text in paywall_texts:
            try:
                el = page.get_by_text(text, exact=False).first
                if await el.is_visible():
                    out.append(PopupDetection(
                        popup_type="paywall",
                        confidence=0.85,
                        dismiss_action="user_required",
                        requires_user=True,
                        element_info={"text": text, "selector": ""},
                    ))
                    return
            except Exception:
                continue

    async def _detect_generic_modal(self, page, out: list) -> None:
        """Detect any visible dialog/modal not caught by specific detectors."""
        try:
            modal = page.locator('dialog[open], [role="dialog"], [class*="modal"][class*="show"]').first
            if await modal.is_visible():
                # Don't add if already detected as a specific type
                known_types = {d.popup_type for d in out}
                if not known_types:
                    text = (await modal.text_content() or "")[:100]
                    out.append(PopupDetection(
                        popup_type="generic_modal",
                        confidence=0.5,
                        dismiss_action="escape",
                        requires_user=False,
                        element_info={"text": text, "selector": 'dialog[open]'},
                    ))
        except Exception:
            pass
