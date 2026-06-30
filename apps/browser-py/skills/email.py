"""Email skill — read, compose, search, and send emails via webmail interfaces.

Two operating modes:

1. Live-browser mode (default when action is explicit or detected):
   Delegates to EmailAgentOrchestrator, which drives Playwright against Gmail
   or Outlook webmail.  Sending always gates through an approval event so the
   user must confirm before the Send button is clicked.

2. Lightweight fallback mode:
   When the agent cannot be imported (missing dep) or the action is simply
   'navigate', the skill logs a guidance message and returns a navigation item
   without driving the browser — identical to the old behaviour.
"""

from __future__ import annotations

import logging

from .base import Skill, SkillContext

log = logging.getLogger("browser-py.skills.email")

SITES = {
    "gmail": "https://mail.google.com",
    "outlook": "https://outlook.live.com",
}


def _resolve_site(goal: str, job: dict) -> str:
    explicit = (job.get("site") or "").lower()
    if explicit in SITES:
        return explicit
    g = goal.lower()
    if "outlook" in g or "hotmail" in g or "microsoft" in g:
        return "outlook"
    return "gmail"


def _resolve_action(goal: str, job: dict) -> str:
    explicit = (job.get("action") or "").lower()
    if explicit in ("read", "search", "compose", "send", "navigate"):
        return explicit
    g = goal.lower()
    if any(k in g for k in ("send", "email to", "write to")):
        return "send"
    if any(k in g for k in ("compose", "draft", "write email")):
        return "compose"
    if any(k in g for k in ("search", "find email", "look for")):
        return "search"
    if any(k in g for k in ("read", "inbox", "check email", "open mail")):
        return "read"
    return "navigate"


class EmailSkill(Skill):
    name = "email"

    async def run(self, ctx: SkillContext) -> dict:
        goal = ctx.job.get("query") or ctx.goal
        site = _resolve_site(goal, ctx.job)
        action = _resolve_action(goal, ctx.job)

        await ctx.log(
            f"EmailSkill — action={action}, site={site}", source="EmailAgent"
        )

        if action == "navigate":
            # Lightweight guidance path — no browser automation needed.
            url = SITES.get(site, SITES["gmail"])
            try:
                await ctx.page.goto(url, wait_until="domcontentloaded", timeout=30_000)
            except Exception:
                pass
            item = {
                "action": "navigate",
                "site": site,
                "url": url,
                "message": f"Opened {site} webmail interface",
            }
            await ctx.emit_result("emails", [item])
            return self.ok([item])

        # ------------------------------------------------------------------
        # Live-browser path: delegate to EmailAgentOrchestrator
        # ------------------------------------------------------------------
        try:
            from agents.email_agent import EmailAgentOrchestrator
        except Exception as exc:
            await ctx.log(
                f"EmailAgentOrchestrator not available ({exc}); falling back to guidance.",
                source="EmailAgent",
                level="warn",
            )
            return await self._guidance_fallback(ctx, site, action)

        async def _progress(message: str, level: str = "info") -> None:
            await ctx.log(message, source="EmailAgent", level=level)

        agent = EmailAgentOrchestrator(
            page=ctx.page,
            progress_callback=_progress,
        )

        # Build the task_context from the job payload + inferred fields.
        task_context: dict = {
            "action": action,
            "site": site,
            "goal": goal,
            "to": ctx.job.get("to", ""),
            "subject": ctx.job.get("subject", ""),
            "body": ctx.job.get("body", ""),
            "query": ctx.job.get("query") or goal,
            "limit": int(ctx.job.get("limit", 10)),
        }

        result = await agent.execute(task_context)

        outcome_action = result.get("action", action)
        status = result.get("status", "failed")
        emails = result.get("emails") or []

        # Build a summary item matching the shape used by other skills.
        summary = {
            "action": outcome_action,
            "site": site,
            "status": status,
            "count": len(emails),
        }
        if result.get("requiresApproval"):
            summary["requiresApproval"] = True
            summary["message"] = (
                "Email ready to send — requires user approval before sending."
            )
        if result.get("error"):
            summary["error"] = result["error"]

        items = [summary] + emails

        level = "success" if status == "success" else "warn" if status == "requires_approval" else "error"
        await ctx.log(
            f"EmailAgent done — action={outcome_action}, status={status}, emails={len(emails)}",
            source="EmailAgent",
            level=level,
        )
        await ctx.emit_result("emails", items)
        return self.ok(items, status=status if status in ("success", "partial") else "partial")

    # ------------------------------------------------------------------
    # Guidance fallback (no agent available)
    # ------------------------------------------------------------------

    async def _guidance_fallback(
        self, ctx: SkillContext, site: str, action: str
    ) -> dict:
        url = SITES.get(site, SITES["gmail"])

        if action in ("send", "compose"):
            await ctx.log(
                "Email composition requested — approval required before sending.",
                source="EmailAgent",
                level="warn",
            )
            item = {
                "action": "compose",
                "site": site,
                "message": "Email composition flow requires user approval",
                "requiresApproval": True,
            }
            await ctx.emit_result("emails", [item])
            return self.ok([item])

        if action in ("read", "search"):
            await ctx.log(
                f"Opening {site} inbox to read emails", source="EmailAgent"
            )
            item = {
                "action": "read",
                "site": site,
                "message": f"Navigate to {site} inbox to read messages",
            }
            await ctx.emit_result("emails", [item])
            return self.ok([item])

        item = {
            "action": "navigate",
            "site": site,
            "url": url,
            "message": f"Opened {site} webmail interface",
        }
        await ctx.emit_result("emails", [item])
        return self.ok([item])
