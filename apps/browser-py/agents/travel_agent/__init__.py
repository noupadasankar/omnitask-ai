"""Travel agent package.

Provides TravelAgent — a Playwright-driven agent that handles:
  - Flight search (Google Flights, Kayak)
  - Hotel search (Booking.com, Hotels.com)
  - Itinerary building (aggregated multi-leg travel plan)

The agent is consumed by the skills layer (skills/travel.py) when a job
carries skill='travel' (or any alias: search_flights, search_hotels,
build_itinerary, flight_search, hotel_search).

Every payment / booking confirmation action is ALWAYS gated through the
dashboard approval panel before any browser click is made.

Usage:
    from agents.travel_agent import TravelAgent

    agent = TravelAgent(bridge=bridge, page=page)
    result = await agent.execute(task_context)
"""

from .travel_agent import TravelAgent

__all__ = ["TravelAgent"]
