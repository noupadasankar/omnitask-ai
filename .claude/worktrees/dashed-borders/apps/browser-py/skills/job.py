"""Job skill — search a portal, extract job cards, stream postings.

Scoring/dedupe/tracking happens in the Node JobModule (POST /job/evaluate);
this skill produces the real postings that feed it. Auto-apply stays gated by
approve-before-submit on the Node side.
"""

import asyncio
from urllib.parse import quote_plus

from .base import Skill, SkillContext
from . import search, extract

PORTAL_SEARCH = {
    "naukri": "https://www.naukri.com/{q}-jobs",
    "linkedin": "https://www.linkedin.com/jobs/search/?keywords={q}",
    "indeed": "https://www.indeed.com/jobs?q={q}",
    "wellfound": "https://wellfound.com/role/r/{q}",
}


def _pick_portal(goal: str) -> str | None:
    g = goal.lower()
    for portal in PORTAL_SEARCH:
        if portal in g:
            return portal
    return None


class JobSkill(Skill):
    name = "job"

    async def run(self, ctx: SkillContext) -> dict:
        query = ctx.job.get("query") or ctx.goal
        portal = ctx.job.get("portal") or _pick_portal(ctx.goal)

        if portal and portal in PORTAL_SEARCH:
            slug = quote_plus(query) if portal != "naukri" else query.lower().replace(" ", "-")
            url = PORTAL_SEARCH[portal].format(q=slug)
            await ctx.log(f"Searching {portal} for: {query}", source="JobAgent")
            try:
                await ctx.page.goto(url, wait_until="domcontentloaded", timeout=30_000)
                await asyncio.sleep(2)
            except Exception:
                await ctx.log(f"{portal} navigation failed — falling back to web search.", source="JobAgent", level="warn")
                await search.web_search(ctx.page, f"{query} jobs")
        else:
            await ctx.log(f"Searching the web for: {query} jobs", source="JobAgent")
            await search.web_search(ctx.page, f"{query} jobs apply")

        cards = await extract.job_cards(ctx.page)
        await ctx.log(f"Extracted {len(cards)} job postings.", source="JobAgent",
                      level="success" if cards else "warn")

        jobs = []
        for i, c in enumerate(cards):
            jobs.append({
                "portal": portal or "web",
                "externalJobId": (c.get("url") or c.get("title") or f"job-{i}")[:200],
                "title": c.get("title"),
                "company": c.get("company"),
                "location": c.get("location"),
                "url": c.get("url"),
            })

        await ctx.emit_result("jobs", jobs)
        return self.ok(jobs)
