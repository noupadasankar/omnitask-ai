"""The agent's world model — the cognitive state it maintains continuously.

This is the explicit representation the frontier spec asks for: Goal, Current
State, Target State, Missing Information, Confidence, Risk, and Next Best Action.
The loop in `applier.py` updates it after every observation and action and
streams it to the dashboard as `cognition:state` events.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional


class TaskState(str, Enum):
    """Where the generic cognitive loop is in completing ANY web task."""

    PLANNING = "PLANNING"
    ACTING = "ACTING"
    REVIEWING = "REVIEWING"
    DONE = "DONE"            # goal achieved (submitted / extracted / already-done)
    BLOCKED = "BLOCKED"      # captcha / login wall / unanswerable required input
    ABANDONED = "ABANDONED"  # technical failure — caller may fall back


# Terminal generic states the loop stops on.
TASK_TERMINAL_STATES = {TaskState.DONE, TaskState.BLOCKED, TaskState.ABANDONED}


# Map a model `finish(status=...)` value onto a terminal TaskState.
_FINISH_TO_TASK_STATE = {
    "done": TaskState.DONE,
    "success": TaskState.DONE,
    "submitted": TaskState.DONE,
    "already_applied": TaskState.DONE,
    "blocked": TaskState.BLOCKED,
    "abandoned": TaskState.ABANDONED,
}


def finish_to_task_state(status: str) -> TaskState:
    return _FINISH_TO_TASK_STATE.get((status or "").strip().lower(), TaskState.ABANDONED)


class ApplicationState(str, Enum):
    """Job-application state machine — kept as an adapter over the generic states
    so the existing job path's contract (SUBMITTED / ALREADY_APPLIED / BLOCKED /
    ABANDONED) is unchanged."""

    STARTING = "STARTING"
    FILLING_FORM = "FILLING_FORM"
    REVIEWING = "REVIEWING"
    SUBMITTING = "SUBMITTING"
    SUBMITTED = "SUBMITTED"
    ALREADY_APPLIED = "ALREADY_APPLIED"
    BLOCKED = "BLOCKED"        # captcha / login wall / unanswerable required field
    ABANDONED = "ABANDONED"    # technical failure — caller may fall back


# Terminal states the loop stops on.
TERMINAL_STATES = {
    ApplicationState.SUBMITTED,
    ApplicationState.ALREADY_APPLIED,
    ApplicationState.BLOCKED,
    ApplicationState.ABANDONED,
}


@dataclass
class WorldModel:
    """Continuously-updated belief state for one task attempt (any web task)."""

    goal: str
    target_state: str = "Goal achieved and confirmed."
    state: TaskState = TaskState.PLANNING
    current_url: str = ""
    page_title: str = ""
    step: int = 0
    confidence: float = 0.5
    risk: float = 0.0
    missing_information: List[str] = field(default_factory=list)
    last_action: str = ""
    last_rationale: str = ""
    notes: List[str] = field(default_factory=list)
    # Structured data the agent surfaced via the `extract` action.
    extracted: List[Dict[str, Any]] = field(default_factory=list)
    started_at: float = field(default_factory=time.time)

    def apply_assessment(self, assessment: Optional[Dict[str, Any]]) -> None:
        """Fold a model-provided assessment block into the world model."""
        if not assessment:
            return
        conf = assessment.get("confidence")
        if isinstance(conf, (int, float)):
            self.confidence = max(0.0, min(1.0, float(conf)))
        rsk = assessment.get("risk")
        if isinstance(rsk, (int, float)):
            self.risk = max(0.0, min(1.0, float(rsk)))
        missing = assessment.get("missing_info")
        if missing and missing not in self.missing_information:
            self.missing_information.append(str(missing)[:300])
        rationale = assessment.get("rationale")
        if rationale:
            self.last_rationale = str(rationale)[:500]

    def to_event(self) -> Dict[str, Any]:
        """Compact, JSON-safe snapshot for the `cognition:state` dashboard event."""
        return {
            "goal": self.goal,
            "targetState": self.target_state,
            "state": self.state.value,
            "currentUrl": self.current_url,
            "pageTitle": self.page_title,
            "step": self.step,
            "confidence": round(self.confidence, 2),
            "risk": round(self.risk, 2),
            "missingInformation": self.missing_information[-5:],
            "lastAction": self.last_action,
            "rationale": self.last_rationale,
            "extractedCount": len(self.extracted),
            "elapsedMs": int((time.time() - self.started_at) * 1000),
        }


@dataclass
class TaskOutcome:
    """Result of one generic cognitive task attempt."""

    state: TaskState
    status: str = ""          # raw finish status (done/submitted/already_applied/blocked/…)
    summary: str = ""
    steps: int = 0
    data: List[Dict[str, Any]] = field(default_factory=list)
    missing_information: List[str] = field(default_factory=list)

    @property
    def done(self) -> bool:
        return self.state == TaskState.DONE

    @property
    def should_fallback(self) -> bool:
        """True when the cognitive path failed for *technical* reasons (caller may
        try a rule-based flow). A principled BLOCKED stop must NOT fall back."""
        return self.state == TaskState.ABANDONED


# Map a terminal TaskState onto the job ApplicationState the job path expects.
_TASK_TO_APPLICATION_STATE = {
    TaskState.BLOCKED: ApplicationState.BLOCKED,
    TaskState.ABANDONED: ApplicationState.ABANDONED,
}


@dataclass
class ApplyOutcome:
    """Result of one cognitive application attempt (job path adapter)."""

    state: ApplicationState
    summary: str = ""
    steps: int = 0
    missing_information: List[str] = field(default_factory=list)

    @property
    def submitted(self) -> bool:
        return self.state in (ApplicationState.SUBMITTED, ApplicationState.ALREADY_APPLIED)

    @property
    def should_fallback(self) -> bool:
        """True when the cognitive path failed for *technical* reasons and the
        caller should try its rule-based flow. A principled BLOCKED stop (e.g. an
        unanswerable legal question) must NOT fall back into a fabricating flow."""
        return self.state == ApplicationState.ABANDONED

    @classmethod
    def from_task(cls, outcome: "TaskOutcome") -> "ApplyOutcome":
        """Translate a generic TaskOutcome into the job-path ApplyOutcome."""
        if outcome.state == TaskState.DONE:
            state = (
                ApplicationState.ALREADY_APPLIED
                if (outcome.status or "").strip().lower() == "already_applied"
                else ApplicationState.SUBMITTED
            )
        else:
            state = _TASK_TO_APPLICATION_STATE.get(outcome.state, ApplicationState.ABANDONED)
        return cls(
            state=state,
            summary=outcome.summary,
            steps=outcome.steps,
            missing_information=list(outcome.missing_information),
        )
