"""Job-application skill — runs the standalone job_agent inside the engine.

This adapts `apps/browser-py/agents/job_agent` (a self-contained Playwright job
applier) so it executes as an OmniTask skill: it drives the engine's already-live
page (so the dashboard live view works), streams every candidate as an
`application:result` event, and gates each submit through the dashboard approval
panel (approve-before-submit). Matching stays 100% rule-based — no external LLM.

Transport notes:
  • Candidates → `application:result` (relayed to the UI + upserted as
    JobApplication rows by WorkerEventRelayService).
  • Submit gate → `approval:required` + poll `omnitask:approval:<sid>:<idx>`
    (the same approval round-trip the engine already uses).

Safety: `JOB_AGENT_DRY_RUN` (default true) runs the full flow + approval but stops
before the real submit. `JOB_AGENT_AUTO_APPROVE=true` skips the gate (autonomous).
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
from pathlib import Path

from .base import Skill, SkillContext

log = logging.getLogger("browser-py.skills.job")

# job_agent couples to its own working directory for config/, data/sessions/,
# logs/ and the SQLite tracker. The engine runs jobs concurrently, so we
# serialize job-application runs to keep the chdir window safe.
_RUN_LOCK = asyncio.Lock()

_JOB_AGENT_ROOT = Path(__file__).resolve().parents[1] / "agents" / "job_agent"


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


class _PortalBridge:
    """Bridges a job_agent portal back to the engine's event bus + approval gate.

    Injected onto every portal (`portal.bridge`). `None` in standalone CLI mode,
    so the original job_agent behavior is completely unchanged when run directly.
    """

    def __init__(self, ctx: SkillContext, *, auto_approve: bool, approval_timeout_ms: int):
        self.ctx = ctx
        self.publisher = ctx.publisher
        self.session_id = ctx.session_id
        self.user_id = ctx.user_id
        self.auto_approve = auto_approve
        self.approval_timeout_ms = approval_timeout_ms
        self._step = 0
        # Terminal records (APPLIED/FAILED/SKIPPED/MATCHED) for the run summary.
        self.applications: list[dict] = []

    def _next_step(self) -> int:
        # Unique per-job index so approval Redis keys never collide.
        self._step += 1
        return self._step

    async def cancelled(self) -> bool:
        """True once the user requests a stop from the dashboard."""
        return await self.publisher.is_cancelled(self.session_id)

    async def emit_application(self, record: dict) -> None:
        """Stream one candidate state to the dashboard (and persist via relay)."""
        status = record.get("status")
        payload = {"sessionId": self.session_id, "userId": self.user_id, **record}
        await self.publisher.publish(self.session_id, "application:result", payload)

        # PENDING_APPROVAL is a transient UI signal — keep only terminal states
        # in the summary the skill returns.
        if status != "PENDING_APPROVAL":
            self.applications.append(payload)
            level = {
                "APPLIED": "success",
                "FAILED": "error",
                "SKIPPED": "warn",
            }.get(status, "info")
            await self.ctx.log(
                f"{status}: {record.get('title')} @ {record.get('company')} "
                f"(score {record.get('score')})",
                source="JobAgent",
                level=level,
            )

    async def gate(self, job: dict, match_result: dict) -> bool:
        """Request approval for a submit and block until the user responds.

        Returns True to proceed with the submit, False on denial/timeout.
        """
        if self.auto_approve:
            return True

        idx = self._next_step()
        await self.publisher.publish(
            self.session_id,
            "approval:required",
            {
                "sessionId": self.session_id,
                "stepIndex": idx,
                "description": (
                    f"Apply to {job.get('role')} at {job.get('company')} "
                    f"(match {match_result.get('match_score')})"
                ),
                "action": "apply",
                "target": job.get("job_url") or job.get("company"),
                "value": job.get("company"),
            },
        )
        return await self.publisher.wait_for_approval(
            self.session_id, idx, self.approval_timeout_ms
        )


class JobApplicationSkill(Skill):
    """Auto-apply across job portals with live view + approve-before-submit."""

    name = "job_application"

    async def run(self, ctx: SkillContext) -> dict:
        if not _JOB_AGENT_ROOT.exists():
            await ctx.log(
                f"job_agent not found at {_JOB_AGENT_ROOT}", source="JobAgent", level="error"
            )
            return self.ok([], status="partial")

        override = (ctx.job.get("config") or {}).get("preferences") or {}
        dry_run = _env_bool("JOB_AGENT_DRY_RUN", True)
        if isinstance(override.get("dryRun"), bool):
            dry_run = override["dryRun"]
        auto_approve = _env_bool("JOB_AGENT_AUTO_APPROVE", False)

        bridge = _PortalBridge(
            ctx,
            auto_approve=auto_approve,
            approval_timeout_ms=_env_int("JOB_AGENT_APPROVAL_TIMEOUT_MS", 300_000),
        )

        await ctx.log(
            f"Starting job agent (dry_run={dry_run}, auto_approve={auto_approve})",
            source="JobAgent",
        )

        # Serialize: chdir + sys.path mutation are process-global, and the engine
        # runs jobs concurrently. One job-application run at a time.
        async with _RUN_LOCK:
            await self._run_locked(ctx, bridge, override, dry_run)

        applied = sum(1 for a in bridge.applications if a.get("status") == "APPLIED")
        await ctx.log(
            f"Job agent finished — {applied} applied, {len(bridge.applications)} evaluated.",
            source="JobAgent",
            level="success" if applied else "info",
        )
        return self.ok(bridge.applications)

    async def _run_locked(self, ctx, bridge, override, dry_run) -> None:
        prev_cwd = os.getcwd()
        path_added = False
        root = str(_JOB_AGENT_ROOT)
        orchestrator = None
        try:
            os.chdir(root)
            if root not in sys.path:
                sys.path.insert(0, root)
                path_added = True

            try:
                from src.agent.orchestrator import JobAgentOrchestrator  # type: ignore
            except Exception as exc:  # noqa: BLE001 — surface a clear dependency hint
                await ctx.log(
                    f"Could not import job_agent ({exc}). Ensure its deps are installed "
                    f"(pip install -r agents/job_agent/requirements.txt) and a resume "
                    f"exists in agents/job_agent/config/.",
                    source="JobAgent",
                    level="error",
                )
                raise

            orchestrator = JobAgentOrchestrator(
                config_path="config/preferences.yaml",
                bridge=bridge,
                preferences_override=override,
            )
            await orchestrator.run(
                page=ctx.page,
                context=ctx.page.context,
                dry_run=dry_run,
            )
        finally:
            if orchestrator is not None:
                try:
                    orchestrator.close()
                except Exception:  # noqa: BLE001
                    pass
            os.chdir(prev_cwd)
            if path_added:
                try:
                    sys.path.remove(root)
                except ValueError:
                    pass
