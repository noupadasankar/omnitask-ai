"""Travel skill — flight search, hotel search, and itinerary building via browser.

Dispatched by the executor when the backend sends a job with:
  skill = 'travel'
           | 'search_flights' | 'flight_search' | 'flights'
           | 'search_hotels'  | 'hotel_search'  | 'hotels'
           | 'build_itinerary'| 'itinerary'     | 'plan_trip'

Delegates to the standalone TravelAgent in agents/travel_agent/, wiring it
into the engine's live page, event bus, and approval gate — the same pattern
that BookingSkill uses for BookingAgent.

Approval gate:
  Every checkout / payment action is gated through the dashboard approval panel
  before any browser click is made.  TRAVEL_AUTO_APPROVE=true skips the gate
  (autonomous mode, dangerous for payment flows — off by default).

Event types published to the dashboard:
  travel_flights    — flight search results
  travel_hotels     — hotel search / booking results
  travel_itinerary  — full multi-leg itinerary (flights + hotels)
"""

from __future__ import annotations

import logging
import os
import sys
from pathlib import Path

from .base import Skill, SkillContext

log = logging.getLogger("browser-py.skills.travel")

# Root of the standalone travel agent directory.
_TRAVEL_AGENT_ROOT = Path(__file__).resolve().parent.parent / "agents" / "travel_agent"


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


class _TravelBridge:
    """Adapts SkillContext to the interface TravelAgent expects.

    Mirrors _BookingBridge in skills/booking.py exactly:
      - Streams log lines to the dashboard terminal.
      - Gates payment actions (checkout / book) via the approval panel.
      - Emits structured results to the UI (travel_* events).
      - Exposes the AI client so TravelAgent can call ai.summarize / ai.extract_json.

    In standalone CLI mode this bridge is None so the agent runs headless.
    """

    def __init__(self, ctx: SkillContext, *, auto_approve: bool, approval_timeout_ms: int):
        self.ctx = ctx
        self.auto_approve = auto_approve
        self.approval_timeout_ms = approval_timeout_ms
        self._step = 0
        # Expose the engine AI client so TravelAgent can use summarize etc.
        self.ai = ctx.ai

    def _next_step(self) -> int:
        self._step += 1
        return self._step

    async def log(self, message: str, level: str = "info") -> None:
        await self.ctx.log(message, source="TravelAgent", level=level)

    async def emit_result(self, kind: str, items: list) -> None:
        await self.ctx.emit_result(kind, items)

    async def cancelled(self) -> bool:
        return await self.ctx.publisher.is_cancelled(self.ctx.session_id)

    async def gate(self, description: str, step_data: dict) -> bool:
        """Request user approval before a flight/hotel payment action.

        Published as approval:required; waits for the dashboard response.
        Auto-approved when auto_approve=True or TRAVEL_AUTO_APPROVE env var is set.
        """
        if self.auto_approve:
            await self.log(
                "Auto-approved travel gate (TRAVEL_AUTO_APPROVE=true)", level="warn"
            )
            return True

        idx = self._next_step()
        action      = step_data.get("action", "book")
        destination = step_data.get("destination", "")
        price       = step_data.get("price", "")
        date        = step_data.get("date", "")

        await self.ctx.publisher.publish(
            self.ctx.session_id,
            "approval:required",
            {
                "sessionId":   self.ctx.session_id,
                "stepIndex":   idx,
                "description": description,
                "action":      action,
                "target":      destination,
                "value":       f"{price} on {date}".strip(" on ") if price or date else "",
            },
        )
        return await self.ctx.publisher.wait_for_approval(
            self.ctx.session_id, idx, self.approval_timeout_ms
        )


