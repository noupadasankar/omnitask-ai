"""Ground truth providers — domain-specific independent outcome confirmation.

Each domain plugin implements GroundTruthProvider to check whether the
intended outcome occurred, separate from whether browser actions completed.

Confirmation latency by domain (approximate):
  Food:     0–10 seconds  (synchronous order confirmation page)
  Travel:   0–20 seconds  (booking reference immediate)
  Shopping: 0–15 seconds  (order number on confirmation page)
  Email:    0–10 seconds  (Sent folder or confirmation toast)
  Job:      30–90 seconds (ATS record can lag significantly)
  Generic:  0–15 seconds  (heuristic page signal scan)
"""

import logging
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass

from .outcome_model import ConfirmationResult

log = logging.getLogger("browser-py.engine.ground_truth")


class GroundTruthProvider(ABC):
    """Base class for domain-specific outcome confirmation."""

    @abstractmethod
    async def check_confirmation(self, context: dict) -> ConfirmationResult:
        """Check for independent evidence that the intended outcome occurred."""

    @abstractmethod
    def confirmation_timeout(self) -> int:
        """Max seconds to wait before marking UNCONFIRMED."""

    @abstractmethod
    def retry_schedule(self) -> list:
        """Seconds between retry attempts (not including the first check at t=0)."""

    def _ok(self, evidence: dict, confidence: float = 0.92, reason: str = "") -> ConfirmationResult:
        return ConfirmationResult(
            confirmed=True,
            outcome_state="confirmed",
            evidence=evidence,
            confidence=confidence,
            checked_at=time.time(),
            check_count=0,
            latency_ms=0.0,
            reason=reason or "Evidence found",
        )

    def _pending(self, reason: str = "", evidence=None) -> ConfirmationResult:
        return ConfirmationResult(
            confirmed=False,
            outcome_state="confirmation_pending",
            evidence=evidence or {},
            confidence=0.0,
            checked_at=time.time(),
            check_count=0,
            latency_ms=0.0,
            reason=reason or "Evidence not yet available",
        )


class FoodOrderGroundTruth(GroundTruthProvider):
    """Confirms food order via order ID or confirmation page text."""

    def confirmation_timeout(self) -> int:
        return 30

    def retry_schedule(self) -> list:
        return [3, 7]

    async def check_confirmation(self, context: dict) -> ConfirmationResult:
        page = context.get("page")
        if not page:
            return self._pending("No page in context")
        try:
            r = await page.evaluate("""() => {
                const text = document.body.innerText || '';
                const confirmed = /your order|order confirmed|order placed|thank you for your order/i.test(text);
                const m = text.match(/order[\\s#]*([A-Z0-9\\-]{6,20})/i);
                return { confirmed, order_id: m ? m[1] : null };
            }""")
            if r and r.get("confirmed"):
                return self._ok(
                    evidence={"order_id": r.get("order_id"), "source": "confirmation_page"},
                    confidence=0.92,
                    reason=f"Order confirmation found (ID: {r.get('order_id', 'unknown')})",
                )
        except Exception as exc:
            log.debug("FoodOrderGroundTruth: %s", exc)
        return self._pending("Order confirmation text not detected")


class JobApplicationGroundTruth(GroundTruthProvider):
    """Confirms job application via on-page confirmation or URL pattern."""

    def confirmation_timeout(self) -> int:
        return 90   # ATS records can lag 30–60s

    def retry_schedule(self) -> list:
        return [5, 15, 30, 60]

    async def check_confirmation(self, context: dict) -> ConfirmationResult:
        page = context.get("page")
        if not page:
            return self._pending("No page in context")
        try:
            r = await page.evaluate("""() => {
                const text = document.body.innerText || '';
                const submitted = /application submitted|applied successfully|your application|thank you for applying/i.test(text);
                const url = window.location.href;
                const on_confirm = /applied|success|confirmation|thank/i.test(url);
                const m = text.match(/application[\\s#]*([A-Z0-9\\-]{4,20})/i);
                return { submitted, on_confirm, application_id: m ? m[1] : null };
            }""")
            if r and (r.get("submitted") or r.get("on_confirm")):
                return self._ok(
                    evidence={"application_id": r.get("application_id"), "source": "confirmation_page"},
                    confidence=0.88,
                    reason="Application submission confirmed on page",
                )
        except Exception as exc:
            log.debug("JobApplicationGroundTruth: %s", exc)
        return self._pending("Application confirmation not found — ATS may not have updated yet")


