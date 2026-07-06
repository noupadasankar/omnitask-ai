"""Booking skill — reservations, appointments, and event tickets via browser.

Dispatched by the executor when the backend sends a job with:
  skill = 'booking'
           | 'ticket_booking' | 'hotel_booking' | 'restaurant_booking'
           | 'appointment'    | 'reservation'

Delegates to the standalone BookingAgent in agents/booking_agent/, wiring it
into the engine's live page, event bus, and approval gate — the same pattern
that FinanceSkill uses for FinanceAgent.

Approval gate:
  Every confirm/checkout action is gated through the dashboard approval panel
  before any browser click is made.  BOOKING_AUTO_APPROVE=true skips the gate
  (autonomous mode, dangerous for booking flows — off by default).

Event types published to the dashboard:
  booking_restaurant   — restaurant reservation result / availability
  booking_hotel        — hotel room search / booking result
  booking_ticket       — event ticket search / purchase result
  booking_appointment  — appointment slot booking result
  booking_availability — generic availability check result
  booking_cancellation — cancellation request result
"""

from __future__ import annotations

import logging
import os
import sys
from pathlib import Path

from .base import Skill, SkillContext

log = logging.getLogger("browser-py.skills.booking")

# Root of the standalone booking agent directory.
_BOOKING_AGENT_ROOT = Path(__file__).resolve().parent.parent / "agents" / "booking_agent"


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


class _BookingBridge:
    """Adapts SkillContext to the interface BookingAgent expects.

    Mirrors _FinanceBridge in skills/finance.py exactly:
      - Streams log lines to the dashboard terminal.
      - Gates consequential actions (confirm/checkout) via the approval panel.
      - Emits structured results to the UI (booking_* events).
      - Exposes the AI client so BookingAgent can call ai.summarize / ai.extract_json.

    In standalone CLI mode this bridge is None so the agent runs headless.
    """

    def __init__(self, ctx: SkillContext, *, auto_approve: bool, approval_timeout_ms: int):
        self.ctx = ctx
        self.auto_approve = auto_approve
        self.approval_timeout_ms = approval_timeout_ms
        self._step = 0
        # Expose the engine AI client so BookingAgent can use summarize etc.
        self.ai = ctx.ai

    def _next_step(self) -> int:
        self._step += 1
        return self._step

    async def log(self, message: str, level: str = "info") -> None:
        await self.ctx.log(message, source="BookingAgent", level=level)

    async def emit_result(self, kind: str, items: list) -> None:
        await self.ctx.emit_result(kind, items)

    async def cancelled(self) -> bool:
        return await self.ctx.publisher.is_cancelled(self.ctx.session_id)

    async def gate(self, description: str, step_data: dict) -> bool:
        """Request user approval before a reservation / ticket purchase / checkout.

        Published as approval:required; waits for the dashboard response.
        Auto-approved when auto_approve=True or BOOKING_AUTO_APPROVE env var is set.
        """
        if self.auto_approve:
            await self.log(
                "Auto-approved booking gate (BOOKING_AUTO_APPROVE=true)", level="warn"
            )
            return True

        idx = self._next_step()
        action = step_data.get("action", "book")
        target = (
            step_data.get("restaurant")
            or step_data.get("hotel")
            or step_data.get("event")
            or step_data.get("provider")
            or step_data.get("query")
            or ""
        )
        value = (
            step_data.get("date", "")
            + (" " + step_data.get("time", "") if step_data.get("time") else "")
        ).strip()

        await self.ctx.publisher.publish(
            self.ctx.session_id,
            "approval:required",
            {
                "sessionId":   self.ctx.session_id,
                "stepIndex":   idx,
                "description": description,
                "action":      action,
                "target":      target,
                "value":       value,
            },
        )
        return await self.ctx.publisher.wait_for_approval(
            self.ctx.session_id, idx, self.approval_timeout_ms
        )


