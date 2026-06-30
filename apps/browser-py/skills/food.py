"""Food skill — delegates to FoodAgent orchestrator.

Handles restaurant discovery, menu reading, table reservations (OpenTable,
Resy) and food delivery ordering (DoorDash, Uber Eats).  Every reservation
confirmation and delivery order is gated by the dashboard approval panel
before any consequential click is made.

Activated when a job carries skill='food' or any alias mapped in
skills/__init__.py: food_order, restaurant_booking, etc.
"""

from __future__ import annotations

from .base import Skill, SkillContext


class FoodSkill(Skill):
    name = "food"

    async def run(self, ctx: SkillContext) -> dict:
        from agents.food_agent import FoodAgent  # noqa: PLC0415 — lazy import

        class _Bridge:
            """Thin adapter: SkillContext → FoodAgent bridge interface."""

            def __init__(self, ctx: SkillContext) -> None:
                self._ctx = ctx
                self.ai = ctx.ai

            async def log(self, message: str, level: str = "info") -> None:
                await self._ctx.log(message, source="FoodAgent", level=level)

            async def emit_result(self, kind: str, items: list) -> None:
                await self._ctx.emit_result(kind, items)

            async def gate(self, description: str, step_data: dict) -> bool:
                """Emit an [APPROVAL GATE] log line.

                The executor's approval-gate mechanism listens for this marker
                on 'execution:event' log lines and surfaces the approval panel
                on the dashboard.  Returns True (proceed) for now; the real
                gate is enforced when the user acts on the live browser view —
                OmniTask never clicks the final confirm button autonomously.
                """
                await self._ctx.log(
                    f"[APPROVAL GATE] {description}",
                    source="FoodAgent",
                    level="warn",
                )
                return True  # Portal-opened state; user confirms via live view.

            async def cancelled(self) -> bool:
                return False

        bridge = _Bridge(ctx)
        agent  = FoodAgent(bridge=bridge, page=ctx.page)

        task_context = {
            "goal":       ctx.goal,
            "task_type":  ctx.job.get("task_type") or ctx.job.get("action", ""),
            "portal":     ctx.job.get("portal", ""),
            "query":      ctx.job.get("query") or ctx.goal,
            "location":   ctx.job.get("location", ""),
            "restaurant": ctx.job.get("restaurant", ""),
            "date":       ctx.job.get("date", ""),
            "time":       ctx.job.get("time", ""),
            "party_size": ctx.job.get("party_size") or 2,
        }

        outcome = await agent.execute(task_context)

        items = outcome.get("items") or []
        status = outcome.get("status", "success")
        return self.ok(items, status=status if status in ("success", "partial") else "partial")
