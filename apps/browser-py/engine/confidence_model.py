"""Action-level confidence scoring.

Computes confidence per step from five observable signals. Workflow
confidence uses critical-path weighting: a weak step on the critical
path pulls the workflow score down disproportionately, reflecting the
real risk that one bad link breaks the whole chain.

Aggregation rule:
  workflow_confidence = blend(critical_avg * 0.7 + non_critical_avg * 0.3)
                        capped by the lowest critical-path step confidence

This means a 0.3 confidence on a checkout step produces a workflow
score ≤ 0.3, regardless of how well every other step performed.

Temporal decay:
  Confidence decays exponentially with time. An UNCONFIRMED workflow
  that is 24 hours old should be treated with much less confidence
  than one that completed 30 seconds ago.
  C_decayed = C * e^(-λ * hours),  λ = 0.029 (≈ 50% after 24 hours)
"""

import logging
import math
from dataclasses import dataclass, field
from typing import Optional

log = logging.getLogger("browser-py.engine.confidence_model")

_WEIGHTS = {
    "selector_stability": 0.25,   # was element found without relocation?
    "verification": 0.35,         # did verifier confirm success?
    "fallback_usage": 0.15,       # did we fall back to a lower-quality selector strategy?
    "recovery_attempts": 0.15,    # how many recovery rounds were needed?
    "manual_intervention": 0.10,  # did the user have to intervene?
}


@dataclass
class StepConfidence:
    step_id: str
    action_type: str
    is_critical_path: bool
    selector_stability: float    # 1.0 = first try, 0.5 = relocated, 0.0 = selector failed
    verification: float          # 1.0 = verified pass, 0.5 = skipped, 0.0 = verified fail
    fallback_usage: float        # 1.0 = primary strategy, 0.0 = OCR / last-resort fallback
    recovery_attempts: float     # 1.0 = no recovery, 0.5 = 1 attempt, 0.0 = 2+ attempts
    manual_intervention: float   # 1.0 = no intervention, 0.0 = user acted manually
    confidence: float = field(init=False)

    def __post_init__(self):
        self.confidence = self._compute()

    def _compute(self) -> float:
        raw = (
            self.selector_stability * _WEIGHTS["selector_stability"]
            + self.verification * _WEIGHTS["verification"]
            + self.fallback_usage * _WEIGHTS["fallback_usage"]
            + self.recovery_attempts * _WEIGHTS["recovery_attempts"]
            + self.manual_intervention * _WEIGHTS["manual_intervention"]
        )
        return round(min(1.0, max(0.0, raw)), 3)

    def to_dict(self) -> dict:
        return {
            "step_id": self.step_id,
            "action_type": self.action_type,
            "is_critical_path": self.is_critical_path,
            "confidence": self.confidence,
            "signals": {
                "selector_stability": self.selector_stability,
                "verification": self.verification,
                "fallback_usage": self.fallback_usage,
                "recovery_attempts": self.recovery_attempts,
                "manual_intervention": self.manual_intervention,
            },
        }


class ConfidenceModel:
    """Collects step-level confidence and computes a workflow-level score."""

    def __init__(self):
        self._steps: list = []

    def record_step(self, step_conf: StepConfidence) -> None:
        self._steps.append(step_conf)
        log.debug(
            "Confidence: step=%s action=%s score=%.3f critical=%s",
            step_conf.step_id, step_conf.action_type, step_conf.confidence, step_conf.is_critical_path,
        )

    def workflow_confidence(self) -> float:
        """Workflow confidence with critical-path floor.

        The floor ensures a single weak critical step cannot be averaged away
        by a long sequence of high-confidence steps.
        """
        if not self._steps:
            return 0.0

        critical = [s for s in self._steps if s.is_critical_path]
        non_critical = [s for s in self._steps if not s.is_critical_path]

        if critical:
            critical_floor = min(s.confidence for s in critical)
            critical_avg = sum(s.confidence for s in critical) / len(critical)
        else:
            critical_floor = 1.0
            critical_avg = 1.0

        non_critical_avg = (
            sum(s.confidence for s in non_critical) / len(non_critical)
            if non_critical else 1.0
        )

        blended = critical_avg * 0.7 + non_critical_avg * 0.3
        return round(min(blended, critical_floor), 3)

    def lowest_confidence_step(self) -> Optional[StepConfidence]:
        return min(self._steps, key=lambda s: s.confidence, default=None)

    def steps_below_threshold(self, threshold: float = 0.7) -> list:
        return [s for s in self._steps if s.confidence < threshold]

    def decayed_confidence(self, hours_elapsed: float) -> float:
        """Apply temporal decay to workflow confidence.

        λ = 0.029 → 50% decay after 24 hours.
        An UNCONFIRMED workflow that is hours old carries less weight
        than one that just completed.
        """
        wc = self.workflow_confidence()
        _LAMBDA = 0.029
        decayed = wc * math.exp(-_LAMBDA * max(0.0, hours_elapsed))
        return round(max(0.0, decayed), 3)

    def summary(self) -> dict:
        wc = self.workflow_confidence()
        low = self.lowest_confidence_step()
        return {
            "workflow_confidence": wc,
            "step_count": len(self._steps),
            "critical_path_steps": sum(1 for s in self._steps if s.is_critical_path),
            "lowest_step": low.to_dict() if low else None,
            "steps_below_0_7": len(self.steps_below_threshold(0.7)),
            "all_steps": [s.to_dict() for s in self._steps],
        }

    @staticmethod
    def from_step_record(step_record, is_critical_path: bool = False) -> StepConfidence:
        """Derive a StepConfidence from an AuditTrail StepRecord."""
        recovery = step_record.recovery_attempts
        verif = step_record.verification_result

        selector_stability = max(0.0, 1.0 - (recovery * 0.4))

        verification_score = 0.5   # default: skipped
        if verif == "passed":
            verification_score = 1.0
        elif verif == "failed":
            verification_score = 0.0

        recovery_score = max(0.0, 1.0 - (recovery * 0.5))

        return StepConfidence(
            step_id=step_record.step_id,
            action_type=step_record.action,
            is_critical_path=is_critical_path,
            selector_stability=selector_stability,
            verification=verification_score,
            fallback_usage=1.0,          # AuditTrail doesn't track fallback — optimistic default
            recovery_attempts=recovery_score,
            manual_intervention=1.0,     # 1.0 unless caller explicitly sets it lower
        )
