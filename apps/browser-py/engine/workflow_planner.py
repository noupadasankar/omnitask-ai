"""Workflow planner — smart task decomposition, dependency estimation, rollback points."""

import logging
import re
import uuid
from dataclasses import dataclass, field
from typing import Optional

log = logging.getLogger("browser-py.engine.workflow_planner")

_DOMAIN_COMPLETION_PATTERNS = {
    "job": {
        "url_fragments": ["/applied", "/application-submitted", "/confirmation", "/thank-you"],
        "text_signals": ["application submitted", "applied successfully", "your application", "application received"],
    },
    "food": {
        "url_fragments": ["/order-confirmed", "/confirmation", "/order-placed", "/success"],
        "text_signals": ["order confirmed", "order placed", "your order", "delivery estimated"],
    },
    "shopping": {
        "url_fragments": ["/order-confirmed", "/checkout/success", "/thank-you", "/order/"],
        "text_signals": ["order confirmed", "order placed", "payment successful", "shipped"],
    },
    "travel": {
        "url_fragments": ["/booking-confirmed", "/confirmation", "/itinerary", "/reservation"],
        "text_signals": ["booking confirmed", "reservation confirmed", "confirmation number"],
    },
    "email": {
        "url_fragments": [],
        "text_signals": ["message sent", "email sent", "sent successfully"],
    },
    "social": {
        "url_fragments": [],
        "text_signals": ["posted", "shared", "published", "your post"],
    },
    "calendar": {
        "url_fragments": [],
        "text_signals": ["event created", "added to calendar", "invitation sent"],
    },
    "booking": {
        "url_fragments": ["/confirmed", "/confirmation", "/reservation"],
        "text_signals": ["booking confirmed", "reservation confirmed", "confirmation number"],
    },
    "finance": {
        "url_fragments": ["/success", "/confirmation", "/receipt"],
        "text_signals": ["payment successful", "transaction complete", "transfer complete"],
    },
}


@dataclass
class PlannedStep:
    step_id: str
    action_type: str
    agent: str
    instruction: str
    depends_on: list = field(default_factory=list)
    risk_level: str = "LOW"
    is_optional: bool = False
    rollback_step_id: Optional[str] = None
    estimated_duration_ms: int = 3000
    tags: list = field(default_factory=list)


@dataclass
class WorkflowPlan:
    plan_id: str
    goal: str
    domain: str
    total_steps: int
    steps: list
    rollback_points: list
    optional_branches: list
    predicted_completion_pages: list
    completion_conditions: list


