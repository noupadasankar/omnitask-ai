"""Finance skill — banking, expense tracking, bill payment via browser.

Dispatched by the executor when the backend sends a job with:
  skill = 'finance' | 'expense_tracking' | 'financial_report' |
          'budget_management' | 'spending_analysis'

Delegates to the standalone FinanceAgent in agents/finance_agent/, wiring it
into the engine's live page, event bus, and approval gate (the same pattern
the JobApplicationSkill uses for the job_agent).

Approval gate:
  Any pay_bill action is gated through the dashboard approval panel before any
  browser action is taken.  FINANCE_AUTO_APPROVE=true skips the gate (autonomous
  mode, dangerous for payment flows — off by default).

Event types published:
  finance_balance      — account balance query result
  finance_transactions — recent transaction list
  finance_payment      — bill payment approval / portal-open record
  finance_expenses     — expense-tracking summary
  finance_report       — financial report / budget summary
"""

from __future__ import annotations

import logging
import os
import sys
from pathlib import Path

from .base import Skill, SkillContext

log = logging.getLogger("browser-py.skills.finance")

# Root of the standalone finance agent directory.
_FINANCE_AGENT_ROOT = Path(__file__).resolve().parent.parent / "agents" / "finance_agent"


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


class _FinanceBridge:
    """Adapts SkillContext to the interface FinanceAgent expects.

    Mirrors the _PortalBridge in job_application.py:
      - Streams log lines to the dashboard terminal.
      - Gates pay_bill actions via the approval panel.
      - Emits structured results to the UI (finance_*/finance_report events).
      - Exposes the AI client so FinanceAgent can use summarize/extract_json.

    In standalone CLI mode this bridge is None so the agent runs headless.
    """

    def __init__(self, ctx: SkillContext, *, auto_approve: bool, approval_timeout_ms: int):
        self.ctx = ctx
        self.auto_approve = auto_approve
        self.approval_timeout_ms = approval_timeout_ms
        self._step = 0
        # Expose the engine AI client so the agent can call ai.summarize etc.
        self.ai = ctx.ai

    def _next_step(self) -> int:
        self._step += 1
        return self._step

    async def log(self, message: str, level: str = "info") -> None:
        await self.ctx.log(message, source="FinanceAgent", level=level)

    async def emit_result(self, kind: str, items: list) -> None:
        await self.ctx.emit_result(kind, items)

    async def cancelled(self) -> bool:
        return await self.ctx.publisher.is_cancelled(self.ctx.session_id)

    async def gate(self, description: str, step_data: dict) -> bool:
        """Request user approval before a bill payment.

        Published as approval:required; waits for the dashboard response.
        Auto-approved when auto_approve=True or FINANCE_AUTO_APPROVE env var is set.
        """
        if self.auto_approve:
            await self.log("Auto-approved payment gate (FINANCE_AUTO_APPROVE=true)", level="warn")
            return True

        idx = self._next_step()
        await self.ctx.publisher.publish(
            self.ctx.session_id,
            "approval:required",
            {
                "sessionId":   self.ctx.session_id,
                "stepIndex":   idx,
                "description": description,
                "action":      "pay_bill",
                "target":      step_data.get("payee"),
                "value":       str(step_data.get("amount") or ""),
            },
        )
        return await self.ctx.publisher.wait_for_approval(
            self.ctx.session_id, idx, self.approval_timeout_ms
        )


class FinanceSkill(Skill):
    """Browser-driven finance skill: balance checks, transactions, bill payment.

    Wraps the standalone FinanceAgent and plugs it into the OmniTask engine
    (live page, event bus, approval gate) — the same pattern as JobApplicationSkill.
    """

    name = "finance"

    async def run(self, ctx: SkillContext) -> dict:
        if not _FINANCE_AGENT_ROOT.exists():
            await ctx.log(
                f"finance_agent directory not found at {_FINANCE_AGENT_ROOT}",
                source="FinanceAgent",
                level="error",
            )
            return self.ok([], status="partial")

        auto_approve = _env_bool("FINANCE_AUTO_APPROVE", False)

        bridge = _FinanceBridge(
            ctx,
            auto_approve=auto_approve,
            approval_timeout_ms=int(os.environ.get("FINANCE_APPROVAL_TIMEOUT_MS", "300000")),
        )

        task_type = (ctx.job.get("task_type") or ctx.job.get("skill") or "").lower()
        query     = ctx.job.get("query") or ctx.goal
        portal    = (ctx.job.get("portal") or ctx.job.get("site") or "").lower()

        task_context = {
            "goal":      ctx.goal,
            "task_type": task_type,
            "portal":    portal,
            "query":     query,
            "payee":     ctx.job.get("payee"),
            "amount":    ctx.job.get("amount"),
            "due_date":  ctx.job.get("due_date"),
            "config":    ctx.job.get("config") or {},
        }

        await ctx.log(
            f"Finance skill starting (task_type={task_type!r}, auto_approve={auto_approve})",
            source="FinanceAgent",
        )

        return await self._run_agent(ctx, bridge, task_context)

    async def _run_agent(
        self,
        ctx: SkillContext,
        bridge: _FinanceBridge,
        task_context: dict,
    ) -> dict:
        """Import and run the FinanceAgent with the engine's live page wired in."""

        # Guard: serialize import so concurrent jobs don't race on sys.path.
        # (Matches the pattern in JobApplicationSkill._run_locked.)
        _orig_path = sys.path[:]
        _orig_modules = {k: v for k, v in sys.modules.items() if k.startswith("finance")}

        try:
            # Prepend the agent root so its relative imports resolve correctly.
            if str(_FINANCE_AGENT_ROOT) not in sys.path:
                sys.path.insert(0, str(_FINANCE_AGENT_ROOT))

            try:
                from finance_agent import FinanceAgent  # type: ignore
            except ImportError as exc:
                await ctx.log(
                    f"Could not import FinanceAgent ({exc}). "
                    "Ensure agents/finance_agent/ is present and browser-py deps are installed.",
                    source="FinanceAgent",
                    level="error",
                )
                raise

            agent = FinanceAgent(bridge=bridge, page=ctx.page)
            outcome = await agent.execute(task_context)

        finally:
            # Restore sys.path + remove any newly imported finance_agent modules
            # so the next run gets a clean import (concurrent job isolation).
            sys.path[:] = _orig_path
            for k in list(sys.modules.keys()):
                if k.startswith("finance") and k not in _orig_modules:
                    del sys.modules[k]

        items  = outcome.get("items", [])
        action = outcome.get("action", "unknown")
        status = outcome.get("status", "success")

        level = "success" if status == "success" else ("warn" if status == "partial" else "error")
        await ctx.log(
            f"Finance agent finished — action={action}, {len(items)} item(s), status={status}",
            source="FinanceAgent",
            level=level,
        )

        return self.ok(items, status=status)
