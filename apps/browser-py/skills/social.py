"""Social skill — AI content drafting (no autonomous posting).

Generates post drafts from the goal (optionally informed by live trend research).
Posting is intentionally NOT automated here: per the platform safety policy, the
first post of any campaign requires explicit user approval, handled on the Node
side. This skill produces the drafts to approve.
"""

from .base import Skill, SkillContext
from . import search


class SocialSkill(Skill):
    name = "social"

    async def run(self, ctx: SkillContext) -> dict:
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
            await ctx.log(f"Draft {i + 1} [{d.get('platform')}]: {d.get('text','')[:160]}",
                          source="SocialAgent")

        await ctx.log("Drafts ready — approve before posting.", source="SocialAgent", level="success")
        await ctx.emit_result("social_drafts", drafts)
        return self.ok(drafts)
