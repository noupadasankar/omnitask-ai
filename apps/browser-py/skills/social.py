"""Social skill — AI content drafting and live browser social automation.

Two operating modes:

1. AI-draft mode (default, fast):
   Generates post drafts from the goal (optionally grounded in live trend
   research). Posting is intentionally NOT automated without explicit browser
   action — the Node side gates each draft through an approval panel before
   any real publish happens.

2. Live-browser mode (activated when job carries action='post', 'read', or
   platform='twitter'/'linkedin' with a matching action):
   Delegates to SocialAgent, which drives Playwright to post, draft-fill, or
   read notifications on Twitter/X and LinkedIn. Also gated by an approval
   log so the user has visibility before any submit is clicked.
"""

from .base import Skill, SkillContext
from . import search


def _wants_live_browser(ctx: SkillContext) -> bool:
    """Return True when the job explicitly requests browser-side automation.

    Criteria (any one sufficient):
      - job['action'] is 'post', 'read', or 'draft' (draft still opens the
        compose box rather than just generating text)
      - job['platform'] is set AND job['action'] indicates a real action
    """
    action = (ctx.job.get("action") or "").lower()
    platform = (ctx.job.get("platform") or "").lower()
    live_actions = {"post", "read", "draft"}
    # 'post' or 'read' always means browser; 'draft' only if platform given.
    if action in ("post", "read"):
        return True
    if action == "draft" and platform in ("twitter", "x", "linkedin"):
        return True
    return False


class SocialSkill(Skill):
    name = "social"

    async def run(self, ctx: SkillContext) -> dict:
        if _wants_live_browser(ctx):
            return await self._run_browser(ctx)
        return await self._run_ai_draft(ctx)

    # ------------------------------------------------------------------
    # Mode 1: live Playwright automation via SocialAgent
    # ------------------------------------------------------------------

    async def _run_browser(self, ctx: SkillContext) -> dict:
        """Delegate to SocialAgent for live Twitter/X and LinkedIn automation."""
        await ctx.log(f"Social browser agent starting: {ctx.goal}", source="SocialAgent")
        try:
            from agents.social_agent import SocialAgent
            agent = SocialAgent(
                page=ctx.page,
                publisher=ctx.publisher,
                session_id=ctx.session_id,
                goal=ctx.goal,
                job=ctx.job,
                user_id=ctx.user_id,
                ai=ctx.ai,
            )
            result = await agent.execute()
        except Exception as exc:
            await ctx.log(f"SocialAgent error: {exc}", source="SocialAgent", level="error")
            result = {
                "action": "unknown",
                "platform": "unknown",
                "content": "",
                "status": "failed",
                "items": [],
                "error": str(exc),
            }

        status = result.get("status", "failed")
        action = result.get("action", "unknown")
        platform = result.get("platform", "unknown")
        await ctx.log(
            f"Social agent done — action={action}, platform={platform}, status={status}",
            source="SocialAgent",
            level="success" if status == "success" else "error",
        )

        items = result.get("items") or []
        summary = {
            "action": action,
            "platform": platform,
            "content": result.get("content", ""),
            "status": status,
        }
        if result.get("error"):
            summary["error"] = result["error"]

        output = [summary] + (items if action == "read" else [])
        await ctx.emit_result("social", output)
        return self.ok(output, status=status)

    # ------------------------------------------------------------------
    # Mode 2: pure AI drafting (original fast path — no browser nav)
    # ------------------------------------------------------------------

    async def _run_ai_draft(self, ctx: SkillContext) -> dict:
        """Generate post drafts using AI, grounded in live trend research."""
        await ctx.log(f"Drafting social content: {ctx.goal}", source="SocialAgent")

        # Optional: ground drafts in live trends.
        trends = await search.web_search(ctx.page, f"{ctx.goal} trending 2026")
        trend_titles = [t.get("title", "") for t in trends[:5]]

        drafts = []
        if ctx.ai.available:
            data = await ctx.ai.extract_json(
                "You are a social media manager. Return strict JSON "
                '{"posts":[{"platform":"linkedin|twitter","text":"...","hashtags":["..."]}]}.',
                f"Goal: {ctx.goal}\nTrending context: {trend_titles}\n"
                "Write 5 concise, engaging posts. No preamble.",
            )
            if data and isinstance(data.get("posts"), list):
                drafts = data["posts"][:7]

        if not drafts:
            # Heuristic fallback so the skill is useful without an LLM key.
            drafts = [{"platform": "linkedin", "text": f"Thoughts on: {ctx.goal}", "hashtags": []}]

        for i, d in enumerate(drafts):
            await ctx.log(
                f"Draft {i + 1} [{d.get('platform')}]: {d.get('text','')[:160]}",
                source="SocialAgent",
            )

        await ctx.log("Drafts ready — approve before posting.", source="SocialAgent", level="success")
        await ctx.emit_result("social_drafts", drafts)
        return self.ok(drafts)