class BookingSkill(Skill):
    """Browser-driven booking skill: restaurants, hotels, tickets, appointments.

    Wraps the standalone BookingAgent and plugs it into the OmniTask engine
    (live page, event bus, approval gate) — the same pattern as FinanceSkill.
    """

    name = "booking"

    async def run(self, ctx: SkillContext) -> dict:
        if not _BOOKING_AGENT_ROOT.exists():
            await ctx.log(
                f"booking_agent directory not found at {_BOOKING_AGENT_ROOT}",
                source="BookingAgent",
                level="error",
            )
            return self.ok([], status="partial")

        auto_approve = _env_bool("BOOKING_AUTO_APPROVE", False)

        bridge = _BookingBridge(
            ctx,
            auto_approve=auto_approve,
            approval_timeout_ms=int(
                os.environ.get("BOOKING_APPROVAL_TIMEOUT_MS", "300000")
            ),
        )

        task_type = (ctx.job.get("task_type") or ctx.job.get("skill") or "").lower()
        query     = ctx.job.get("query") or ctx.goal
        portal    = (ctx.job.get("portal") or ctx.job.get("site") or "").lower()

        task_context = {
            "goal":        ctx.goal,
            "task_type":   task_type,
            "portal":      portal,
            "query":       query,
            # Booking-specific fields the backend may include.
            "date":        ctx.job.get("date", ""),
            "time":        ctx.job.get("time", ""),
            "party_size":  ctx.job.get("party_size") or ctx.job.get("guests"),
            "location":    ctx.job.get("location", ""),
            "event":       ctx.job.get("event", ""),
            "check_in":    ctx.job.get("check_in", ""),
            "check_out":   ctx.job.get("check_out", ""),
            "quantity":    ctx.job.get("quantity"),
            "payee":       ctx.job.get("payee"),
            "config":      ctx.job.get("config") or {},
        }

        await ctx.log(
            f"Booking skill starting (task_type={task_type!r}, auto_approve={auto_approve})",
            source="BookingAgent",
        )

        return await self._run_agent(ctx, bridge, task_context)

    async def _run_agent(
        self,
        ctx: SkillContext,
        bridge: _BookingBridge,
        task_context: dict,
    ) -> dict:
        """Import and run the BookingAgent with the engine's live page wired in."""

        # Guard: serialize import so concurrent jobs don't race on sys.path.
        # (Matches the pattern in FinanceSkill._run_agent.)
        _orig_path    = sys.path[:]
        _orig_modules = {k: v for k, v in sys.modules.items() if k.startswith("booking")}

        try:
            # Prepend the agent root so its relative imports resolve correctly.
            if str(_BOOKING_AGENT_ROOT) not in sys.path:
                sys.path.insert(0, str(_BOOKING_AGENT_ROOT))

            try:
                from booking_agent import BookingAgent  # type: ignore
            except ImportError as exc:
                await ctx.log(
                    f"Could not import BookingAgent ({exc}). "
                    "Ensure agents/booking_agent/ is present and browser-py deps are installed.",
                    source="BookingAgent",
                    level="error",
                )
                raise

            agent = BookingAgent(bridge=bridge, page=ctx.page)
            outcome = await agent.execute(task_context)

        finally:
            # Restore sys.path + evict newly imported booking_agent modules so
            # the next concurrent job gets a clean import.
            sys.path[:] = _orig_path
            for k in list(sys.modules.keys()):
                if k.startswith("booking") and k not in _orig_modules:
                    del sys.modules[k]

        items  = outcome.get("items", [])
        action = outcome.get("action", "unknown")
        status = outcome.get("status", "success")

        level = "success" if status == "success" else ("warn" if status == "partial" else "error")
        await ctx.log(
            f"Booking agent finished — action={action}, {len(items)} item(s), status={status}",
            source="BookingAgent",
            level=level,
        )

        return self.ok(items, status=status)