class TravelSkill(Skill):
    """Browser-driven travel skill: flights, hotels, and itinerary building.

    Wraps the standalone TravelAgent and plugs it into the OmniTask engine
    (live page, event bus, approval gate) — the same pattern as BookingSkill.
    """

    name = "travel"

    async def run(self, ctx: SkillContext) -> dict:
        if not _TRAVEL_AGENT_ROOT.exists():
            await ctx.log(
                f"travel_agent directory not found at {_TRAVEL_AGENT_ROOT}",
                source="TravelAgent",
                level="error",
            )
            return self.ok([], status="partial")

        auto_approve = _env_bool("TRAVEL_AUTO_APPROVE", False)

        bridge = _TravelBridge(
            ctx,
            auto_approve=auto_approve,
            approval_timeout_ms=int(
                os.environ.get("TRAVEL_APPROVAL_TIMEOUT_MS", "300000")
            ),
        )

        task_type   = (ctx.job.get("task_type") or ctx.job.get("skill") or ctx.job.get("action") or "").lower()
        query       = ctx.job.get("query") or ctx.goal
        portal      = (ctx.job.get("portal") or ctx.job.get("site") or "").lower()

        task_context = {
            "goal":         ctx.goal,
            "task_type":    task_type,
            "action":       task_type,
            "portal":       portal,
            "query":        query,
            # Flight-specific fields.
            "origin":       ctx.job.get("origin", ""),
            "destination":  ctx.job.get("destination") or ctx.job.get("location", ""),
            "depart_date":  ctx.job.get("depart_date") or ctx.job.get("check_in", ""),
            "return_date":  ctx.job.get("return_date") or ctx.job.get("check_out", ""),
            "passengers":   ctx.job.get("passengers") or ctx.job.get("party_size"),
            # Hotel-specific fields.
            "check_in":     ctx.job.get("check_in") or ctx.job.get("depart_date", ""),
            "check_out":    ctx.job.get("check_out") or ctx.job.get("return_date", ""),
            "guests":       ctx.job.get("guests") or ctx.job.get("passengers"),
            # Common.
            "config":       ctx.job.get("config") or {},
            "confirm":      ctx.job.get("confirm", False),
        }

        await ctx.log(
            f"Travel skill starting (task_type={task_type!r}, auto_approve={auto_approve})",
            source="TravelAgent",
        )

        return await self._run_agent(ctx, bridge, task_context)

    async def _run_agent(
        self,
        ctx: SkillContext,
        bridge: _TravelBridge,
        task_context: dict,
    ) -> dict:
        """Import and run TravelAgent with the engine's live page wired in."""

        # Guard: serialize import so concurrent jobs don't race on sys.path.
        # (Matches the pattern in BookingSkill._run_agent.)
        _orig_path    = sys.path[:]
        _orig_modules = {k: v for k, v in sys.modules.items() if k.startswith("travel")}

        try:
            # Prepend the agent root so its relative imports resolve correctly.
            if str(_TRAVEL_AGENT_ROOT) not in sys.path:
                sys.path.insert(0, str(_TRAVEL_AGENT_ROOT))

            try:
                from travel_agent import TravelAgent  # type: ignore
            except ImportError as exc:
                await ctx.log(
                    f"Could not import TravelAgent ({exc}). "
                    "Ensure agents/travel_agent/ is present and browser-py deps are installed.",
                    source="TravelAgent",
                    level="error",
                )
                raise

            agent = TravelAgent(bridge=bridge, page=ctx.page)
            outcome = await agent.execute(task_context)

        finally:
            # Restore sys.path + evict newly imported travel_agent modules so
            # the next concurrent job gets a clean import.
            sys.path[:] = _orig_path
            for k in list(sys.modules.keys()):
                if k.startswith("travel") and k not in _orig_modules:
                    del sys.modules[k]

        items  = outcome.get("items", [])
        action = outcome.get("action", "unknown")
        status = outcome.get("status", "success")

        level = "success" if status == "success" else ("warn" if status == "partial" else "error")
        await ctx.log(
            f"Travel agent finished — action={action}, {len(items)} item(s), status={status}",
            source="TravelAgent",
            level=level,
        )

        return self.ok(items, status=status)
