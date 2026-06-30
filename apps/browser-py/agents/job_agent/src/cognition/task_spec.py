"""TaskSpec — the parameterization that turns the generic cognitive loop into a
specific task.

The same SEE→THINK→ACT→VERIFY→LEARN engine (`task_agent.TaskAgent`) drives any
web task; a `TaskSpec` supplies what differs per task:

  • the goal,
  • the KNOWLEDGE block (the ONLY source of truth the agent may answer from),
  • an integrity addendum layered onto the generic system prompt,
  • optional planner overrides,
  • whether consequential actions are already approved upstream (the job path
    gates each submit in `base_portal` BEFORE the loop runs, so it must NOT
    double-gate), and the risk threshold above which an action is treated as
    consequential.

Job application is just one `TaskSpec` (built in `applier.CognitiveApplier`).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class TaskSpec:
    """Describes one task for the generic cognitive loop."""

    goal: str
    # The only material the agent may use for any value it enters. For a job
    # this is the applicant profile; for a generic task it's the user profile +
    # whatever inputs the task carries (may be empty for pure read/extract).
    knowledge: Dict[str, Any] = field(default_factory=dict)
    # Heading shown above the knowledge block in the transcript.
    knowledge_label: str = "KNOWLEDGE (the only source of truth for answers)"
    # Task-specific rules appended to the generic system prompt.
    integrity_addendum: str = ""
    # Free-text hint about what "done" looks like for this task.
    success_hint: str = ""

    # Optional planner overrides (else the generic planner prompt is used).
    plan_system: Optional[str] = None
    fallback_subgoals: Optional[List[str]] = None

    # When True, consequential actions are assumed already approved upstream
    # (the job path gates each submit in base_portal), so the loop executes them
    # without raising its own approval request. When False, the loop asks the
    # injected `approve` callback before any consequential action.
    pre_approved: bool = False
    # Model self-assessed risk at/above which a page action is "consequential".
    sensitive_risk_threshold: float = 0.6

    def knowledge_text(self) -> str:
        import json
        return json.dumps(self.knowledge, ensure_ascii=False, indent=2, default=str)
