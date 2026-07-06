"""Calendar agent package.

Provides CalendarAgent — a Playwright-driven agent that handles:
  - Creating events on Google Calendar and Outlook Web
  - Finding free time slots / availability windows
  - Detecting scheduling conflicts across a day or week
  - Rescheduling existing meetings
  - Adding travel buffer time before or after events

The agent is consumed by the skills layer (skills/calendar.py) when a job
carries skill='calendar' (or any alias: create_event, find_slot,
detect_conflict, reschedule_event, add_travel_buffer).

Every action that writes or modifies calendar data is gated through the
dashboard approval panel before any browser click is made.  Set
CALENDAR_AUTO_APPROVE=true to skip the gate (autonomous mode, off by default).

Usage:
    from agents.calendar_agent import CalendarAgent

    agent = CalendarAgent(bridge=bridge, page=ctx.page)
    result = await agent.execute(task_context)
"""

from .calendar_agent import CalendarAgent

__all__ = ["CalendarAgent"]
