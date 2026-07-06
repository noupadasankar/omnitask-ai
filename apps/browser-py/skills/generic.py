"""Generic skill — the default for any goal without a specific domain.

Searches the web, extracts results, and (if AI is available) answers the goal
from what it found. This is the universal "do anything I ask" fallback.
"""

from .base import Skill, SkillContext
from . import search, extract


class GenericSkill(Skill):
    name = "generic"

    async def run(self, ctx: SkillContext) -> dict:
        await ctx.log(f"Working on: {ctx.goal}", source="AIAgent")
        results = await search.web_search(ctx.page, ctx.goal)
        await ctx.log(f"Found {len(results)} results.", source="AIAgent",
                      level="success" if results else "warn")

        # Open the top result so the live view lands on a real page.
        if results and results[0].get("url"):
            try:
                await ctx.page.goto(results[0]["url"], wait_until="domcontentloaded", timeout=25_000)
            except Exception:
                pass

        if ctx.ai.available and results:
            context_text = "\n".join(f"- {r.get('title')}: {r.get('snippet')}" for r in results[:8])
            answer = await ctx.ai.summarize(
                context_text, f"Answer the user's goal using these results: '{ctx.goal}'. Be concise."
            )
            if answer:
                await ctx.log(answer, source="AIAgent", level="success")

        await ctx.emit_result("links", results)
        return self.ok(results)
