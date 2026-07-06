"""Reasoning engine — choose the next action, as JSON, from the observation.

This is the SEE→UNDERSTAND→THINK→DECIDE step. The local model is shown the goal,
the applicant profile, learned hints, recent actions, and the current observation
(DOM elements + any vision text), and must reply with ONE JSON object:

    {"thought": "...",
     "assessment": {"confidence": 0-1, "risk": 0-1, "missing_info": "...", "rationale": "..."},
     "action": {"tool": "...", ...}}

Using JSON-mode (not native tool-calling) keeps it portable across local models.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List

from ..browser_tools import ACTIONS_DOC

# Generic, task-agnostic reasoning core. A TaskSpec layers task-specific rules on
# top via `system_prompt(spec)`; the job-application rules live in the job spec.
GENERIC_SYSTEM_PROMPT = """You are the reasoning core of an autonomous web agent. You control a real web browser by choosing ONE action at a time. You operate ANY website by observation and reasoning — you do NOT rely on site-specific scripts.

Loop: SEE -> UNDERSTAND -> THINK -> PLAN -> ACT -> VERIFY -> LEARN. Each turn you receive the current observation (interactive elements tagged [ref] with labels/values/options, plus page text, plus any vision notes). Decide the single best next action, then you will see the updated observation to verify it worked.

GROUNDING & INTEGRITY (non-negotiable):
- Use ONLY the provided KNOWLEDGE as the source of truth for any value you enter. NEVER invent identity, credentials, financial, legal, or personal facts.
- For any CONSEQUENTIAL or irreversible action (submit, send, post, pay, purchase, delete, confirm), set assessment.risk >= 0.7. A human approval gate may pause you before such actions.
- If a REQUIRED input is missing from KNOWLEDGE and is consequential, use request_human, then finish(status="blocked"). Do not guess.
- On captcha / login wall / hard block: request_human then finish(status="blocked").
- Use get_screenshot only when the DOM is ambiguous (custom widgets, canvas, visual-only state).
- To return information the task asks for, use the `extract` action (call it repeatedly to build a list). When the goal is achieved, finish(status="done").

OUTPUT: reply with EXACTLY ONE JSON object and nothing else:
{"thought": "<brief reasoning>",
 "assessment": {"confidence": <0-1>, "risk": <0-1>, "missing_info": "<or empty>", "rationale": "<one sentence>"},
 "action": {"tool": "<name>", ...args}}"""


def build_system_prompt(spec=None) -> str:
    """Compose the effective system prompt: generic core + the task's integrity
    addendum + success hint + the action catalogue."""
    parts = [GENERIC_SYSTEM_PROMPT]
    addendum = getattr(spec, "integrity_addendum", "") if spec else ""
    if addendum:
        parts.append("TASK-SPECIFIC RULES:\n" + addendum.strip())
    hint = getattr(spec, "success_hint", "") if spec else ""
    if hint:
        parts.append("WHAT 'DONE' LOOKS LIKE: " + hint.strip())
    parts.append(ACTIONS_DOC)
    return "\n\n".join(parts)


# Back-compat: the bare generic prompt (no task spec) including the action doc.
SYSTEM_PROMPT = build_system_prompt(None)


@dataclass
class NextAction:
    thought: str = ""
    tool: str = ""
    args: Dict[str, Any] = field(default_factory=dict)
    assessment: Dict[str, Any] = field(default_factory=dict)
    raw: Dict[str, Any] = field(default_factory=dict)

    @property
    def valid(self) -> bool:
        return bool(self.tool)


class ReasoningEngine:
    def __init__(self, llm):
        self.llm = llm  # LocalLLMClient

    def system_prompt(self, spec=None) -> str:
        return build_system_prompt(spec)

    async def decide(self, messages: List[Dict[str, Any]]) -> NextAction:
        """`messages` is a full chat transcript (system + user/observation turns)."""
        data = await self.llm.chat_json(messages, temperature=0.1)
        action = data.get("action") or {}
        tool = ""
        args: Dict[str, Any] = {}
        if isinstance(action, dict):
            tool = str(action.get("tool", "")).strip()
            args = {k: v for k, v in action.items() if k != "tool"}
        return NextAction(
            thought=str(data.get("thought", ""))[:500],
            tool=tool,
            args=args,
            assessment=data.get("assessment") or {},
            raw=data,
        )
