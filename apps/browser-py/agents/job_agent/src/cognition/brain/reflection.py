"""Reflection — after each attempt, distil lessons (local model).

Reviews the action trace + outcome and produces 1-3 short, reusable lessons that
are stored in long-term + pattern memory so future attempts improve. Falls back to
a heuristic lesson when the model is unavailable.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List

log = logging.getLogger("browser-py.job_agent.cognition")

_REFLECT_SYS = (
    "You review a browser job-application attempt and extract concise, reusable "
    "lessons for next time (what worked, what to avoid on this kind of site). "
    "Reply as JSON: {\"lessons\": [\"...\"]}. 1-3 short imperative lessons, "
    "generic enough to reuse. No fluff."
)


class Reflection:
    def __init__(self, llm):
        self.llm = llm

    async def reflect(self, *, goal: str, outcome: str, steps: int,
                      actions: List[str], summary: str) -> List[str]:
        trace = "\n".join(f"- {a}" for a in actions[-20:])
        user = (
            f"GOAL: {goal}\nOUTCOME: {outcome} ({steps} steps)\n"
            f"SUMMARY: {summary}\nACTION TRACE:\n{trace}"
        )
        try:
            data = await self.llm.chat_json(
                [{"role": "system", "content": _REFLECT_SYS},
                 {"role": "user", "content": user}],
                temperature=0.3,
            )
            lessons = data.get("lessons")
            if isinstance(lessons, list) and lessons:
                return [str(l).strip() for l in lessons if str(l).strip()][:3]
        except Exception as exc:  # noqa: BLE001
            log.debug("Reflection LLM failed (%s); using heuristic.", exc)
        # Heuristic fallback.
        if outcome in ("submitted", "already_applied"):
            return [f"Application reached '{outcome}' in {steps} steps."]
        return [f"Attempt ended '{outcome}': {summary[:160]}"]
