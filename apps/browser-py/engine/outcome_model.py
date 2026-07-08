"""Workflow outcome model — lifecycle from execution to confirmed evidence.

Replaces binary success/failure with a richer lifecycle that distinguishes
browser action completion from independent evidence of the intended result.

States:
  EXECUTION_STARTED     — workflow has begun executing
  ACTIONS_COMPLETED     — all browser actions finished (engine believes it succeeded)
  VERIFICATION_RUNNING  — ground truth check in progress
  CONFIRMED             — independent evidence proves the intended result occurred
  CONFIRMATION_PENDING  — execution done, evidence not yet available (e.g. ATS lag)
  UNCONFIRMED           — confirmation window elapsed without evidence (≠ FAILED)
  FAILED                — execution itself failed (not just unconfirmed)

Key distinction:
  UNCONFIRMED means "we cannot prove it worked" — not "it failed."
  Communicating uncertainty is more honest than claiming false success.
"""

import asyncio
import logging
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

log = logging.getLogger("browser-py.engine.outcome_model")


class OutcomeState(str, Enum):
    EXECUTION_STARTED = "execution_started"
    ACTIONS_COMPLETED = "actions_completed"
    VERIFICATION_RUNNING = "verification_running"
    CONFIRMED = "confirmed"
    CONFIRMATION_PENDING = "confirmation_pending"
    UNCONFIRMED = "unconfirmed"
    FAILED = "failed"


@dataclass
class OutcomeEvidence:
    """Structured proof that the intended outcome occurred.

    CONFIRMED always has an OutcomeEvidence attached. Callers can
    inspect source and reference_id without parsing raw_data.
    """
    source: str                  # order_history|confirmation_page|ats_record|email|booking_ref
    reference_id: Optional[str]  # order_id, booking_ref, application_id — None if unavailable
    confidence: float
    timestamp: float
    raw_data: dict               # full domain-specific evidence dict

    @classmethod
    def from_dict(cls, d: dict, source: str, confidence: float) -> "OutcomeEvidence":
        ref = (
            d.get("order_id") or d.get("booking_ref") or
            d.get("order_number") or d.get("application_id")
        )
        return cls(
            source=source,
            reference_id=ref,
            confidence=confidence,
            timestamp=time.time(),
            raw_data=d,
        )

    def to_dict(self) -> dict:
        return {
            "source": self.source,
            "reference_id": self.reference_id,
            "confidence": self.confidence,
            "timestamp": self.timestamp,
        }


@dataclass
class ConfirmationResult:
    confirmed: bool
    outcome_state: str          # OutcomeState value
    evidence: dict              # domain-specific evidence: order_id, booking_ref, etc.
    confidence: float           # 0.0–1.0
    checked_at: float
    check_count: int
    latency_ms: float
    reason: str
    outcome_evidence: Optional[OutcomeEvidence] = None   # set when confirmed=True


@dataclass
class WorkflowOutcome:
    workflow_id: str
    domain: str
    state: str                  # OutcomeState value
    started_at: float
    actions_completed_at: Optional[float]
    confirmed_at: Optional[float]
    confirmation_result: Optional[ConfirmationResult]
    failure_reason: Optional[str]
    state_history: list = field(default_factory=list)

    def transition(self, new_state: OutcomeState, note: str = "") -> None:
        prev = self.state
        self.state_history.append({
            "from": prev,
            "to": new_state.value,
            "at": time.time(),
            "note": note,
        })
        self.state = new_state.value
        log.info("WorkflowOutcome %s: %s → %s  (%s)", self.workflow_id, prev, new_state.value, note)

    @property
    def is_terminal(self) -> bool:
        return self.state in (
            OutcomeState.CONFIRMED.value,
            OutcomeState.UNCONFIRMED.value,
            OutcomeState.FAILED.value,
        )

    @property
    def duration_ms(self) -> float:
        end = self.confirmed_at or time.time()
        return (end - self.started_at) * 1000

    def to_dict(self) -> dict:
        cr = self.confirmation_result
        return {
            "workflow_id": self.workflow_id,
            "domain": self.domain,
            "state": self.state,
            "is_terminal": self.is_terminal,
            "started_at": self.started_at,
            "actions_completed_at": self.actions_completed_at,
            "confirmed_at": self.confirmed_at,
            "duration_ms": round(self.duration_ms, 1),
            "failure_reason": self.failure_reason,
            "confirmation_result": {
                "confirmed": cr.confirmed,
                "confidence": cr.confidence,
                "evidence": cr.evidence,
                "reason": cr.reason,
                "checks": cr.check_count,
                "latency_ms": round(cr.latency_ms, 1),
            } if cr else None,
            "state_history": self.state_history,
        }


