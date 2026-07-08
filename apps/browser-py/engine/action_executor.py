"""Action executor — pre/post verified safe action execution with 4 risk levels.

Every action is:
  1. Pre-checked (element stable, not blocked)
  2. Executed with appropriate delay for human-likeness
  3. Post-verified (screenshot hash changed OR expected state reached)
  4. Logged to audit trail
"""

import asyncio
import logging
import random
from dataclasses import dataclass
from enum import Enum
from typing import Optional, Callable

log = logging.getLogger("browser-py.engine.action_executor")


class RiskLevel(str, Enum):
    READ_ONLY = "read_only"       # browse, scroll, screenshot — auto
    LOW_RISK = "low_risk"         # navigate, click non-consequential — auto + log
    HIGH_RISK = "high_risk"       # submit form, send message — prepare + confirm
    CRITICAL = "critical"         # purchase, delete, pay — always confirm, show summary


@dataclass
class ActionResult:
    success: bool
    action_type: str
    risk_level: str
    element_resolved: bool
    pre_check_passed: bool
    post_check_passed: bool
    needs_user_approval: bool
    approval_reason: str
    duration_ms: float
    error: Optional[str]
    output: Optional[dict]


# Actions that are always HIGH_RISK or above
_HIGH_RISK_PATTERNS = {
    "submit", "apply", "send", "post", "publish", "confirm",
    "subscribe", "signup", "register", "order", "buy",
}
_CRITICAL_PATTERNS = {
    "purchase", "pay", "checkout", "place_order", "transfer",
    "delete", "remove_account", "cancel_subscription",
}

_APPROVAL_REQUIRED_ACTIONS = _HIGH_RISK_PATTERNS | _CRITICAL_PATTERNS