class WorkflowPlanner:
    """Decomposes natural language goals into structured execution plans."""

    def decompose(
        self,
        goal: str,
        domain: str,
        context: dict = {},
    ) -> WorkflowPlan:
        """Break a goal into ordered PlannedStep objects."""
        plan_id = str(uuid.uuid4())
        steps: list[PlannedStep] = []
        sid = 0

        def next_id() -> str:
            nonlocal sid
            sid += 1
            return str(sid)

        # Step 1: Always start with vision analysis
        steps.append(PlannedStep(
            step_id=next_id(),
            action_type="analyze",
            agent="VISION_AGENT",
            instruction="Analyze the current browser state — identify URL, page type, and any blockers.",
            depends_on=[],
            risk_level="LOW",
            estimated_duration_ms=5000,
            tags=["init"],
        ))

        # Step 2: Navigate to domain entry point
        nav_url = self._get_entry_url(domain, goal, context)
        if nav_url:
            prev_id = steps[-1].step_id
            steps.append(PlannedStep(
                step_id=next_id(),
                action_type="navigate",
                agent="BROWSER_AGENT",
                instruction=f"Navigate to {nav_url}",
                depends_on=[prev_id],
                risk_level="LOW",
                estimated_duration_ms=5000,
                tags=["navigation"],
            ))
            steps.append(PlannedStep(
                step_id=next_id(),
                action_type="verify",
                agent="VISION_AGENT",
                instruction=f"Verify navigation to {nav_url} succeeded. Check for login walls, CAPTCHAs, or errors.",
                depends_on=[steps[-1].step_id],
                risk_level="LOW",
                estimated_duration_ms=3000,
                tags=["verify"],
            ))

        # Domain-specific steps
        domain_steps = self._domain_steps(domain, goal, context)
        for ds in domain_steps:
            ds.step_id = next_id()
            if steps:
                ds.depends_on = [steps[-1].step_id]
            steps.append(ds)

        # Final verification step
        steps.append(PlannedStep(
            step_id=next_id(),
            action_type="verify_completion",
            agent="VERIFIER_AGENT",
            instruction=f"Verify the full task is complete: '{goal}'",
            depends_on=[steps[-1].step_id] if steps else [],
            risk_level="LOW",
            estimated_duration_ms=5000,
            tags=["final_verify"],
        ))

        rollback_points = self.identify_rollback_points(steps)
        completion = self.predict_completion(domain, goal)
        conditions = self.define_completion_conditions(domain)

        return WorkflowPlan(
            plan_id=plan_id,
            goal=goal,
            domain=domain,
            total_steps=len(steps),
            steps=steps,
            rollback_points=rollback_points,
            optional_branches=[],
            predicted_completion_pages=completion,
            completion_conditions=conditions,
        )

    def identify_rollback_points(self, steps: list[PlannedStep]) -> list[str]:
        """Return step_ids that are safe checkpoints for rollback."""
        rollback = []
        for step in steps:
            # Checkpoint after navigation steps and before HIGH risk steps
            if step.action_type == "navigate" and "navigation" in step.tags:
                rollback.append(step.step_id)
            if step.risk_level in ("HIGH", "CRITICAL"):
                # The step just before is the rollback point
                idx = steps.index(step)
                if idx > 0:
                    rollback.append(steps[idx - 1].step_id)
        return list(dict.fromkeys(rollback))  # Deduplicate

    def estimate_dependencies(self, steps: list[PlannedStep]) -> list[PlannedStep]:
        """Fill depends_on based on sequential order."""
        for i, step in enumerate(steps):
            if not step.depends_on and i > 0:
                step.depends_on = [steps[i - 1].step_id]
        return steps

    def predict_completion(self, domain: str, goal: str) -> list[str]:
        """Return URL fragments that signal task completion."""
        return _DOMAIN_COMPLETION_PATTERNS.get(domain, {}).get("url_fragments", ["/confirmation", "/success"])

    def define_completion_conditions(self, domain: str) -> list[str]:
        """Return text-based completion signals."""
        return _DOMAIN_COMPLETION_PATTERNS.get(domain, {}).get(
            "text_signals", ["task completed", "success", "confirmed"]
        )

    def validate_plan(self, plan: WorkflowPlan) -> list[str]:
        """Validate a plan for structural issues. Returns list of error strings."""
        issues = []
        step_ids = {s.step_id for s in plan.steps}
        prev_was_browser = False

        for step in plan.steps:
            # Check dependencies exist
            for dep in step.depends_on:
                if dep not in step_ids:
                    issues.append(f"Step {step.step_id}: depends_on '{dep}' which doesn't exist")

            # Check BROWSER_AGENT always followed by VISION_AGENT
            if prev_was_browser and step.agent != "VISION_AGENT":
                issues.append(f"Step {step.step_id}: BROWSER_AGENT step not followed by VISION_AGENT")

            prev_was_browser = step.agent == "BROWSER_AGENT"

            # Check HIGH/CRITICAL has approval
            if step.risk_level in ("HIGH", "CRITICAL") and "requires_approval" not in step.tags:
                issues.append(f"Step {step.step_id} is {step.risk_level} risk but missing 'requires_approval' tag")

        return issues

    def optimize_plan(self, plan: WorkflowPlan) -> WorkflowPlan:
        """Remove redundant steps and optimize the plan."""
        steps = list(plan.steps)

        # Remove consecutive duplicate verify steps
        optimized = []
        prev_action = ""
        for step in steps:
            if step.action_type == "verify" and prev_action == "verify":
                continue
            optimized.append(step)
            prev_action = step.action_type

        plan.steps = optimized
        plan.total_steps = len(optimized)
        return plan

    # ── Private helpers ───────────────────────────────────────────────────────

    def _get_entry_url(self, domain: str, goal: str, context: dict) -> str:
        urls = {
            "job": "https://www.linkedin.com/jobs/",
            "food": "https://www.zomato.com/",
            "shopping": "https://www.amazon.in/",
            "travel": "https://www.google.com/travel/flights",
            "research": "https://www.google.com/",
            "email": "https://mail.google.com/",
            "calendar": "https://calendar.google.com/",
            "social": "https://www.linkedin.com/",
            "media": "https://www.youtube.com/",
            "booking": "https://www.booking.com/",
            "finance": "https://www.google.com/",
            "file": "https://drive.google.com/",
        }
        # Allow context to override
        if context.get("entry_url"):
            return context["entry_url"]
        return urls.get(domain, "https://www.google.com/")

    def _domain_steps(
        self, domain: str, goal: str, context: dict
    ) -> list[PlannedStep]:
        """Generate domain-specific steps (high-level skeleton)."""
        goal_lower = goal.lower()
        steps = []

        if domain == "job":
            steps = [
                PlannedStep(step_id="", action_type="type", agent="BROWSER_AGENT",
                    instruction="Type job search query into the search field",
                    risk_level="LOW", tags=["search"]),
                PlannedStep(step_id="", action_type="verify", agent="VISION_AGENT",
                    instruction="Verify search results loaded", risk_level="LOW", tags=["verify"]),
                PlannedStep(step_id="", action_type="extract_list", agent="DATA_AGENT",
                    instruction="Extract job listings from search results",
                    risk_level="LOW", tags=["extract"]),
                PlannedStep(step_id="", action_type="click", agent="BROWSER_AGENT",
                    instruction="Click on first matching job listing",
                    risk_level="LOW", tags=["navigate"]),
                PlannedStep(step_id="", action_type="verify", agent="VISION_AGENT",
                    instruction="Verify job detail page loaded", risk_level="LOW", tags=["verify"]),
                PlannedStep(step_id="", action_type="fill_form", agent="FORM_AGENT",
                    instruction="Fill job application form with user profile data",
                    risk_level="MEDIUM", tags=["form_fill"]),
                PlannedStep(step_id="", action_type="click", agent="BROWSER_AGENT",
                    instruction="Click Apply button",
                    risk_level="HIGH", tags=["submit", "requires_approval"]),
            ]

        elif domain == "food":
            steps = [
                PlannedStep(step_id="", action_type="type", agent="BROWSER_AGENT",
                    instruction="Search for restaurant or dish", risk_level="LOW", tags=["search"]),
                PlannedStep(step_id="", action_type="verify", agent="VISION_AGENT",
                    instruction="Verify search results", risk_level="LOW", tags=["verify"]),
                PlannedStep(step_id="", action_type="click", agent="BROWSER_AGENT",
                    instruction="Select restaurant from results", risk_level="LOW", tags=["navigate"]),
                PlannedStep(step_id="", action_type="click", agent="BROWSER_AGENT",
                    instruction="Add items to cart", risk_level="LOW", tags=["cart"]),
                PlannedStep(step_id="", action_type="click", agent="BROWSER_AGENT",
                    instruction="Proceed to checkout",
                    risk_level="HIGH", tags=["checkout", "requires_approval"]),
            ]

        elif domain == "research":
            steps = [
                PlannedStep(step_id="", action_type="type", agent="BROWSER_AGENT",
                    instruction="Type research query", risk_level="LOW", tags=["search"]),
                PlannedStep(step_id="", action_type="verify", agent="VISION_AGENT",
                    instruction="Verify results loaded", risk_level="LOW", tags=["verify"]),
                PlannedStep(step_id="", action_type="extract_list", agent="DATA_AGENT",
                    instruction="Extract search results", risk_level="LOW", tags=["extract"]),
            ]

        else:
            steps = [
                PlannedStep(step_id="", action_type="analyze", agent="VISION_AGENT",
                    instruction=f"Analyze page to determine next action for: {goal}",
                    risk_level="LOW", tags=["analyze"]),
            ]

        return steps
