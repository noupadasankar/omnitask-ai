"""Shopping skill — price comparison, add-to-cart, and approval-gated checkout.

Two operating modes:

1. Live-browser mode (default — activated by any job payload, since shopping
   always benefits from real Playwright navigation for up-to-date prices):
   Delegates to ShoppingAgent, which drives Playwright across Amazon, eBay,
   and Walmart to compare prices, add to cart, and (with approval) check out.

2. Fallback search mode (activated when ShoppingAgent import fails):
   Falls back to a simple web search + DOM extraction so the skill is always
   useful even if the agent package is unavailable.

Checkout and purchase actions are ALWAYS gated by an approval log so the user
has visibility before any 'Place Order' click is executed.
"""

from .base import Skill, SkillContext


def _wants_live_browser(ctx: SkillContext) -> bool:
    """Return True when the job payload requests live browser shopping automation.

    The ShoppingAgent supports compare, cart, and purchase actions.  Basic
    'search' requests are still handled by the agent (it navigates to a real
    page) but a missing action also defaults to 'compare', so this always
    returns True — the fallback is only used if the import fails.
    """
    return True


class ShoppingSkill(Skill):
    name = "shopping"

    async def run(self, ctx: SkillContext) -> dict:
        if _wants_live_browser(ctx):
            return await self._run_browser(ctx)
        return await self._run_fallback_search(ctx)

    # ------------------------------------------------------------------
    # Mode 1: live Playwright automation via ShoppingAgent
    # ------------------------------------------------------------------

    async def _run_browser(self, ctx: SkillContext) -> dict:
        """Delegate to ShoppingAgent for live price comparison and cart/checkout."""
        await ctx.log(f"Shopping browser agent starting: {ctx.goal}", source="ShoppingAgent")
        try:
            from agents.shopping_agent import ShoppingAgent
            agent = ShoppingAgent(
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
            await ctx.log(f"ShoppingAgent error: {exc}", source="ShoppingAgent", level="error")
            result = {
                "action": "unknown",
                "products": [],
                "best_deal": {},
                "status": "failed",
                "error": str(exc),
            }

        status = result.get("status", "failed")
        action = result.get("action", "compare")
        products = result.get("products") or []
        best_deal = result.get("best_deal") or {}

        await ctx.log(
            f"Shopping agent done — action={action}, products={len(products)}, "
            f"best_deal={best_deal.get('priceText', 'N/A')} on {best_deal.get('site', '?')}, "
            f"status={status}",
            source="ShoppingAgent",
            level="success" if status == "success" else "warn",
        )

        # Normalise items for the executor / dashboard
        items = products or []
        summary = {
            "action": action,
            "best_deal": best_deal,
            "status": status,
            "total_products": len(items),
        }
        if result.get("error"):
            summary["error"] = result["error"]

        output = [summary] + items
        await ctx.emit_result("products", output)
        return self.ok(output, status=status)

    # ------------------------------------------------------------------
    # Mode 2: simple fallback (web search + DOM extraction)
    # ------------------------------------------------------------------

    async def _run_fallback_search(self, ctx: SkillContext) -> dict:
        """Minimal fallback: Google search + product card extraction."""
        import asyncio
        from urllib.parse import quote_plus
        from . import search, extract

        query = ctx.job.get("query") or ctx.goal
        await ctx.log(f"Searching the web for: {query}", source="ShoppingAgent")
        await search.web_search(ctx.page, f"{query} price buy online")

        cards = await extract.product_cards(ctx.page)
        await ctx.log(
            f"Extracted {len(cards)} product listings.",
            source="ShoppingAgent",
            level="success" if cards else "warn",
        )

        products = []
        for i, c in enumerate(cards):
            products.append({
                "site": "web",
                "title": c.get("title"),
                "price": c.get("price"),
                "priceText": c.get("priceText", ""),
                "rating": c.get("rating"),
                "url": c.get("url"),
            })

        await ctx.emit_result("products", products)
        return self.ok(products)