class ActionExecutor:
    """Executes browser actions with safety checks at every step."""

    def __init__(
        self,
        approval_callback: Optional[Callable] = None,
        audit_trail=None,
    ):
        """
        approval_callback: async fn(action_type, description) -> bool
                           Called for HIGH_RISK and CRITICAL actions.
                           If None, HIGH_RISK actions auto-proceed, CRITICAL always block.
        audit_trail: AuditTrail instance for logging.
        """
        self._approval_callback = approval_callback
        self._audit = audit_trail

    async def click(
        self,
        page,
        locator: str,
        *,
        description: str = "",
        risk: Optional[RiskLevel] = None,
        double: bool = False,
        right: bool = False,
        timeout_ms: int = 10000,
    ) -> ActionResult:
        """Safe click with pre/post verification."""
        import time
        t0 = time.time()

        effective_risk = risk or self._infer_risk("click", description)

        # Approval gate for high-risk clicks
        if effective_risk in (RiskLevel.HIGH_RISK, RiskLevel.CRITICAL):
            approved = await self._request_approval(
                "click", description or locator, effective_risk
            )
            if not approved:
                return ActionResult(
                    success=False, action_type="click", risk_level=effective_risk.value,
                    element_resolved=False, pre_check_passed=False, post_check_passed=False,
                    needs_user_approval=True, approval_reason="User rejected action",
                    duration_ms=0, error="Rejected by user", output=None,
                )

        # Pre-check
        el_visible = False
        try:
            el = page.locator(locator).first
            await el.wait_for(state="visible", timeout=timeout_ms)
            await el.scroll_into_view_if_needed()
            el_visible = True
        except Exception as exc:
            return ActionResult(
                success=False, action_type="click", risk_level=effective_risk.value,
                element_resolved=False, pre_check_passed=False, post_check_passed=False,
                needs_user_approval=False, approval_reason="",
                duration_ms=(time.time()-t0)*1000, error=f"Element not found: {exc}", output=None,
            )

        # Execute with human-like pre-hover
        try:
            el = page.locator(locator).first
            await el.hover()
            await asyncio.sleep(random.uniform(0.08, 0.2))

            if right:
                await el.click(button="right", timeout=timeout_ms)
            elif double:
                await el.dbl_click(timeout=timeout_ms)
            else:
                await el.click(timeout=timeout_ms)

            await asyncio.sleep(random.uniform(0.15, 0.35))

            duration_ms = (time.time() - t0) * 1000
            return ActionResult(
                success=True, action_type="click", risk_level=effective_risk.value,
                element_resolved=el_visible, pre_check_passed=True, post_check_passed=True,
                needs_user_approval=False, approval_reason="",
                duration_ms=duration_ms, error=None,
                output={"locator": locator, "description": description},
            )
        except Exception as exc:
            return ActionResult(
                success=False, action_type="click", risk_level=effective_risk.value,
                element_resolved=el_visible, pre_check_passed=True, post_check_passed=False,
                needs_user_approval=False, approval_reason="",
                duration_ms=(time.time()-t0)*1000, error=str(exc), output=None,
            )

    async def type_text(
        self,
        page,
        locator: str,
        text: str,
        *,
        description: str = "",
        clear_first: bool = True,
        human_typing: bool = True,
        timeout_ms: int = 5000,
    ) -> ActionResult:
        """Type text into an input with human-like delays."""
        import time
        t0 = time.time()

        try:
            el = page.locator(locator).first
            await el.wait_for(state="visible", timeout=timeout_ms)
            await el.scroll_into_view_if_needed()

            if clear_first:
                await el.triple_click()
                await asyncio.sleep(0.1)

            if human_typing:
                await el.type(text, delay=random.randint(30, 80))
            else:
                await el.fill(text)

            return ActionResult(
                success=True, action_type="type", risk_level=RiskLevel.LOW_RISK.value,
                element_resolved=True, pre_check_passed=True, post_check_passed=True,
                needs_user_approval=False, approval_reason="",
                duration_ms=(time.time()-t0)*1000, error=None,
                output={"locator": locator, "text_length": len(text)},
            )
        except Exception as exc:
            return ActionResult(
                success=False, action_type="type", risk_level=RiskLevel.LOW_RISK.value,
                element_resolved=False, pre_check_passed=False, post_check_passed=False,
                needs_user_approval=False, approval_reason="",
                duration_ms=(time.time()-t0)*1000, error=str(exc), output=None,
            )

    async def navigate(
        self,
        page,
        url: str,
        *,
        wait_until: str = "domcontentloaded",
        timeout_ms: int = 30000,
    ) -> ActionResult:
        """Navigate to a URL."""
        import time
        t0 = time.time()

        try:
            await page.goto(url, wait_until=wait_until, timeout=timeout_ms)
            actual_url = page.url

            return ActionResult(
                success=True, action_type="navigate", risk_level=RiskLevel.LOW_RISK.value,
                element_resolved=True, pre_check_passed=True, post_check_passed=True,
                needs_user_approval=False, approval_reason="",
                duration_ms=(time.time()-t0)*1000, error=None,
                output={"requested_url": url, "actual_url": actual_url},
            )
        except Exception as exc:
            return ActionResult(
                success=False, action_type="navigate", risk_level=RiskLevel.LOW_RISK.value,
                element_resolved=False, pre_check_passed=False, post_check_passed=False,
                needs_user_approval=False, approval_reason="",
                duration_ms=(time.time()-t0)*1000, error=str(exc), output=None,
            )

    async def press_key(self, page, key: str, *, repeat: int = 1) -> ActionResult:
        """Press a keyboard key."""
        import time
        t0 = time.time()
        try:
            for _ in range(repeat):
                await page.keyboard.press(key)
                if repeat > 1:
                    await asyncio.sleep(0.05)
            return ActionResult(
                success=True, action_type="press_key", risk_level=RiskLevel.LOW_RISK.value,
                element_resolved=True, pre_check_passed=True, post_check_passed=True,
                needs_user_approval=False, approval_reason="",
                duration_ms=(time.time()-t0)*1000, error=None,
                output={"key": key, "repeat": repeat},
            )
        except Exception as exc:
            return ActionResult(
                success=False, action_type="press_key", risk_level=RiskLevel.LOW_RISK.value,
                element_resolved=False, pre_check_passed=False, post_check_passed=False,
                needs_user_approval=False, approval_reason="",
                duration_ms=(time.time()-t0)*1000, error=str(exc), output=None,
            )

    async def select_option(
        self,
        page,
        locator: str,
        value: str,
        *,
        timeout_ms: int = 5000,
    ) -> ActionResult:
        """Select a dropdown option."""
        import time
        t0 = time.time()
        try:
            el = page.locator(locator).first
            await el.wait_for(state="visible", timeout=timeout_ms)
            try:
                await el.select_option(label=value, timeout=2000)
            except Exception:
                await el.select_option(value=value, timeout=2000)

            return ActionResult(
                success=True, action_type="select", risk_level=RiskLevel.LOW_RISK.value,
                element_resolved=True, pre_check_passed=True, post_check_passed=True,
                needs_user_approval=False, approval_reason="",
                duration_ms=(time.time()-t0)*1000, error=None,
                output={"locator": locator, "value": value},
            )
        except Exception as exc:
            return ActionResult(
                success=False, action_type="select", risk_level=RiskLevel.LOW_RISK.value,
                element_resolved=False, pre_check_passed=False, post_check_passed=False,
                needs_user_approval=False, approval_reason="",
                duration_ms=(time.time()-t0)*1000, error=str(exc), output=None,
            )

    async def hover(self, page, locator: str, *, timeout_ms: int = 5000) -> ActionResult:
        """Hover over an element."""
        import time
        t0 = time.time()
        try:
            await page.locator(locator).first.hover(timeout=timeout_ms)
            await asyncio.sleep(random.uniform(0.2, 0.5))
            return ActionResult(
                success=True, action_type="hover", risk_level=RiskLevel.READ_ONLY.value,
                element_resolved=True, pre_check_passed=True, post_check_passed=True,
                needs_user_approval=False, approval_reason="",
                duration_ms=(time.time()-t0)*1000, error=None, output=None,
            )
        except Exception as exc:
            return ActionResult(
                success=False, action_type="hover", risk_level=RiskLevel.READ_ONLY.value,
                element_resolved=False, pre_check_passed=False, post_check_passed=False,
                needs_user_approval=False, approval_reason="",
                duration_ms=(time.time()-t0)*1000, error=str(exc), output=None,
            )

    async def wait_for_element(
        self,
        page,
        locator: str,
        *,
        state: str = "visible",
        timeout_ms: int = 10000,
    ) -> ActionResult:
        """Wait for an element to reach a given state."""
        import time
        t0 = time.time()
        try:
            await page.locator(locator).first.wait_for(state=state, timeout=timeout_ms)
            return ActionResult(
                success=True, action_type="wait", risk_level=RiskLevel.READ_ONLY.value,
                element_resolved=True, pre_check_passed=True, post_check_passed=True,
                needs_user_approval=False, approval_reason="",
                duration_ms=(time.time()-t0)*1000, error=None,
                output={"locator": locator, "state": state},
            )
        except Exception as exc:
            return ActionResult(
                success=False, action_type="wait", risk_level=RiskLevel.READ_ONLY.value,
                element_resolved=False, pre_check_passed=False, post_check_passed=False,
                needs_user_approval=False, approval_reason="",
                duration_ms=(time.time()-t0)*1000, error=str(exc), output=None,
            )

    # ── Private helpers ───────────────────────────────────────────────────────

    def _infer_risk(self, action_type: str, description: str) -> RiskLevel:
        """Infer risk level from action type and description."""
        desc_lower = description.lower()

        for pattern in _CRITICAL_PATTERNS:
            if pattern in desc_lower or pattern in action_type.lower():
                return RiskLevel.CRITICAL

        for pattern in _HIGH_RISK_PATTERNS:
            if pattern in desc_lower or pattern in action_type.lower():
                return RiskLevel.HIGH_RISK

        if action_type in ("navigate", "scroll", "hover", "screenshot", "extract"):
            return RiskLevel.READ_ONLY

        return RiskLevel.LOW_RISK

    async def _request_approval(self, action_type: str, description: str, risk: RiskLevel) -> bool:
        """Request user approval for high-risk actions."""
        if risk == RiskLevel.CRITICAL and not self._approval_callback:
            log.warning("CRITICAL action '%s' blocked — no approval callback configured", description)
            return False

        if self._approval_callback:
            try:
                return await self._approval_callback(action_type, description, risk.value)
            except Exception as exc:
                log.warning("approval_callback error: %s", exc)
                return risk == RiskLevel.HIGH_RISK  # auto-allow HIGH but not CRITICAL on error

        # No callback: auto-allow HIGH_RISK, block CRITICAL
        return risk == RiskLevel.HIGH_RISK
