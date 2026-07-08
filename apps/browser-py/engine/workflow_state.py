"""Workflow state machine — multi-step task state tracking + full save/restore.

Tracks step progress, stores browser context snapshots, supports resume
after failure, and provides rollback to any checkpoint.
"""

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field, asdict
from typing import Optional

log = logging.getLogger("browser-py.engine.workflow_state")


@dataclass
class StepState:
    step_id: str
    status: str          # pending | running | completed | failed | skipped
    agent: str
    action_type: str
    instruction: str
    started_at: Optional[float]
    completed_at: Optional[float]
    output: Optional[dict]
    error: Optional[str]
    retry_count: int


@dataclass
class Checkpoint:
    checkpoint_id: str
    step_id: str
    timestamp: float
    url: str
    cookies: list        # serialized cookies
    local_storage: dict
    page_title: str
    form_data: dict      # any form data filled so far


@dataclass
class WorkflowState:
    workflow_id: str
    task_id: str
    user_id: str
    domain: str
    goal: str
    status: str          # pending | running | paused | completed | failed | cancelled
    total_steps: int
    completed_steps: int
    failed_steps: int
    current_step_id: Optional[str]
    steps: list          # list[StepState]
    checkpoints: list    # list[Checkpoint]
    start_time: float
    end_time: Optional[float]
    exit_reason: Optional[str]
    metadata: dict


