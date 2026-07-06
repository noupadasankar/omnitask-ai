"""CognitiveApplier — the job-application specialization of the generic TaskAgent.

Historically this file held the whole observe→reason→act loop. That loop is now
generic (`task_agent.TaskAgent`); this module is the thin job-specific layer: it
builds a job `TaskSpec` (goal + applicant profile as the only source of truth +
job-application integrity rules) and delegates to the TaskAgent, then translates
the generic `TaskOutcome` back into the `ApplyOutcome` the portal expects.

Submission is already user-approved before this runs (the portal gates each job
through the dashboard approval panel), so the job spec is `pre_approved=True` —
the loop may click the final Submit without raising its own approval request.
"""

from __future__ import annotations

import logging
from typing import Any, Awaitable, Callable, Dict, Optional

from .task_agent import TaskAgent
from .task_spec import TaskSpec
from .world_model import ApplyOutcome

log = logging.getLogger("browser-py.job_agent.cognition")

EmitFn = Callable[[str, Dict[str, Any]], Awaitable[None]]


_JOB_INTEGRITY = (
    "Your task: complete and submit ONE job application.\n"
    "- Fill every required field from the APPLICANT PROFILE. Map each question to "
    "the right value by meaning, not by label text.\n"
    "- Advance multi-step forms (Next / Continue / Review). Re-read each new step.\n"
    "- Uncheck \"Follow company\" / marketing opt-ins unless the profile opts in.\n"
    "- Submission is ALREADY approved by the user — you MAY click the final Submit, "
    "then confirm the success message, dismiss it, and finish(status=\"done\").\n"
    "- NEVER invent experience, skills, credentials, work authorization, identity "
    "facts, or salary. Use ONLY the profile.\n"
    "- If the job is already applied: finish(status=\"already_applied\").\n"
    "- For consequential unanswerable fields (legal/visa/disability/criminal/"
    "demographic/exact pay) not in the profile: request_human then "
    "finish(status=\"blocked\"). Do not guess."
)

_JOB_PLAN_SYS = (
    "You decompose a job-application goal into a short ordered list of concrete "
    "subgoals for a browser agent. Reply as JSON: {\"subgoals\": [\"...\", ...]}. "
    "6 steps max, each a short imperative phrase. No site-specific assumptions."
)

_JOB_FALLBACK_SUBGOALS = [
    "Understand the current page and locate the application entry point",
    "Open the application form",
    "Fill all required fields from the profile",
    "Answer screening questions truthfully",
    "Review the completed application",
    "Submit and confirm the application was sent",
]


class CognitiveApplier:
    """Job-application loop, delegating to the generic TaskAgent."""

    def __init__(self, engine, page, *, emit: Optional[EmitFn] = None,
                 logger: Optional[logging.Logger] = None):
        self.engine = engine
        self.page = page
        self.emit = emit
        self.log = logger or log
        # Submission is pre-approved upstream → no in-loop approval gate.
        self.agent = TaskAgent(engine, page, emit=emit, approve=None, logger=self.log)

    async def apply(self, job: Dict[str, Any], *, profile: Dict[str, Any],
                    context_hint: str = "") -> ApplyOutcome:
        goal = (
            f"Complete and submit the job application for "
            f"\"{job.get('role', 'this role')}\" at "
            f"\"{job.get('company', 'this company')}\"."
        )
        spec = TaskSpec(
            goal=goal,
            knowledge=profile,
            knowledge_label="APPLICANT PROFILE (the only source of truth for answers)",
            integrity_addendum=_JOB_INTEGRITY,
            success_hint="The application is submitted and a confirmation is shown.",
            plan_system=_JOB_PLAN_SYS,
            fallback_subgoals=_JOB_FALLBACK_SUBGOALS,
            pre_approved=True,
        )
        outcome = await self.agent.run(spec, context_hint=context_hint, dry_run=False)
        return ApplyOutcome.from_task(outcome)
