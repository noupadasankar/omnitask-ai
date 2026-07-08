"""Shared fixtures and helpers for browser engine tests.

Run from apps/browser-py/:
    pytest engine/tests/ -v

No live browser required — all tests use MockPage or pure-Python logic.
"""

import asyncio
import sys
from pathlib import Path

# Make 'engine' importable as a package when running from apps/browser-py/
sys.path.insert(0, str(Path(__file__).parent.parent.parent))


# ── Async helper ─────────────────────────────────────────────────────────────

def run(coro):
    """Run a coroutine synchronously. Used in sync test functions."""
    return asyncio.run(coro)


# ── Mock ground truth providers ───────────────────────────────────────────────

class AlwaysConfirmsProvider:
    """Ground truth provider that confirms immediately."""

    def confirmation_timeout(self):
        return 5

    def retry_schedule(self):
        return []

    async def check_confirmation(self, context):
        from engine.outcome_model import ConfirmationResult
        import time
        return ConfirmationResult(
            confirmed=True,
            outcome_state="confirmed",
            evidence={"order_id": "TEST-001", "source": "mock"},
            confidence=0.99,
            checked_at=time.time(),
            check_count=1,
            latency_ms=1.0,
            reason="Mock confirmation",
        )


class NeverConfirmsProvider:
    """Ground truth provider that never confirms (short timeout → UNCONFIRMED)."""

    def confirmation_timeout(self):
        return 1   # 1 second — will expire quickly in tests

    def retry_schedule(self):
        return []

    async def check_confirmation(self, context):
        from engine.outcome_model import ConfirmationResult
        import time
        return ConfirmationResult(
            confirmed=False,
            outcome_state="confirmation_pending",
            evidence={},
            confidence=0.0,
            checked_at=time.time(),
            check_count=1,
            latency_ms=1.0,
            reason="No evidence found",
        )


class SlowConfirmsProvider:
    """Ground truth provider that never confirms within a long timeout → CONFIRMATION_PENDING."""

    def confirmation_timeout(self):
        return 120   # long timeout — triggers CONFIRMATION_PENDING, not UNCONFIRMED

    def retry_schedule(self):
        return []

    async def check_confirmation(self, context):
        from engine.outcome_model import ConfirmationResult
        import time
        return ConfirmationResult(
            confirmed=False,
            outcome_state="confirmation_pending",
            evidence={},
            confidence=0.0,
            checked_at=time.time(),
            check_count=1,
            latency_ms=1.0,
            reason="ATS not yet updated",
        )


# ── Controlled MockPage ───────────────────────────────────────────────────────

class ControlledMockPage:
    """MockPage where evaluate() return value is fully controllable per-test."""

    def __init__(self, evaluate_returns=None, url="https://example.com", cookies=None):
        self._returns = evaluate_returns or {}   # pattern → return value
        self.url = url
        self._cookies = cookies or []
        self.viewport_size = {"width": 1280, "height": 720}

    async def evaluate(self, expression, arg=None):
        for pattern, value in self._returns.items():
            if pattern in expression:
                return value
        return None

    async def content(self):
        return self._returns.get("outerHTML", "<html></html>")

    async def wait_for_load_state(self, state="load", timeout=30000):
        return

    async def wait_for_selector(self, selector, **kwargs):
        return

    def locator(self, selector):
        from engine.fixture_replay import MockLocator
        return MockLocator(selector, [])

    @property
    def context(self):
        cookies = self._cookies

        class _Ctx:
            async def cookies(self_inner):
                return cookies

        return _Ctx()

    @property
    def accessibility(self):
        class _A11y:
            async def snapshot(self_inner):
                return {}
        return _A11y()
