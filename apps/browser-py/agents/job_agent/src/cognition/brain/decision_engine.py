"""Decision engine — the confidence / risk gate.

Given the model's self-assessment for a proposed action, decide whether to
PROCEED or ESCALATE. High-risk, low-confidence actions (e.g. submitting while
unsure, or answering a consequential field without grounding) are gated so the
human stays in control. Thresholds are tunable via env.

  COG_MIN_CONFIDENCE   default 0.45  (below → escalate)
  COG_MAX_RISK         default 0.85  (above, if not confident → escalate)
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Dict

_MIN_CONF = float(os.environ.get("COG_MIN_CONFIDENCE", "0.45"))
_MAX_RISK = float(os.environ.get("COG_MAX_RISK", "0.85"))


@dataclass
class Decision:
    proceed: bool
    reason: str = ""


class DecisionEngine:
    def __init__(self, min_confidence: float = _MIN_CONF, max_risk: float = _MAX_RISK):
        self.min_confidence = min_confidence
        self.max_risk = max_risk

    @staticmethod
    def _num(v: Any, default: float) -> float:
        try:
            return max(0.0, min(1.0, float(v)))
        except (TypeError, ValueError):
            return default

    def evaluate(self, tool: str, assessment: Dict[str, Any]) -> Decision:
        # Control-flow + benign read/navigation tools are always allowed — they
        # ARE the escape hatches and they don't submit/pay/delete anything.
        if tool in ("finish", "request_human", "get_screenshot", "scroll",
                    "extract", "wait", "go_back", "navigate"):
            return Decision(True)

        confidence = self._num(assessment.get("confidence"), 0.6)
        risk = self._num(assessment.get("risk"), 0.0)

        if confidence < self.min_confidence:
            return Decision(False, f"low confidence ({confidence:.2f} < {self.min_confidence})")
        if risk > self.max_risk and confidence < 0.8:
            return Decision(False, f"high risk ({risk:.2f}) with unsure confidence ({confidence:.2f})")
        return Decision(True)
