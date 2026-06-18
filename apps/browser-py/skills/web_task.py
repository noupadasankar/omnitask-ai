"""Web-task skill — run ANY natural-language web goal with the local cognitive
loop (the generalization of the job applier).

It mounts the job_agent cognition package (shared loader), builds a generic
`TaskSpec` from the goal + whatever user knowledge the job carries, and runs the
`TaskAgent` against the engine's already-live page (so the dashboard live view
works). Consequential actions (submit/send/pay/delete/…) are gated through the
SAME approval round-trip the job path uses (approve-before-act); extracted data
is streamed as `agent:result` and persisted to the Digital Twin by the relay.

Safety: `WEB_TASK_DRY_RUN` (default true) runs the full reasoning + approval flow
but stops before the first consequential action. `WEB_TASK_AUTO_APPROVE=true`
skips the gate (autonomous). Per-launch `config.preferences.dryRun/autoApprove`
override the env, mirroring the job skill.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict

from . import _cognition_loader as loader
from .base import Skill, SkillContext

log = logging.getLogger("browser-py.skills.web_task")


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, str(default)))
    except (TypeError, ValueError):
        return default


class WebTaskSkill(Skill):
    """Universal cognitive web agent: observe → reason → act → verify → learn."""

    name = "web_task"

    async def run(self, ctx: SkillContext) -> dict:
        if not loader.is_available():
            await ctx.log(
                f"Cognition package not found at {loader.JOB_AGENT_ROOT} — "
                f"falling back to the generic search skill.",
                source="AIAgent", level="warn",
            )
            from .generic import GenericSkill
            return await GenericSkill().run(ctx)

        config = ctx.job.get("config") or {}
        prefs = config.get("preferences") or {}

        dry_run = _env_bool("WEB_TASK_DRY_RUN", True)
        if isinstance(prefs.get("dryRun"), bool):
            dry_run = prefs["dryRun"]
        auto_approve = _env_bool("WEB_TASK_AUTO_APPROVE", False)
        if isinstance(prefs.get("autoApprove"), bool):
            auto_approve = prefs["autoApprove"]
        approval_timeout_ms = _env_int("WEB_TASK_APPROVAL_TIMEOUT_MS", 300_000)

        # Knowledge the agent may answer from (the only source of truth). The
        # launcher may pass a userProfile; otherwise the agent runs read-only.
        knowledge: Dict[str, Any] = {}
        if isinstance(prefs.get("userProfile"), dict):
            knowledge.update(prefs["userProfile"])
        if isinstance(prefs.get("knowledge"), dict):
            knowledge.update(prefs["knowledge"])

        await ctx.log(
            f"Cognitive web agent starting (dry_run={dry_run}, auto_approve={auto_approve}).",
            source="AIAgent",
        )

        # Per-task approval step counter (unique Redis keys per gated action).
        step_box = {"n": 0}

        async def emit(kind: str, payload: Dict[str, Any]) -> None:
            if kind == "log":
                await ctx.log(payload.get("message", ""), source="Cognition",
                              level=payload.get("level", "info"))
            elif kind == "state":
                await ctx.publisher.publish(
                    ctx.session_id, "cognition:state",
                    {"sessionId": ctx.session_id, "userId": ctx.user_id, **payload},
                )
            elif kind == "trajectory":
                await ctx.publisher.publish(
                    ctx.session_id, "trajectory:step",
                    {"sessionId": ctx.session_id, "userId": ctx.user_id, **payload},
                )

        async def approve(action_info: Dict[str, Any]) -> bool:
            if auto_approve:
                return True
            if await ctx.publisher.is_cancelled(ctx.session_id):
                return False
            step_box["n"] += 1
            idx = step_box["n"]
            await ctx.publisher.publish(ctx.session_id, "approval:required", {
                "sessionId": ctx.session_id,
                "stepIndex": idx,
                "description": action_info.get("description", "Consequential action"),
                "action": action_info.get("tool", "action"),
                "target": str(action_info.get("args", "")),
                "value": "",
            })
            return await ctx.publisher.wait_for_approval(
                ctx.session_id, idx, approval_timeout_ms
            )

        outcome = None
        async with loader.mount_job_agent():
            try:
                from src.cognition.engine import LocalEngine  # type: ignore
                from src.cognition.task_agent import TaskAgent  # type: ignore
                from src.cognition.task_spec import TaskSpec  # type: ignore
            except Exception as exc:  # noqa: BLE001
                await ctx.log(
                    f"Could not import cognition ({exc}); falling back to search skill.",
                    source="AIAgent", level="warn",
                )
                from .generic import GenericSkill
                return await GenericSkill().run(ctx)

            engine = LocalEngine()
            try:
                available = await engine.is_available()
            except Exception:  # noqa: BLE001
                available = False
            if not available:
                await ctx.log(
                    "Local model server (Ollama) not reachable — using the generic "
                    "search skill instead.",
                    source="AIAgent", level="warn",
                )
                from .generic import GenericSkill
                return await GenericSkill().run(ctx)

            agent = TaskAgent(engine, ctx.page, emit=emit, approve=approve, logger=log)
            spec = TaskSpec(goal=ctx.goal, knowledge=knowledge)
            outcome = await agent.run(spec, dry_run=dry_run)

        items = list(outcome.data) if outcome else []
        if items:
            await ctx.emit_result("extracted", items)

        status = "success" if (outcome and outcome.state.value == "DONE") else "partial"
        await ctx.log(
            f"Cognitive web agent finished: {outcome.state.value if outcome else 'UNKNOWN'} "
            f"— {outcome.summary if outcome else ''} ({len(items)} item(s) extracted).",
            source="AIAgent",
            level="success" if status == "success" else "info",
        )
        return self.ok(items, status=status)
