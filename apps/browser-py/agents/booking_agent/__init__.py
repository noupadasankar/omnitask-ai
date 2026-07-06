"""Booking agent package.

Provides BookingAgent — a Playwright-driven agent that handles:
  - Restaurant reservations (OpenTable, Resy)
  - Appointment booking (generic booking portals)
  - Event ticket purchase / availability check (Ticketmaster, StubHub)

The agent is consumed by the skills layer (skills/booking.py) when a job
carries skill='booking' (or any alias: ticket_booking, hotel_booking,
restaurant_booking, appointment, reservation).

Usage:
    from agents.booking_agent import BookingAgent

    agent = BookingAgent(page=ctx.page, publisher=ctx.publisher,
                         session_id=ctx.session_id, goal=ctx.goal,
                         job=ctx.job, user_id=ctx.user_id, ai=ctx.ai)
    result = await agent.execute(task_context)
"""

from .booking_agent import BookingAgent

__all__ = ["BookingAgent"]
