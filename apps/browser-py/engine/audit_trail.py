"""Audit trail — full observability for every browser automation step.

Records timestamp, URL, screenshot, DOM snapshot, AI reasoning, network timing,
errors, recovery attempts, risk level, agent, target element, verification result,
and final status for every action. Produces ChatML JSONL export for QLoRA fine-tuning.
"""

import base64
import hashlib
import json
import logging
import time
from dataclasses import dataclass, field, asdict
from typing import Optional

log = logging.getLogger("browser-py.engine.audit_trail")


@dataclass
class StepRecord:
    # Core identification
    step_id: str
    timestamp: float
    url: str
    action: str
    agent: str                          # BROWSER_AGENT|VISION_AGENT|DATA_AGENT|FORM_AGENT|VERIFIER_AGENT
    # Input/output
    inputs: dict
    outputs: dict
    target_element: Optional[str]       # CSS selector or description of the element
    # Observability
    screenshot_b64: Optional[str]
    dom_snapshot: Optional[str]
    ai_reasoning: str
    network_timing_ms: Optional[float]
    # Error tracking
    errors: list
    recovery_attempts: int
    # Risk and status
    risk_level: str                     # READ_ONLY|LOW_RISK|HIGH_RISK|CRITICAL
    verification_result: Optional[str]  # passed|failed|skipped|unknown
    outcome: str                        # success|failure|skipped|pending
    final_status: str                   # completed|failed|skipped|pending|cancelled
    duration_ms: float

    def to_dict(self) -> dict:
        d = asdict(self)
        if d.get("screenshot_b64") and len(d["screenshot_b64"]) > 200:
            d["screenshot_b64"] = d["screenshot_b64"][:200] + "...[truncated]"
        return d


