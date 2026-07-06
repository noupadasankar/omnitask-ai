"""Planner — autonomous task decomposition (no hardcoded workflow).

Turns a high-level goal into ordered subgoals using the local model, with a sane
static fallback when the model is unavailable so the agent always has a plan to
follow. Task-specific framing (e.g. job-application subgoals) is supplied by the
caller via a TaskSpec; absent that, a generic decomposition is used.
"""

from __future__ import annotations

import logging
from typing import List, Optional

log = logging.getLogger("browser-py.job_agent.cognition")

_FALLBACK_SUBGOALS = [
    "Understand the current page and what the goal requires",
    "Navigate to the right place to act",
    "Perform the required interactions step by step",
    "Verify each action had the intended effect",
    "Confirm the goal is achieved and finish",
]

_PLAN_SYS = (
    "You decompose a web-automation goal into a short ordered list of concrete "
    "subgoals for a browser agent. Reply as JSON: {\"subgoals\": [\"...\", ...]}. "
    "6 steps max, each a short imperative phrase. No site-specific assumptions."
)


class Planner:
    def __init__(self, llm):
        self.llm = llm

    async def decompose(self, goal: str, context_hint: str = "",
                        *, plan_system: Optional[str] = None,
                        fallback_subgoals: Optional[List[str]] = None) -> List[str]:
        user = f"GOAL: {goal}"
        if context_hint:
            user += f"\nCONTEXT: {context_hint}"
        try:
            data = await self.llm.chat_json(
                [{"role": "system", "content": plan_system or _PLAN_SYS},
                 {"role": "user", "content": user}],
                temperature=0.2,
            )
            subgoals = data.get("subgoals")
            if isinstance(subgoals, list) and subgoals:
                cleaned = [str(s).strip() for s in subgoals if str(s).strip()][:6]
                if cleaned:
                    return cleaned
        except Exception as exc:  # noqa: BLE001
            log.debug("Planner LLM decompose failed (%s); using fallback.", exc)
        return list(fallback_subgoals or _FALLBACK_SUBGOALS)