class WorkflowStateManager:
    """Manages the full lifecycle of a multi-step browser workflow."""

    def __init__(self):
        self._states: dict[str, WorkflowState] = {}

    def create(
        self,
        workflow_id: str,
        task_id: str,
        user_id: str,
        goal: str,
        domain: str,
        steps: list[dict],
    ) -> WorkflowState:
        """Initialize a new workflow with all steps in 'pending' state."""
        step_states = [
            StepState(
                step_id=str(s.get("step_id", i)),
                status="pending",
                agent=s.get("agent", ""),
                action_type=s.get("action_type", ""),
                instruction=s.get("instruction", ""),
                started_at=None,
                completed_at=None,
                output=None,
                error=None,
                retry_count=0,
            )
            for i, s in enumerate(steps)
        ]

        state = WorkflowState(
            workflow_id=workflow_id,
            task_id=task_id,
            user_id=user_id,
            domain=domain,
            goal=goal,
            status="pending",
            total_steps=len(step_states),
            completed_steps=0,
            failed_steps=0,
            current_step_id=None,
            steps=step_states,
            checkpoints=[],
            start_time=time.time(),
            end_time=None,
            exit_reason=None,
            metadata={},
        )
        self._states[workflow_id] = state
        return state

    def get(self, workflow_id: str) -> Optional[WorkflowState]:
        return self._states.get(workflow_id)

    def start_step(self, workflow_id: str, step_id: str) -> bool:
        """Mark a step as running."""
        state = self._states.get(workflow_id)
        if not state:
            return False
        step = self._find_step(state, step_id)
        if not step:
            return False
        step.status = "running"
        step.started_at = time.time()
        state.current_step_id = step_id
        state.status = "running"
        log.debug("workflow %s: step %s started", workflow_id, step_id)
        return True

    def complete_step(
        self,
        workflow_id: str,
        step_id: str,
        output: dict = {},
    ) -> bool:
        """Mark a step as completed with its output."""
        state = self._states.get(workflow_id)
        if not state:
            return False
        step = self._find_step(state, step_id)
        if not step:
            return False
        step.status = "completed"
        step.completed_at = time.time()
        step.output = output
        state.completed_steps += 1
        log.debug("workflow %s: step %s completed", workflow_id, step_id)
        return True

    def fail_step(
        self,
        workflow_id: str,
        step_id: str,
        error: str,
        *,
        skip: bool = False,
    ) -> bool:
        """Mark a step as failed (or skipped)."""
        state = self._states.get(workflow_id)
        if not state:
            return False
        step = self._find_step(state, step_id)
        if not step:
            return False
        step.status = "skipped" if skip else "failed"
        step.completed_at = time.time()
        step.error = error
        state.failed_steps += 1
        log.info("workflow %s: step %s %s — %s", workflow_id, step_id, step.status, error)
        return True

    def increment_retry(self, workflow_id: str, step_id: str) -> int:
        """Increment retry count for a step. Returns new count."""
        state = self._states.get(workflow_id)
        if not state:
            return 0
        step = self._find_step(state, step_id)
        if not step:
            return 0
        step.retry_count += 1
        return step.retry_count

    async def save_checkpoint(self, workflow_id: str, step_id: str, page) -> Optional[Checkpoint]:
        """Save a full browser state checkpoint for later recovery."""
        state = self._states.get(workflow_id)
        if not state:
            return None

        cp_id = f"{workflow_id}:{step_id}:{int(time.time())}"
        url = ""
        title = ""
        cookies = []
        local_storage = {}
        form_data = {}

        try:
            url = page.url
            title = await page.title()
        except Exception:
            pass

        try:
            cookies = await page.context.cookies()
        except Exception:
            pass

        try:
            local_storage = await page.evaluate("""() => {
                const result = {};
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    result[key] = localStorage.getItem(key);
                }
                return result;
            }""")
        except Exception:
            pass

        try:
            form_data = await page.evaluate("""() => {
                const result = {};
                document.querySelectorAll('input, select, textarea').forEach(el => {
                    if (el.name || el.id) {
                        result[el.name || el.id] = el.value;
                    }
                });
                return result;
            }""")
        except Exception:
            pass

        cp = Checkpoint(
            checkpoint_id=cp_id,
            step_id=step_id,
            timestamp=time.time(),
            url=url,
            cookies=cookies,
            local_storage=local_storage,
            page_title=title,
            form_data=form_data,
        )
        state.checkpoints.append(cp)
        log.debug("checkpoint saved: %s (url=%s)", cp_id, url)
        return cp

    async def restore_checkpoint(self, workflow_id: str, page, *, checkpoint_id: str = "") -> bool:
        """Restore browser state from a saved checkpoint.

        If checkpoint_id is empty, restores the most recent checkpoint.
        """
        state = self._states.get(workflow_id)
        if not state or not state.checkpoints:
            return False

        cp = next(
            (c for c in reversed(state.checkpoints) if c.checkpoint_id == checkpoint_id),
            state.checkpoints[-1],
        ) if checkpoint_id else state.checkpoints[-1]

        try:
            # Navigate to the saved URL
            if cp.url:
                await page.goto(cp.url, wait_until="domcontentloaded", timeout=15000)

            # Restore cookies
            if cp.cookies:
                try:
                    await page.context.add_cookies(cp.cookies)
                except Exception:
                    pass

            # Restore localStorage
            if cp.local_storage:
                try:
                    await page.evaluate("""(data) => {
                        Object.entries(data).forEach(([k, v]) => localStorage.setItem(k, v));
                    }""", cp.local_storage)
                except Exception:
                    pass

            log.info("Restored checkpoint %s (url=%s)", cp.checkpoint_id, cp.url)
            return True
        except Exception as exc:
            log.warning("restore_checkpoint failed: %s", exc)
            return False

    def complete_workflow(
        self,
        workflow_id: str,
        *,
        success: bool,
        exit_reason: str = "",
    ) -> bool:
        """Mark the entire workflow as completed or failed."""
        state = self._states.get(workflow_id)
        if not state:
            return False
        state.status = "completed" if success else "failed"
        state.end_time = time.time()
        state.exit_reason = exit_reason
        state.current_step_id = None
        return True

    def pause(self, workflow_id: str) -> bool:
        state = self._states.get(workflow_id)
        if not state:
            return False
        state.status = "paused"
        return True

    def resume(self, workflow_id: str) -> bool:
        state = self._states.get(workflow_id)
        if not state:
            return False
        state.status = "running"
        return True

    def get_progress(self, workflow_id: str) -> dict:
        """Return a concise progress summary."""
        state = self._states.get(workflow_id)
        if not state:
            return {}
        return {
            "workflow_id": workflow_id,
            "status": state.status,
            "total_steps": state.total_steps,
            "completed_steps": state.completed_steps,
            "failed_steps": state.failed_steps,
            "pct_complete": round(state.completed_steps / max(state.total_steps, 1) * 100, 1),
            "current_step": state.current_step_id,
            "duration_s": round(time.time() - state.start_time, 1),
            "checkpoints": len(state.checkpoints),
        }

    def get_pending_steps(self, workflow_id: str) -> list[StepState]:
        """Return all steps that haven't been completed or skipped."""
        state = self._states.get(workflow_id)
        if not state:
            return []
        return [s for s in state.steps if s.status in ("pending", "failed")]

    def get_next_step(self, workflow_id: str) -> Optional[StepState]:
        """Return the next pending step."""
        pending = self.get_pending_steps(workflow_id)
        return pending[0] if pending else None

    def to_dict(self, workflow_id: str) -> dict:
        """Serialize workflow state to a plain dict."""
        state = self._states.get(workflow_id)
        if not state:
            return {}
        return asdict(state)

    @classmethod
    def from_dict(cls, data: dict) -> "WorkflowStateManager":
        """Deserialize a workflow state from a dict (e.g. from Redis)."""
        mgr = cls()
        steps = [StepState(**s) for s in data.get("steps", [])]
        checkpoints = [Checkpoint(**c) for c in data.get("checkpoints", [])]
        state = WorkflowState(
            workflow_id=data["workflow_id"],
            task_id=data.get("task_id", ""),
            user_id=data.get("user_id", ""),
            domain=data.get("domain", ""),
            goal=data.get("goal", ""),
            status=data.get("status", "pending"),
            total_steps=data.get("total_steps", len(steps)),
            completed_steps=data.get("completed_steps", 0),
            failed_steps=data.get("failed_steps", 0),
            current_step_id=data.get("current_step_id"),
            steps=steps,
            checkpoints=checkpoints,
            start_time=data.get("start_time", time.time()),
            end_time=data.get("end_time"),
            exit_reason=data.get("exit_reason"),
            metadata=data.get("metadata", {}),
        )
        mgr._states[state.workflow_id] = state
        return mgr

    # ── Private helpers ───────────────────────────────────────────────────────

    def _find_step(self, state: WorkflowState, step_id: str) -> Optional[StepState]:
        return next((s for s in state.steps if s.step_id == step_id), None)