class AuditTrail:
    """Records every step of a browser automation session."""

    def __init__(self, session_id: str, task_id: Optional[str] = None):
        self.session_id = session_id
        self.task_id = task_id
        self._steps: list[StepRecord] = []
        self._step_counter: int = 0
        self._current_step: Optional[StepRecord] = None
        self._session_start = time.time()

    # ── Recording ────────────────────────────────────────────────────────────

    async def record(
        self,
        page,
        action: str,
        inputs: dict,
        outcome: str,
        ai_reasoning: str = "",
        capture_screenshot: bool = True,
        capture_dom: bool = False,
        agent: str = "BROWSER_AGENT",
        target_element: Optional[str] = None,
        risk_level: str = "LOW_RISK",
    ) -> StepRecord:
        """Record a completed step with full observability data."""
        self._step_counter += 1
        step_id = f"{self.session_id}_{self._step_counter:04d}"

        url = ""
        try:
            url = page.url
        except Exception:
            pass

        screenshot_b64 = None
        if capture_screenshot:
            screenshot_b64 = await self.take_screenshot(page)

        dom_snapshot = None
        if capture_dom:
            try:
                dom_snapshot = await page.content()
            except Exception:
                pass

        start = self._session_start if not self._steps else self._steps[-1].timestamp
        duration_ms = (time.time() - start) * 1000

        record = StepRecord(
            step_id=step_id,
            timestamp=time.time(),
            url=url,
            action=action,
            agent=agent,
            inputs=inputs,
            outputs={},
            target_element=target_element,
            screenshot_b64=screenshot_b64,
            dom_snapshot=dom_snapshot,
            ai_reasoning=ai_reasoning,
            network_timing_ms=None,
            errors=[],
            recovery_attempts=0,
            risk_level=risk_level,
            verification_result=None,
            outcome=outcome,
            final_status="pending" if outcome == "pending" else ("completed" if outcome == "success" else "failed"),
            duration_ms=duration_ms,
        )

        self._steps.append(record)
        self._current_step = record
        log.debug("Audit: step %s agent=%s action=%s outcome=%s", step_id, agent, action, outcome)
        return record

    def add_error(self, step_id: str, error: str) -> None:
        """Append an error to an existing step record."""
        for step in reversed(self._steps):
            if step.step_id == step_id:
                step.errors.append(error)
                if step.outcome == "success":
                    step.outcome = "failure"
                    step.final_status = "failed"
                return
        if self._steps:
            self._steps[-1].errors.append(error)

    def add_recovery(self, step_id: str) -> None:
        """Increment recovery attempt counter for a step."""
        for step in reversed(self._steps):
            if step.step_id == step_id:
                step.recovery_attempts += 1
                return
        if self._steps:
            self._steps[-1].recovery_attempts += 1

    def set_output(self, step_id: str, outputs: dict) -> None:
        """Attach structured output data to a step."""
        for step in reversed(self._steps):
            if step.step_id == step_id:
                step.outputs = outputs
                return

    def set_verification(self, step_id: str, result: str) -> None:
        """Set verification result for a step: passed|failed|skipped|unknown."""
        for step in reversed(self._steps):
            if step.step_id == step_id:
                step.verification_result = result
                return

    def set_risk(self, step_id: str, risk_level: str) -> None:
        """Update risk level for a step."""
        for step in reversed(self._steps):
            if step.step_id == step_id:
                step.risk_level = risk_level
                return

    def set_final_status(self, step_id: str, final_status: str) -> None:
        """Set final status: completed|failed|skipped|pending|cancelled."""
        for step in reversed(self._steps):
            if step.step_id == step_id:
                step.final_status = final_status
                return

    # ── Retrieval ─────────────────────────────────────────────────────────────

    def get_trail(self) -> list[StepRecord]:
        return list(self._steps)

    def get_summary(self) -> dict:
        total = len(self._steps)
        succeeded = sum(1 for s in self._steps if s.outcome == "success")
        failed = sum(1 for s in self._steps if s.outcome == "failure")
        total_duration = sum(s.duration_ms for s in self._steps)
        last_url = self._steps[-1].url if self._steps else ""
        total_recoveries = sum(s.recovery_attempts for s in self._steps)
        verif_passed = sum(1 for s in self._steps if s.verification_result == "passed")
        verif_failed = sum(1 for s in self._steps if s.verification_result == "failed")

        return {
            "session_id": self.session_id,
            "task_id": self.task_id,
            "total_steps": total,
            "succeeded": succeeded,
            "failed": failed,
            "skipped": total - succeeded - failed,
            "success_rate": round(succeeded / total * 100, 1) if total else 0.0,
            "total_duration_ms": round(total_duration, 1),
            "total_recovery_attempts": total_recoveries,
            "verification_passed": verif_passed,
            "verification_failed": verif_failed,
            "last_url": last_url,
        }

    def to_json(self) -> str:
        return json.dumps(
            {
                "session_id": self.session_id,
                "task_id": self.task_id,
                "summary": self.get_summary(),
                "steps": [s.to_dict() for s in self._steps],
            },
            indent=2,
            default=str,
        )

    def export_for_training(self) -> list[dict]:
        """Export audit trail as ChatML-format dicts for QLoRA fine-tuning."""
        examples = []
        for step in self._steps:
            if not step.ai_reasoning:
                continue
            system_msg = (
                "You are an expert browser automation agent. "
                "Given the page state, choose the correct next action."
            )
            user_msg = (
                f"URL: {step.url}\n"
                f"Action needed: {step.action}\n"
                f"Agent: {step.agent}\n"
                f"Target: {step.target_element or 'unspecified'}\n"
                f"Risk: {step.risk_level}\n"
                f"Inputs: {json.dumps(step.inputs)}\n"
                f"Outcome: {step.outcome}"
            )
            assistant_msg = step.ai_reasoning
            examples.append({
                "messages": [
                    {"role": "system", "content": system_msg},
                    {"role": "user", "content": user_msg},
                    {"role": "assistant", "content": assistant_msg},
                ],
                "step_id": step.step_id,
                "outcome": step.outcome,
                "verification_result": step.verification_result,
                "risk_level": step.risk_level,
            })
        return examples

    def export_security_audit(self) -> list[dict]:
        """Export a security-focused audit log of HIGH_RISK and CRITICAL steps."""
        return [
            {
                "step_id": s.step_id,
                "timestamp": s.timestamp,
                "url": s.url,
                "action": s.action,
                "agent": s.agent,
                "target_element": s.target_element,
                "risk_level": s.risk_level,
                "recovery_attempts": s.recovery_attempts,
                "verification_result": s.verification_result,
                "final_status": s.final_status,
                "outcome": s.outcome,
                "errors": s.errors,
            }
            for s in self._steps
            if s.risk_level in ("HIGH_RISK", "CRITICAL")
        ]

    # ── Helpers ───────────────────────────────────────────────────────────────

    async def take_screenshot(self, page) -> Optional[str]:
        """Capture page screenshot as base64. Swallows all errors."""
        try:
            raw = await page.screenshot(type="jpeg", quality=70, full_page=False)
            return base64.b64encode(raw).decode()
        except Exception:
            return None

    def fingerprint(self) -> str:
        """MD5 of the full audit trail for dedup / change detection."""
        content = "".join(f"{s.step_id}{s.action}{s.outcome}" for s in self._steps)
        return hashlib.md5(content.encode()).hexdigest()

    def __len__(self) -> int:
        return len(self._steps)

    def __repr__(self) -> str:
        s = self.get_summary()
        return f"<AuditTrail session={self.session_id} steps={s['total_steps']} success_rate={s['success_rate']}%>"
