"""Calendar skill — event creation, free-slot finding, conflict detection,
rescheduling, and travel buffer management via browser automation.

Dispatched by the executor when the backend sends a job with:
  skill = 'calendar'
           | 'create_event' | 'find_slot'   | 'detect_conflict'
           | 'reschedule'   | 'add_travel_buffer'

Delegates to the standalone CalendarAgent in agents/calendar_agent/, wiring
it into the engine's live page, event bus, and approval gate — the same
pattern that BookingSkill / FinanceSkill use.

Approval gate:
  Every action that writes or modifies calendar data (create, reschedule,
  add buffer) is gated through the dashboard approval panel before any
  browser click is made.  CALENDAR_AUTO_APPROVE=true skips the gate
  (autonomous mode, off by default).

Event types published to the dashboard:
  calendar_create        — event creation result
  calendar_free_slot     — free-slot availability scan result
  calendar_conflict      — conflict detection result
  calendar_reschedule    — reschedule result
  calendar_travel_buffer — travel-buffer planning result
"""

from __future__ import annotations

import logging
import os
import sys
from pathlib import Path

from .base import Skill, SkillContext

log = logging.getLogger("browser-py.skills.calendar")

# Root of the standalone calendar agent directory.
_CALENDAR_AGENT_ROOT = Path(__file__).resolve().parent.parent / "agents" / "calendar_agent"


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


class _CalendarBridge:
    """Adapts SkillContext to the interface CalendarAgent expects.

    Mirrors _BookingBridge in skills/booking.py exactly:
      - Streams log lines to the dashboard terminal.
      - Gates write actions (create/reschedule/buffer) via the approval panel.
      - Emits structured results to the UI (calendar_* events).
      - Exposes the AI client so CalendarAgent can call ai.summarize.

    In standalone CLI mode this bridge is None so the agent runs headless.
    """

    def __init__(self, ctx: SkillContext, *, auto_approve: bool, approval_timeout_ms: int):
        self.ctx = ctx
        self.auto_approve = auto_approve
        self.approval_timeout_ms = approval_timeout_ms
        self._step = 0
        # Expose the engine AI client so CalendarAgent can use summarize etc.
        self.ai = ctx.ai

    def _next_step(self) -> int:
        self._step += 1
        return self._step

    async def log(self, message: str, level: str = "info") -> None:
        await self.ctx.log(message, source="CalendarAgent", level=level)

    async def emit_result(self, kind: str, items: list) -> None:
        await self.ctx.emit_result(kind, items)

    async def cancelled(self) -> bool:
        return await self.ctx.publisher.is_cancelled(self.ctx.session_id)

    async def gate(self, description: str, step_data: dict) -> bool:
        """Request user approval before a calendar write action.

        Published as approval:required; waits for the dashboard response.
        Auto-approved when auto_approve=True or CALENDAR_AUTO_APPROVE env var is set.
        """
        if self.auto_approve:
            await self.log(
                "Auto-approved calendar gate (CALENDAR_AUTO_APPROVE=true)", level="warn"
            )
            return True

        idx = self._next_step()
        action = step_data.get("action", "calendar_action")
        target = (
            step_data.get("title")
            or step_data.get("query")
            or ""
        )
        value = (
            (step_data.get("date", "") + " " + step_data.get("start_time", "")).strip()
        )

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


class CalendarSkill(Skill):
    """Browser-driven calendar skill: events, free slots, conflicts, rescheduling.

    Wraps the standalone CalendarAgent and plugs it into the OmniTask engine
    (live page, event bus, approval gate) — the same pattern as BookingSkill.
    """

    name = "calendar"

    async def run(self, ctx: SkillContext) -> dict:
        if not _CALENDAR_AGENT_ROOT.exists():
            await ctx.log(
                f"calendar_agent directory not found at {_CALENDAR_AGENT_ROOT}",
                source="CalendarAgent",
                level="error",
            )
            return self.ok([], status="partial")

        auto_approve = _env_bool("CALENDAR_AUTO_APPROVE", False)

        bridge = _CalendarBridge(
            ctx,
            auto_approve=auto_approve,
            approval_timeout_ms=int(
                os.environ.get("CALENDAR_APPROVAL_TIMEOUT_MS", "300000")
            ),
        )

        action     = (ctx.job.get("action") or ctx.job.get("task_type") or ctx.job.get("skill") or "").lower()
        query      = ctx.job.get("query") or ctx.goal
        portal     = (ctx.job.get("portal") or ctx.job.get("site") or "").lower()

        task_context = {
            "goal":               ctx.goal,
            "action":             action,
            "portal":             portal,
            "query":              query,
            # Calendar-specific fields the backend may include.
            "title":              ctx.job.get("title", ""),
            "date":               ctx.job.get("date", ""),
            "start_time":         ctx.job.get("start_time", ""),
            "end_time":           ctx.job.get("end_time", ""),
            "duration_mins":      ctx.job.get("duration_mins"),
            "attendees":          ctx.job.get("attendees") or [],
            "location":           ctx.job.get("location", ""),
            "description":        ctx.job.get("description", ""),
            "new_date":           ctx.job.get("new_date", ""),
            "new_time":           ctx.job.get("new_time", ""),
            "travel_buffer_mins": ctx.job.get("travel_buffer_mins"),
            "buffer_before":      ctx.job.get("buffer_before", True),
            "buffer_after":       ctx.job.get("buffer_after", True),
            "start_hour":         ctx.job.get("start_hour"),
            "end_hour":           ctx.job.get("end_hour"),
            "config":             ctx.job.get("config") or {},
        }

        await ctx.log(
            f"Calendar skill starting (action={action!r}, auto_approve={auto_approve})",
            source="CalendarAgent",
        )

        return await self._run_agent(ctx, bridge, task_context)

    async def _run_agent(
        self,
        ctx: SkillContext,
        bridge: _CalendarBridge,
        task_context: dict,
    ) -> dict:
        """Import and run the CalendarAgent with the engine's live page wired in."""

        # Guard: serialize import so concurrent jobs don't race on sys.path.
        # (Matches the pattern in BookingSkill._run_agent / FinanceSkill._run_agent.)
        _orig_path    = sys.path[:]
        _orig_modules = {k: v for k, v in sys.modules.items() if k.startswith("calendar_agent")}

        try:
            # Prepend the agent root so its relative imports resolve correctly.
            if str(_CALENDAR_AGENT_ROOT) not in sys.path:
                sys.path.insert(0, str(_CALENDAR_AGENT_ROOT))

            try:
                from calendar_agent import CalendarAgent  # type: ignore
            except ImportError as exc:
                await ctx.log(
                    f"Could not import CalendarAgent ({exc}). "
                    "Ensure agents/calendar_agent/ is present and browser-py deps are installed.",
                    source="CalendarAgent",
                    level="error",
                )
                raise

            agent = CalendarAgent(bridge=bridge, page=ctx.page)
            outcome = await agent.execute(task_context)

        finally:
            # Restore sys.path + evict newly imported calendar_agent modules so
            # the next concurrent job gets a clean import.
            sys.path[:] = _orig_path
            for k in list(sys.modules.keys()):
                if k.startswith("calendar_agent") and k not in _orig_modules:
                    del sys.modules[k]

        items  = outcome.get("items", [])
        action = outcome.get("action", "unknown")
        status = outcome.get("status", "success")

        level = "success" if status == "success" else ("warn" if status == "partial" else "error")
        await ctx.log(
            f"Calendar agent finished — action={action}, {len(items)} item(s), status={status}",
            source="CalendarAgent",
            level=level,
        )

        return self.ok(items, status=status)