class TravelBookingGroundTruth(GroundTruthProvider):
    """Confirms travel booking via booking reference on confirmation page."""

    def confirmation_timeout(self) -> int:
        return 20

    def retry_schedule(self) -> list:
        return [5, 10]

    async def check_confirmation(self, context: dict) -> ConfirmationResult:
        page = context.get("page")
        if not page:
            return self._pending("No page in context")
        try:
            r = await page.evaluate("""() => {
                const text = document.body.innerText || '';
                const confirmed = /booking confirmed|reservation confirmed|your booking|confirmation number/i.test(text);
                const m = text.match(/(?:booking|confirmation|reservation)[\\s#:]*([A-Z0-9]{5,15})/i);
                return { confirmed, booking_ref: m ? m[1] : null };
            }""")
            if r and r.get("confirmed"):
                return self._ok(
                    evidence={"booking_ref": r.get("booking_ref"), "source": "confirmation_page"},
                    confidence=0.95,
                    reason=f"Booking reference: {r.get('booking_ref', 'unknown')}",
                )
        except Exception as exc:
            log.debug("TravelBookingGroundTruth: %s", exc)
        return self._pending("Booking confirmation not found")


class ShoppingOrderGroundTruth(GroundTruthProvider):
    """Confirms purchase via order number on confirmation page."""

    def confirmation_timeout(self) -> int:
        return 15

    def retry_schedule(self) -> list:
        return [3, 7]

    async def check_confirmation(self, context: dict) -> ConfirmationResult:
        page = context.get("page")
        if not page:
            return self._pending("No page in context")
        try:
            r = await page.evaluate("""() => {
                const text = document.body.innerText || '';
                const confirmed = /order placed|order confirmed|thank you for your order|order number/i.test(text);
                const m = text.match(/order[\\s#:]*([0-9\\-]{5,20})/i);
                return { confirmed, order_number: m ? m[1] : null };
            }""")
            if r and r.get("confirmed"):
                return self._ok(
                    evidence={"order_number": r.get("order_number"), "source": "confirmation_page"},
                    confidence=0.93,
                    reason=f"Order confirmed: {r.get('order_number', 'unknown')}",
                )
        except Exception as exc:
            log.debug("ShoppingOrderGroundTruth: %s", exc)
        return self._pending("Order confirmation page not detected")


class EmailSentGroundTruth(GroundTruthProvider):
    """Confirms email sent via toast message or Sent folder URL."""

    def confirmation_timeout(self) -> int:
        return 10

    def retry_schedule(self) -> list:
        return [2, 5]

    async def check_confirmation(self, context: dict) -> ConfirmationResult:
        page = context.get("page")
        if not page:
            return self._pending("No page in context")
        try:
            r = await page.evaluate("""() => {
                const text = document.body.innerText || '';
                const sent = /message sent|email sent|your message has been sent/i.test(text);
                const in_sent = /sent/i.test(window.location.href);
                return { sent, in_sent };
            }""")
            if r and (r.get("sent") or r.get("in_sent")):
                return self._ok(
                    evidence={"source": "sent_confirmation"},
                    confidence=0.90,
                    reason="Email sent confirmation detected",
                )
        except Exception as exc:
            log.debug("EmailSentGroundTruth: %s", exc)
        return self._pending("Sent confirmation not found")


class GenericGroundTruth(GroundTruthProvider):
    """Fallback: checks for generic success signals on any page."""

    def confirmation_timeout(self) -> int:
        return 15

    def retry_schedule(self) -> list:
        return [5]

    async def check_confirmation(self, context: dict) -> ConfirmationResult:
        page = context.get("page")
        if not page:
            return self._pending("No page in context")
        try:
            r = await page.evaluate("""() => {
                const text = (document.body.innerText || '').toLowerCase();
                const ok = ['success', 'confirmed', 'complete', 'submitted', 'thank you', 'done'];
                const bad = ['error', 'failed', 'invalid', 'please try again'];
                return {
                    has_success: ok.some(p => text.includes(p)),
                    has_error: bad.some(p => text.includes(p)),
                };
            }""")
            if r and r.get("has_success") and not r.get("has_error"):
                return self._ok(
                    evidence={"source": "generic_page_signals"},
                    confidence=0.65,    # lower — heuristic only
                    reason="Generic success signals detected on page",
                )
        except Exception as exc:
            log.debug("GenericGroundTruth: %s", exc)
        return self._pending("No success signals detected")


# ── Registry ──────────────────────────────────────────────────────────────────

_DOMAIN_PROVIDERS: dict = {
    "food": FoodOrderGroundTruth,
    "job": JobApplicationGroundTruth,
    "travel": TravelBookingGroundTruth,
    "shopping": ShoppingOrderGroundTruth,
    "email": EmailSentGroundTruth,
}


def get_ground_truth_provider(domain: str) -> GroundTruthProvider:
    """Return the appropriate GroundTruthProvider for a domain string."""
    cls = _DOMAIN_PROVIDERS.get(domain.lower(), GenericGroundTruth)
    return cls()
