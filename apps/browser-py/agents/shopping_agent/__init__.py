"""Shopping Agent package.

Provides ShoppingAgent — a Playwright-driven agent that handles:
  - Product search and price comparison across Amazon, eBay, and Walmart
  - Add-to-cart automation (with coupon application)
  - Checkout flow with mandatory approval gate before any purchase action

The agent is consumed by the skills layer (skills/shopping.py) when a job
carries skill='shopping' and the task context requests live browser actions
(compare, cart, checkout) rather than basic search extraction.

Usage:
    from agents.shopping_agent import ShoppingAgent

    agent = ShoppingAgent(page, publisher, session_id, goal, job, user_id, ai)
    result = await agent.execute(task_context)
"""

from .shopping_agent import ShoppingAgent

__all__ = ["ShoppingAgent"]
