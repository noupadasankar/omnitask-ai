"""Shopping skill — search a marketplace, extract product cards, stream listings.

Scoring/decision happens in the Node ShoppingModule (POST /shopping/evaluate);
this skill produces the real product data that feeds it. Checkout stays gated by
approve-before-pay on the Node side.
"""

import asyncio
from urllib.parse import quote_plus

from .base import Skill, SkillContext
from . import search, extract

SITE_SEARCH = {
    "amazon": "https://www.amazon.in/s?k={q}",
    "flipkart": "https://www.flipkart.com/search?q={q}",
}


def _pick_site(goal: str) -> str | None:
    g = goal.lower()
    for site in SITE_SEARCH:
        if site in g:
            return site
    return None


class ShoppingSkill(Skill):
    name = "shopping"

    async def run(self, ctx: SkillContext) -> dict:
        query = ctx.job.get("query") or ctx.goal
        site = ctx.job.get("site") or _pick_site(ctx.goal)

        if site and site in SITE_SEARCH:
            url = SITE_SEARCH[site].format(q=quote_plus(query))
            await ctx.log(f"Searching {site} for: {query}", source="ShoppingAgent")
            try:
                await ctx.page.goto(url, wait_until="domcontentloaded", timeout=30_000)
                await asyncio.sleep(2)
            except Exception:
                await ctx.log(f"{site} navigation failed — falling back to web search.", source="ShoppingAgent", level="warn")
                await search.web_search(ctx.page, f"{query} buy online")
        else:
            await ctx.log(f"Searching the web for: {query}", source="ShoppingAgent")
            await search.web_search(ctx.page, f"{query} price buy online")

        cards = await extract.product_cards(ctx.page)
        await ctx.log(f"Extracted {len(cards)} product listings.", source="ShoppingAgent",
                      level="success" if cards else "warn")

        products = []
        for i, c in enumerate(cards):
            products.append({
                "site": site or "web",
                "externalProductId": (c.get("url") or c.get("title") or f"item-{i}")[:200],
                "title": c.get("title"),
                "price": c.get("price"),
                "rating": c.get("rating"),
                "url": c.get("url"),
            })

        await ctx.emit_result("products", products)
        return self.ok(products)
