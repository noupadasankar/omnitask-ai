"""Critic — a second-opinion safety pass for consequential actions (local model).

The DecisionEngine gate is a cheap numeric check on the reasoner's self-assessed
confidence/risk. The Critic is a heavier, separate LLM call that runs ONLY for
actions the loop already judged consequential (submit/send/pay/delete/high-risk).
It re-reads the goal, the proposed action, and the current observation, and
independently decides whether to ALLOW or BLOCK — catching cases where the
reasoner was overconfident.

Two-LLM disagreement (one proposes, an independent one reviews) removes a large
share of consequential mistakes at the cost of one extra call per RISKY step —
not per step. Runs on the same local model with a different system prompt.

Fail-open: if the local model errors or returns junk, the Critic ALLOWS (the
upstream DecisionEngine gate + the human approval gate remain in force), so a
critic outage never stalls a run.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Any, Dict, Optional

log = logging.getLogger("browser-py.job_agent.cognition")

# ── HARDCODED data-exfiltration firewall ───────────────────────────────────────
#
# Absolute, instant (regex, no LLM), fail-CLOSED. Runs before any DOM action so
# the agent can NEVER type a credit-card / SSN / CVV into a field, even if a
# malicious page or a hallucinated step tells it to. Tuned to minimise false
# positives — we match clear PII *field intent* and clear *value shapes*, and
# deliberately avoid broad words like "pin" (Pinterest) or bare "account".

# Sensitive FIELD intent — matched against the target field's label/intent text.
_FORBIDDEN_FIELD = re.compile(
    r"\b("
    r"credit\s*card|card\s*(?:number|no\.?)|cardnumber|"
    r"cvv2?|cvc|card\s*(?:security|verification)\s*(?:code|number)|security\s*code|"
    r"ssn|social\s*security(?:\s*number)?|"
    r"passport\s*(?:no|number)|"
    r"routing\s*(?:no|number)|iban|sort\s*code|"
    r"bank\s*account\s*(?:no|number)|account\s*number"
    r")\b",
    re.IGNORECASE,
)

# Sensitive VALUE shapes — matched against the literal text being typed.
#   SSN: 123-45-6789 OR 9 bare digits ; Credit card: 13-19 digits (optionally space/dash grouped).
_SSN_VALUE = re.compile(r"\b(\d{3}-\d{2}-\d{4}|\d{9})\b")
_CC_VALUE = re.compile(r"\b(?:\d[ -]?){13,19}\b")


def _looks_like_card(value: str) -> bool:
    """A run of 13–19 digits (ignoring spaces/dashes) — credit-card shaped."""
    m = _CC_VALUE.search(value or "")
    if not m:
        return False
    digits = re.sub(r"\D", "", m.group(0))
    return 13 <= len(digits) <= 19


def hard_block(intent: str, value: str = "") -> Optional[str]:
    """Return a block reason if `intent` (a field label/action description) or
    `value` (text about to be typed) is sensitive, else None.

    This is the non-negotiable firewall — callers MUST refuse to execute the
    action when this returns a reason, regardless of any LLM verdict.
    """
    if intent and _FORBIDDEN_FIELD.search(intent):
        return f"blocked: sensitive field intent ({intent[:60]!r})"
    if value:
        if _SSN_VALUE.search(value):
            return "blocked: value looks like an SSN"
        if _looks_like_card(value):
            return "blocked: value looks like a credit-card number"
    return None

_CRITIC_SYS = (
    "You are a cautious safety reviewer for an autonomous web agent. You are shown "
    "the GOAL, the agent's PROPOSED consequential action, and the current page. "
    "Decide whether performing it is safe and correct RIGHT NOW.\n"
    "BLOCK if: it submits/sends/pays/deletes prematurely (required fields look "
    "empty/wrong), it spends money or shares payment details not required by the "
    "goal, it acts on the wrong element, or it would plausibly violate the goal. "
    "ALLOW only if the action clearly advances the goal and looks complete.\n"
    "Reply with EXACTLY ONE JSON object: "
    "{\"allow\": <bool>, \"reason\": \"<one sentence>\", \"confidence\": <0-1>}"
)


@dataclass
class Critique:
    allow: bool
    reason: str = ""
    confidence: float = 0.0


class Critic:
    def __init__(self, llm):
        self.llm = llm  # LocalLLMClient

    async def review(self, *, goal: str, tool: str, args: Dict[str, Any],
                     observation_text: str,
                     thought: Optional[str] = None) -> Critique:
        user = (
            f"GOAL: {goal}\n"
            f"PROPOSED ACTION: {tool} {args}\n"
            f"AGENT'S RATIONALE: {thought or '(none given)'}\n\n"
            f"CURRENT PAGE OBSERVATION:\n{observation_text[:2500]}"
        )
        try:
            data = await self.llm.chat_json(
                [{"role": "system", "content": _CRITIC_SYS},
                 {"role": "user", "content": user}],
                temperature=0.0,
            )
        except Exception as exc:  # noqa: BLE001 — fail open (other gates remain)
            log.debug("Critic LLM failed (%s); allowing (other gates apply).", exc)
            return Critique(allow=True, reason="critic-unavailable", confidence=0.0)

        if not isinstance(data, dict) or "allow" not in data:
            return Critique(allow=True, reason="critic-malformed", confidence=0.0)
        allow = bool(data.get("allow"))
        reason = str(data.get("reason", ""))[:300]
        try:
            conf = max(0.0, min(1.0, float(data.get("confidence", 0.0))))
        except (TypeError, ValueError):
            conf = 0.0
        return Critique(allow=allow, reason=reason, confidence=conf)
