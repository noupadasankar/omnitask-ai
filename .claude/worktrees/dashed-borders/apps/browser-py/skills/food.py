"""Food skill — discover restaurants/dishes, stream options.

Restaurant discovery via web/Swiggy/Zomato search + card extraction. Ordering +
payment remain gated by approval on the Node side (Food plugins).
"""

import asyncio
from urllib.parse import quote_plus

from .base import Skill, SkillContext
from . import search, extract

SITE_SEARCH = {
    "swiggy": "https://www.swiggy.com/search?query={q}",
    "zomato": "https://www.zomato.com/search?q={q}",
}


def _pick_site(goal: str) -> str | None:
    g = goal.lower()
    for site in SITE_SEARCH:
        if site in g:
            return site
    return None


class FoodSkill(Skill):
    name = "food"

    async def run(self, ctx: SkillContext) -> dict:
        query = ctx.job.get("query") or ctx.goal
        site = ctx.job.get("site") or _pick_site(ctx.goal)

        if site and site in SITE_SEARCH:
            await ctx.log(f"Searching {site} for: {query}", source="FoodAgent")
            try:
                await ctx.page.goto(SITE_SEARCH[site].format(q=quote_plus(query)),
                                    wait_until="domcontentloaded", timeout=30_000)
                await asyncio.sleep(2)
            except Exception:
                await search.web_search(ctx.page, f"{query} order online")
        else:
            await ctx.log(f"Searching the web for: {query}", source="FoodAgent")
            await search.web_search(ctx.page, f"{query} restaurants near me order")

        cards = await extract.product_cards(ctx.page)  # dish/restaurant cards carry prices too
        await ctx.log(f"Found {len(cards)} food options.", source="FoodAgent",
                      level="success" if cards else "warn")

        options = [{
            "site": site or "web",
            "title": c.get("title"),
            "price": c.get("price"),
            "rating": c.get("rating"),
            "url": c.get("url"),
        } for c in cards]

        await ctx.emit_result("food", options)
        return self.ok(options)