class OutcomeManager:
    """Manages workflow outcome lifecycle and drives ground truth verification."""

    def __init__(self):
        self._outcomes: dict = {}

    def start(self, workflow_id: str, domain: str) -> WorkflowOutcome:
        outcome = WorkflowOutcome(
            workflow_id=workflow_id,
            domain=domain,
            state=OutcomeState.EXECUTION_STARTED.value,
            started_at=time.time(),
            actions_completed_at=None,
            confirmed_at=None,
            confirmation_result=None,
            failure_reason=None,
        )
        self._outcomes[workflow_id] = outcome
        log.info("OutcomeManager: started workflow=%s domain=%s", workflow_id, domain)
        return outcome

    def mark_actions_completed(self, workflow_id: str) -> None:
        outcome = self._outcomes.get(workflow_id)
        if outcome:
            outcome.actions_completed_at = time.time()
            outcome.transition(OutcomeState.ACTIONS_COMPLETED, "all browser actions finished")

    def mark_failed(self, workflow_id: str, reason: str) -> None:
        outcome = self._outcomes.get(workflow_id)
        if outcome:
            outcome.failure_reason = reason
            outcome.transition(OutcomeState.FAILED, reason)

    async def verify_outcome(
        self,
        workflow_id: str,
        provider,
        context: dict,
    ) -> WorkflowOutcome:
        """Run ground truth verification with the given provider.

        Transitions: ACTIONS_COMPLETED → VERIFICATION_RUNNING →
                     CONFIRMED | CONFIRMATION_PENDING | UNCONFIRMED
        """
        outcome = self._outcomes.get(workflow_id)
        if not outcome:
            raise KeyError(f"No outcome tracked for workflow: {workflow_id}")
        if outcome.state == OutcomeState.FAILED.value:
            return outcome

        outcome.transition(OutcomeState.VERIFICATION_RUNNING, "starting ground truth check")

        retry_schedule = provider.retry_schedule()
        timeout = provider.confirmation_timeout()
        deadline = time.time() + timeout
        check_count = 0
        start = time.time()

        for delay in [0] + retry_schedule:
            if delay > 0:
                await asyncio.sleep(delay)
            if time.time() > deadline:
                break

            check_count += 1
            result = await provider.check_confirmation(context)
            result.check_count = check_count
            result.latency_ms = (time.time() - start) * 1000

            if result.confirmed:
                outcome.confirmed_at = time.time()
                outcome.confirmation_result = result
                outcome.transition(OutcomeState.CONFIRMED, result.reason)
                return outcome

            log.debug(
                "GT check %d: not confirmed — %s (%.0fms elapsed)",
                check_count, result.reason, result.latency_ms,
            )

        # Final check after all delays
        check_count += 1
        last = await provider.check_confirmation(context)
        last.check_count = check_count
        last.latency_ms = (time.time() - start) * 1000
        outcome.confirmation_result = last

        if last.confirmed:
            outcome.confirmed_at = time.time()
            outcome.transition(OutcomeState.CONFIRMED, last.reason)
        elif timeout > 60:
            # Slow domain (e.g. job ATS) — don't call it failed yet
            outcome.transition(
                OutcomeState.CONFIRMATION_PENDING,
                "evidence not yet available — system may still be processing",
            )
        else:
            outcome.transition(
                OutcomeState.UNCONFIRMED,
                f"confirmation window ({timeout}s) elapsed without evidence",
            )

        return outcome

    def get(self, workflow_id: str) -> Optional[WorkflowOutcome]:
        return self._outcomes.get(workflow_id)

    def get_all(self) -> list:
        return [o.to_dict() for o in self._outcomes.values()]
