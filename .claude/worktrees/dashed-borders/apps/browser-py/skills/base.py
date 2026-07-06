"""Skill framework for the Python browser engine.

A Skill is a real Playwright automation flow for a domain (research, shopping,
job, food, social, generic). The executor dispatches to one when a job carries a
`domain`/`skill` hint. Skills stream progress as log events the dashboard already
renders, and return a normalized outcome the executor turns into
execution:completed.
"""

from __future__ import annotations

import logging

log = logging.getLogger("browser-py.skills")


class SkillContext:
    """Everything a skill needs: the live page, event bus, goal, args, and AI."""

    def __init__(self, page, publisher, session_id, goal, job, user_id, ai):
        self.page = page
        self.publisher = publisher
        self.session_id = session_id
        self.goal = goal or ""
        self.job = job or {}
        self.user_id = user_id
        self.ai = ai

    async def log(self, message: str, source: str = "AIAgent", level: str = "info") -> None:
        """Emit a dashboard log line (wrapped as execution:event → log:<level>)."""
        await self.publisher.publish(
            self.session_id,
            "execution:event",
            {"type": f"log:{level}", "data": {"source": source, "message": message}},
        )

    async def emit_result(self, kind: str, items: list) -> None:
        """Emit a structured result payload (forwarded to the UI for later use)."""
        await self.publisher.publish(
            self.session_id,
            "agent:result",
            {"sessionId": self.session_id, "kind": kind, "count": len(items), "items": items},
        )


class Skill:
    name: str = "skill"

    async def run(self, ctx: SkillContext) -> dict:  # pragma: no cover - interface
        raise NotImplementedError

    @staticmethod
    def ok(items: list, status: str = "success") -> dict:
        """Normalized skill outcome consumed by the executor."""
        return {
            "status": status,
            "total": len(items),
            "results": [{"stepIndex": i, "success": True, "durationMs": 0} for i in range(len(items))]
            or [{"stepIndex": 0, "success": True, "durationMs": 0}],
            "items": items,
        }
