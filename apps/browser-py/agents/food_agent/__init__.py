"""Food agent package.

Provides FoodAgent — a Playwright-driven agent that handles:
  - Restaurant discovery (Yelp, Google Maps, Google Search)
  - Menu reading (navigates to a restaurant page and extracts the menu)
  - Table reservation (OpenTable, Resy) — always gated by approval
  - Food delivery ordering (DoorDash, Uber Eats) — always gated by approval

The agent is consumed by the skills layer (skills/food.py) when a job
carries skill='food' (or any alias: food_order, restaurant_booking, …).

Usage:
    from agents.food_agent import FoodAgent

    agent = FoodAgent(bridge=bridge, page=ctx.page)
    result = await agent.execute(task_context)
"""

from .food_agent import FoodAgent

__all__ = ["FoodAgent"]
