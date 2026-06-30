"""
Calendar Agent
Autonomous browser agent for Google Calendar and Outlook web calendar management.

Supports:
  - Creating events (Google Calendar, Outlook Web)
  - Finding free slots / availability windows
  - Detecting scheduling conflicts
  - Rescheduling existing meetings
  - Adding travel buffer time before / after events

Usage (standalone CLI):
    python calendar_agent.py

Usage (as an OmniTask skill — injected by skills/calendar.py):
    agent = CalendarAgent(bridge=bridge, page=page)
    result = await agent.execute(task_context)

The `bridge` parameter is None in standalone mode (no live dashboard, no
approval gate). When injected by the skill dispatcher it exposes the same
PortalBridge-style interface used by BookingAgent / FinanceAgent for streaming
events and gating every create/modify action through the approval panel.

All consequential actions (creating an event, modifying/rescheduling a
meeting) are ALWAYS gated through bridge.gate() before any browser click is
made. CALENDAR_AUTO_APPROVE=true skips the gate (autonomous mode, off by
default).
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import quote_plus

log = logging.getLogger("calendar_agent")


# ---------------------------------------------------------------------------
# Portal catalogue
# ---------------------------------------------------------------------------

CALENDAR_PORTALS: Dict[str, str] = {
    "google":  "https://calendar.google.com/calendar/r",
    "outlook": "https://outlook.live.com/calendar/0/view/month",
    "office365": "https://outlook.office.com/calendar/view/month",
}

# Task-type → action label (mirrors BookingAgent / FinanceAgent convention).
TASK_ACTION_MAP: Dict[str, str] = {
    # Canonical task types the backend CalendarDomainAgent will send.
    "create_event":      "create_event",
    "find_slot":         "find_slot",
    "find_free_slot":    "find_slot",
    "detect_conflict":   "detect_conflict",
    "check_conflicts":   "detect_conflict",
    "reschedule":        "reschedule",
    "reschedule_event":  "reschedule",
    "add_travel_buffer": "add_travel_buffer",
    "travel_buffer":     "add_travel_buffer",
    # Generic aliases
    "calendar":          "find_slot",
    "schedule":          "create_event",
    "book_meeting":      "create_event",
    "meeting":           "create_event",
    "event":             "create_event",
}

# Selectors tried in sequence to find the "Save / Create" button on
# calendar create-event pages.  Self-heals: the first one that exists wins.
SAVE_EVENT_SELECTORS: List[str] = [
    "button[data-id='save']",
    "button[jsname*='save']",
    "button[aria-label*='Save']",
    "button[aria-label*='Create']",
    "[data-testid*='save']",
    "[class*='save-button']",
    "button:has-text('Save')",
    "button:has-text('Create')",
    "button:has-text('Done')",
    "input[type='submit'][value*='Save']",
]

# Selectors for the "New event" / "New meeting" button.
NEW_EVENT_SELECTORS: List[str] = [
    "button[aria-label='Create new event']",
    "button[data-view='compose']",
    "[jsname='V67aGc']",                      # Google Calendar FAB
    "[class*='new-event']",
    "button:has-text('New event')",
    "button:has-text('New Event')",
    "button:has-text('New meeting')",
    "[aria-label='New event']",
    "[aria-label='New meeting']",
]

# Selectors for the event title input field.
EVENT_TITLE_SELECTORS: List[str] = [
    "input[aria-label*='title']",
    "input[aria-label*='Title']",
    "input[placeholder*='title']",
    "input[placeholder*='Add title']",
    "input[data-testid*='title']",
    "[contenteditable='true'][aria-label*='title']",
    "#xDetGc",                                # Google Calendar quick-add
    ".x5xSmb-title-input",
]

# Selectors for event date/time pickers.
EVENT_DATE_SELECTORS: List[str] = [
    "input[aria-label*='Start date']",
    "input[aria-label*='start date']",
    "input[data-testid*='start-date']",
    "[class*='start-date']",
    "input[placeholder*='Start date']",
]

EVENT_TIME_SELECTORS: List[str] = [
    "input[aria-label*='Start time']",
    "input[aria-label*='start time']",
    "input[data-testid*='start-time']",
    "[class*='start-time']",
    "input[placeholder*='Start time']",
]

# Selectors for existing calendar event blocks (for conflict/free-slot detection).
EVENT_BLOCK_SELECTORS: List[str] = [
    "[data-eventid]",
    "[data-eventchip]",
    "[class*='KF4T3b']",          # Google Calendar event chip
    "[class*='calendar-event']",
    "[class*='event-block']",
    "[role='button'][data-datekey]",
    "[class*='eventcell']",        # Outlook
    "[data-occurrence-id]",        # Outlook
]


class CalendarAgent:
    """Autonomous browser agent for Google Calendar and Outlook Web.

    Constructor mirrors BookingAgent so the skill wrapper can treat both
    agents uniformly.

    Args:
        bridge:  OmniTask event bridge (None = standalone CLI mode).
                 Must expose:
                   await bridge.log(msg, level='info')
                   await bridge.gate(description, step_data) -> bool
                   await bridge.emit_result(kind, items)
                   await bridge.cancelled() -> bool
                   bridge.ai             — AIClient (may be None)
        page:    Playwright Page injected by the skill (None = standalone).
        config:  Optional dict with portal / credential hints.
    """

    def __init__(
        self,
        bridge: Optional[Any] = None,
        page: Optional[Any] = None,
        config: Optional[Dict] = None,
    ) -> None:
        self.bridge = bridge
        self.page = page
        self.config = config or {}
        self.logger = logging.getLogger("CalendarAgent")

        self._results: List[Dict] = []
        self._start_time: Optional[datetime] = None
        self._end_time: Optional[datetime] = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def execute(self, task_context: Dict) -> Dict:
        """Entry point called by skills/calendar.py (and directly in CLI mode).

        Args:
            task_context: dict with keys:
                goal          — natural-language goal string
                action        — requested action (create_event|find_slot|
                                detect_conflict|reschedule|add_travel_buffer)
                portal        — optional portal hint ('google'|'outlook')
                title         — event title for create/reschedule
                date          — ISO date or human string (e.g. '2026-07-04')
                start_time    — time string (e.g. '10:00 AM')
                end_time      — time string (e.g. '11:00 AM')
                duration_mins — integer, event length in minutes
                attendees     — list of email strings
                location      — optional event location / meeting URL
                description   — optional event description
                travel_buffer_mins — int, buffer minutes to add for travel
                config        — optional per-run overrides

        Returns:
            {
                "action":          "create_event" | "find_slot"
                                   | "detect_conflict" | "reschedule"
                                   | "add_travel_buffer",
                "event":           {...},           # structured event details
                "conflicts":       [...],           # list of conflicting events
                "suggested_times": [...],           # free-slot suggestions
                "status":          "success" | "partial" | "failed",
                "items":           [...],           # list consumed by Skill.ok()
            }
        """
        self._start_time = datetime.now()

        goal       = task_context.get("goal", "")
        task_type  = task_context.get("action") or task_context.get("task_type", "")
        portal_key = (task_context.get("portal") or "").lower()
        query      = task_context.get("query") or goal

        action      = self._resolve_action(task_type, goal)
        portal_name, portal_url = self._resolve_portal(portal_key, goal)

        await self._log(
            f"Starting calendar task: action={action}, portal={portal_name or 'google'}",
            level="info",
        )

        if await self._cancelled():
            return self._result("cancelled", action, [], status="partial")

        try:
            if action == "create_event":
                items = await self._create_event(
                    portal_name, portal_url, query, task_context
                )

            elif action == "find_slot":
                items = await self._find_free_slot(
                    portal_name, portal_url, query, task_context
                )

            elif action == "detect_conflict":
                items = await self._detect_conflicts(
                    portal_name, portal_url, query, task_context
                )

            elif action == "reschedule":
                items = await self._reschedule_event(
                    portal_name, portal_url, query, task_context
                )

            elif action == "add_travel_buffer":
                items = await self._add_travel_buffer(
                    portal_name, portal_url, query, task_context
                )

            else:
                # Default: find a free slot (safe, read-only path).
                items = await self._find_free_slot(
                    portal_name, portal_url, query, task_context
                )

        except Exception as exc:  # noqa: BLE001
            self.logger.error("CalendarAgent error: %s", exc, exc_info=True)
            await self._log(f"Calendar task failed: {exc}", level="error")
            return self._result("error", action, [], status="failed")

        finally:
            self._end_time = datetime.now()

        await self._log(
            f"Calendar task complete — {len(items)} item(s) returned.",
            level="success",
        )
        return self._result("done", action, items, status="success")

    # ------------------------------------------------------------------
    # Action implementations
    # ------------------------------------------------------------------

    async def _create_event(
        self,
        portal_name: Optional[str],
        portal_url: Optional[str],
        query: str,
        task_context: Dict,
    ) -> List[Dict]:
        """Navigate to the calendar and gate event creation through the approval panel."""
        title         = task_context.get("title") or query or "New Event"
        date          = task_context.get("date", "")
        start_time    = task_context.get("start_time", "")
        end_time      = task_context.get("end_time", "")
        duration_mins = task_context.get("duration_mins")
        attendees     = task_context.get("attendees") or []
        location      = task_context.get("location", "")
        description   = task_context.get("description", "")

        await self._log(
            f"Preparing to create event: '{title}' on {date} at {start_time}",
            level="info",
        )

        candidate: Dict = {
            "action":      "create_event",
            "portal":      portal_name or "google",
            "title":       title,
            "date":        date,
            "start_time":  start_time,
            "end_time":    end_time,
            "duration_mins": duration_mins,
            "attendees":   attendees,
            "location":    location,
            "description": description,
            "url":         portal_url or CALENDAR_PORTALS.get("google", ""),
            "timestamp":   datetime.now().isoformat(),
            "status":      "PENDING_APPROVAL",
        }

        # Gate: require explicit approval before any write to the calendar.
        approved = await self._gate(
            description=(
                f"Create calendar event: '{title}'"
                + (f" on {date}" if date else "")
                + (f" at {start_time}" if start_time else "")
                + (f" — {len(attendees)} attendee(s)" if attendees else "")
            ),
            step_data=candidate,
        )

        if not approved:
            await self._log("Event creation denied or timed out — skipping.", level="warn")
            candidate["status"] = "DENIED"
            await self._emit("calendar_create", [candidate])
            return [candidate]

        # Approved — attempt to open the create-event form and pre-fill it.
        await self._log("Creation approved — navigating to calendar.", level="info")
        candidate = await self._navigate_and_open_create_form(candidate, portal_name, portal_url)
        await self._emit("calendar_create", [candidate])
        return [candidate]

    async def _find_free_slot(
        self,
        portal_name: Optional[str],
        portal_url: Optional[str],
        query: str,
        task_context: Dict,
    ) -> List[Dict]:
        """Scan the calendar for gaps and return suggested free time windows.

        This is a read-only operation — no approval gate required.
        """
        date          = task_context.get("date", "")
        duration_mins = int(task_context.get("duration_mins") or 60)
        start_hour    = int(task_context.get("start_hour") or 9)    # earliest hour to consider
        end_hour      = int(task_context.get("end_hour") or 18)     # latest hour to consider

        await self._log(
            f"Scanning calendar for {duration_mins}-minute free slots on {date or 'today'}",
            level="info",
        )

        # Navigate to the calendar day-view for the target date.
        events: List[Dict] = []
        if self.page and portal_url:
            events = await self._scrape_day_events(portal_name, portal_url, date)

        suggested_times = self._compute_free_slots(
            events, duration_mins, start_hour, end_hour, date
        )

        item: Dict = {
            "action":          "find_slot",
            "portal":          portal_name or "google",
            "date":            date,
            "duration_mins":   duration_mins,
            "existing_events": events,
            "suggested_times": suggested_times,
            "count":           len(suggested_times),
            "timestamp":       datetime.now().isoformat(),
            "status":          "success" if suggested_times else "no_slots",
            "note": (
                f"Found {len(suggested_times)} available {duration_mins}-minute slot(s)."
                if suggested_times
                else "No free slots found in the requested window. Try a different date or duration."
            ),
        }
        await self._emit("calendar_free_slot", [item])
        return [item]

    async def _detect_conflicts(
        self,
        portal_name: Optional[str],
        portal_url: Optional[str],
        query: str,
        task_context: Dict,
    ) -> List[Dict]:
        """Read the calendar and surface any overlapping events.

        Read-only operation — no approval gate required.
        """
        date       = task_context.get("date", "")
        start_time = task_context.get("start_time", "")
        end_time   = task_context.get("end_time", "")

        await self._log(
            f"Checking for conflicts on {date or 'today'} "
            + (f"from {start_time} to {end_time}" if start_time else ""),
            level="info",
        )

        events: List[Dict] = []
        if self.page and portal_url:
            events = await self._scrape_day_events(portal_name, portal_url, date)

        conflicts = self._find_overlapping(events, start_time, end_time)

        item: Dict = {
            "action":     "detect_conflict",
            "portal":     portal_name or "google",
            "date":       date,
            "start_time": start_time,
            "end_time":   end_time,
            "events":     events,
            "conflicts":  conflicts,
            "has_conflict": bool(conflicts),
            "timestamp":  datetime.now().isoformat(),
            "status":     "success",
            "note": (
                f"Found {len(conflicts)} conflict(s)."
                if conflicts
                else "No conflicts detected in the requested window."
            ),
        }
        await self._emit("calendar_conflict", [item])
        return [item]

    async def _reschedule_event(
        self,
        portal_name: Optional[str],
        portal_url: Optional[str],
        query: str,
        task_context: Dict,
    ) -> List[Dict]:
        """Find an existing event and gate its rescheduling through the approval panel."""
        title      = task_context.get("title") or query or ""
        new_date   = task_context.get("new_date") or task_context.get("date", "")
        new_time   = task_context.get("new_time") or task_context.get("start_time", "")

        await self._log(
            f"Preparing to reschedule event: '{title}' → {new_date} {new_time}".strip(),
            level="info",
        )

        candidate: Dict = {
            "action":    "reschedule",
            "portal":    portal_name or "google",
            "title":     title,
            "new_date":  new_date,
            "new_time":  new_time,
            "url":       portal_url or CALENDAR_PORTALS.get("google", ""),
            "timestamp": datetime.now().isoformat(),
            "status":    "PENDING_APPROVAL",
        }

        approved = await self._gate(
            description=(
                f"Reschedule event: '{title}'"
                + (f" to {new_date}" if new_date else "")
                + (f" at {new_time}" if new_time else "")
            ),
            step_data=candidate,
        )

        if not approved:
            await self._log("Reschedule denied or timed out — skipping.", level="warn")
            candidate["status"] = "DENIED"
            await self._emit("calendar_reschedule", [candidate])
            return [candidate]

        await self._log("Reschedule approved — opening calendar.", level="info")
        candidate = await self._navigate_and_find_event(candidate, portal_name, portal_url, title)
        await self._emit("calendar_reschedule", [candidate])
        return [candidate]

    async def _add_travel_buffer(
        self,
        portal_name: Optional[str],
        portal_url: Optional[str],
        query: str,
        task_context: Dict,
    ) -> List[Dict]:
        """Find events and gate the insertion of travel-buffer blocks around them."""
        title              = task_context.get("title") or query or ""
        date               = task_context.get("date", "")
        travel_buffer_mins = int(task_context.get("travel_buffer_mins") or 30)
        before             = bool(task_context.get("buffer_before", True))
        after              = bool(task_context.get("buffer_after", True))

        await self._log(
            f"Adding {travel_buffer_mins}-min travel buffer around '{title}' on {date}",
            level="info",
        )

        candidate: Dict = {
            "action":              "add_travel_buffer",
            "portal":             portal_name or "google",
            "title":              title,
            "date":               date,
            "travel_buffer_mins": travel_buffer_mins,
            "buffer_before":      before,
            "buffer_after":       after,
            "url":                portal_url or CALENDAR_PORTALS.get("google", ""),
            "timestamp":          datetime.now().isoformat(),
            "status":             "PENDING_APPROVAL",
        }

        # Gate: adding buffers creates new blocking events.
        buffers_to_create = []
        if before:
            buffers_to_create.append("before")
        if after:
            buffers_to_create.append("after")
        side_str = " and ".join(buffers_to_create) or "around"

        approved = await self._gate(
            description=(
                f"Add {travel_buffer_mins}-min travel buffer {side_str} '{title}'"
                + (f" on {date}" if date else "")
            ),
            step_data=candidate,
        )

        if not approved:
            await self._log("Travel buffer denied or timed out — skipping.", level="warn")
            candidate["status"] = "DENIED"
            await self._emit("calendar_travel_buffer", [candidate])
            return [candidate]

        await self._log("Travel buffer approved — navigating to calendar.", level="info")
        candidate = await self._navigate_and_plan_buffer(candidate, portal_name, portal_url)
        await self._emit("calendar_travel_buffer", [candidate])
        return [candidate]

    # ------------------------------------------------------------------
    # Playwright navigation helpers
    # ------------------------------------------------------------------

    async def _navigate_and_open_create_form(
        self,
        candidate: Dict,
        portal_name: Optional[str],
        portal_url: Optional[str],
    ) -> Dict:
        """Open the calendar and navigate to the new-event creation form.

        Fills the title field when possible; leaves final Save to the user so
        OmniTask never submits a calendar write without on-screen human action.
        """
        target_url = portal_url or CALENDAR_PORTALS.get("google", "")
        if not target_url or not self.page:
            candidate["status"] = "PORTAL_OPENED"
            candidate["note"] = (
                "No calendar URL resolved. Please open your calendar manually "
                "and create the event."
            )
            return candidate

        try:
            await self.page.goto(target_url, wait_until="domcontentloaded", timeout=30_000)
            await asyncio.sleep(2)
            await self._log(f"Loaded {portal_name or 'calendar'} portal.", level="info")

            # Try to click the "New event" button.
            new_event_btn = await self._find_element(NEW_EVENT_SELECTORS)
            if new_event_btn:
                try:
                    await new_event_btn.click(timeout=5_000)
                    await asyncio.sleep(1.5)
                    await self._log("Clicked 'New event' button.", level="info")
                except Exception as exc:
                    await self._log(f"Could not click new-event button ({exc}).", level="warn")

            # Try to fill the event title.
            title_el = await self._find_element(EVENT_TITLE_SELECTORS)
            if title_el:
                try:
                    await title_el.fill(candidate.get("title", ""), timeout=5_000)
                    await self._log(
                        f"Pre-filled event title: {candidate.get('title', '')}",
                        level="info",
                    )
                except Exception as exc:
                    await self._log(f"Could not fill title ({exc}).", level="warn")

            # Surface the Save button selector for the user.
            save_btn_sel = await self._find_selector(SAVE_EVENT_SELECTORS)

            candidate["portalUrl"] = target_url
            candidate["saveButtonSel"] = save_btn_sel
            candidate["status"] = "FORM_OPENED"
            candidate["note"] = (
                "Calendar create-event form opened."
                + (f" Title pre-filled as '{candidate.get('title', '')}'." if title_el else "")
                + " Verify the date and time fields, then click Save to confirm the event. "
                "OmniTask does not click Save without your on-screen action."
            )
        except Exception as exc:  # noqa: BLE001 — self-heal
            await self._log(f"Navigation to calendar failed ({exc}).", level="warn")
            candidate["status"] = "FORM_OPENED"
            candidate["error"] = str(exc)
            candidate["note"] = (
                f"Could not navigate to {target_url}. "
                "Please open your calendar manually and create the event."
            )
        return candidate

    async def _navigate_and_find_event(
        self,
        candidate: Dict,
        portal_name: Optional[str],
        portal_url: Optional[str],
        title: str,
    ) -> Dict:
        """Navigate to the calendar and surface the target event for rescheduling."""
        target_url = portal_url or CALENDAR_PORTALS.get("google", "")
        if not target_url or not self.page:
            candidate["status"] = "PORTAL_OPENED"
            candidate["note"] = (
                "No calendar URL resolved. Please open your calendar manually "
                "and reschedule the event."
            )
            return candidate

        try:
            await self.page.goto(target_url, wait_until="domcontentloaded", timeout=30_000)
            await asyncio.sleep(2)
            await self._log(f"Loaded {portal_name or 'calendar'} for rescheduling.", level="info")

            # Try to locate the event block by title text.
            event_block = None
            for sel in EVENT_BLOCK_SELECTORS:
                try:
                    # Use has-text filter for the specific event title.
                    el = self.page.locator(f"{sel}:has-text('{title}')").first
                    if await el.count() > 0:
                        event_block = el
                        await self._log(
                            f"Event '{title}' found via selector: {sel}", level="info"
                        )
                        break
                except Exception:
                    continue

            candidate["portalUrl"] = target_url
            candidate["eventFound"] = event_block is not None
            candidate["status"] = "PORTAL_OPENED"
            candidate["note"] = (
                (
                    f"Event '{title}' located. Click on it and use the edit/reschedule "
                    f"option to move it to {candidate.get('new_date', '')} "
                    f"{candidate.get('new_time', '')}. "
                )
                if event_block
                else (
                    f"Could not automatically locate '{title}'. "
                    "Navigate to the event manually and update the date/time. "
                )
            ) + "OmniTask does not apply the reschedule without your on-screen action."

        except Exception as exc:  # noqa: BLE001 — self-heal
            await self._log(f"Navigation for reschedule failed ({exc}).", level="warn")
            candidate["status"] = "PORTAL_OPENED"
            candidate["error"] = str(exc)
            candidate["note"] = (
                f"Could not navigate to {target_url}. "
                "Please open your calendar manually and reschedule the event."
            )
        return candidate

    async def _navigate_and_plan_buffer(
        self,
        candidate: Dict,
        portal_name: Optional[str],
        portal_url: Optional[str],
    ) -> Dict:
        """Navigate to the calendar and surface a plan for adding travel buffer events."""
        target_url = portal_url or CALENDAR_PORTALS.get("google", "")
        if not target_url or not self.page:
            candidate["status"] = "PORTAL_OPENED"
            candidate["note"] = (
                "No calendar URL resolved. Please add travel buffer events manually."
            )
            return candidate

        try:
            await self.page.goto(target_url, wait_until="domcontentloaded", timeout=30_000)
            await asyncio.sleep(2)
            await self._log("Loaded calendar for travel buffer planning.", level="info")

            mins   = candidate.get("travel_buffer_mins", 30)
            title  = candidate.get("title", "")
            date   = candidate.get("date", "")
            before = candidate.get("buffer_before", True)
            after  = candidate.get("buffer_after", True)

            buffer_events = []
            if before:
                buffer_events.append({
                    "title":       f"Travel to: {title}",
                    "date":        date,
                    "duration_mins": mins,
                    "position":    "before",
                })
            if after:
                buffer_events.append({
                    "title":       f"Travel from: {title}",
                    "date":        date,
                    "duration_mins": mins,
                    "position":    "after",
                })

            candidate["portalUrl"]     = target_url
            candidate["bufferEvents"]  = buffer_events
            candidate["status"]        = "PORTAL_OPENED"
            candidate["note"] = (
                f"Calendar opened. {len(buffer_events)} travel-buffer event(s) planned: "
                + ", ".join(f"'{e['title']}' ({e['position']} event)" for e in buffer_events)
                + f". Each block is {mins} minutes. "
                "Create these events manually in the live browser view. "
                "OmniTask does not create them without your on-screen action."
            )
        except Exception as exc:  # noqa: BLE001 — self-heal
            await self._log(f"Navigation for travel buffer failed ({exc}).", level="warn")
            candidate["status"] = "PORTAL_OPENED"
            candidate["error"] = str(exc)
            candidate["note"] = (
                "Could not navigate to the calendar. "
                "Please add travel buffer events manually."
            )
        return candidate

    # ------------------------------------------------------------------
    # Calendar scraping helpers (self-healing selector cascade)
    # ------------------------------------------------------------------

    async def _scrape_day_events(
        self,
        portal_name: Optional[str],
        portal_url: str,
        date: str,
    ) -> List[Dict]:
        """Navigate to the calendar day-view and extract visible event blocks.

        Returns a list of {title, start_time, end_time, duration_mins} dicts.
        Self-heals through multiple selector patterns.
        """
        if not self.page:
            return []

        # Build a day-view URL for Google or Outlook.
        day_url = self._build_day_view_url(portal_name, portal_url, date)
        try:
            await self.page.goto(day_url, wait_until="domcontentloaded", timeout=30_000)
            await asyncio.sleep(2)
            await self._log(
                f"Loaded {portal_name or 'calendar'} day-view for {date or 'today'}.",
                level="info",
            )
        except Exception as exc:
            await self._log(f"Day-view navigation failed ({exc}).", level="warn")
            return []

        events: List[Dict] = []

        # --- Selector cascade ---
        for sel in EVENT_BLOCK_SELECTORS:
            try:
                blocks = await self.page.query_selector_all(sel)
                if blocks:
                    for block in blocks[:30]:
                        text = (await block.inner_text()).strip()
                        if not text:
                            continue
                        time_match = re.search(
                            r"(\d{1,2}:\d{2}\s?(?:AM|PM|am|pm))\s*[-–]\s*"
                            r"(\d{1,2}:\d{2}\s?(?:AM|PM|am|pm))",
                            text,
                        )
                        start_t = time_match.group(1).strip() if time_match else ""
                        end_t   = time_match.group(2).strip() if time_match else ""
                        events.append({
                            "title":      text.split("\n")[0][:120],
                            "start_time": start_t,
                            "end_time":   end_t,
                            "raw":        text[:300],
                        })
                    if events:
                        break
            except Exception:
                continue

        # --- JS fallback ---
        if not events:
            events = await self._scrape_events_via_js()

        return events

    async def _scrape_events_via_js(self) -> List[Dict]:
        """Last-resort: evaluate JS to pull event text from the live DOM."""
        if not self.page:
            return []
        _EVENTS_JS = r"""
        (() => {
            const sels = [
                '[data-eventid]', '[class*="KF4T3b"]',
                '[class*="calendar-event"]', '[class*="event-block"]',
                '[data-occurrence-id]'
            ];
            const results = [];
            const timeRe = /\d{1,2}:\d{2}\s?(?:AM|PM|am|pm)/g;
            for (const sel of sels) {
                const els = Array.from(document.querySelectorAll(sel));
                if (!els.length) continue;
                for (const el of els.slice(0, 30)) {
                    const text = (el.innerText || '').trim();
                    if (!text) continue;
                    const times = text.match(timeRe) || [];
                    results.push({
                        title: text.split('\n')[0].slice(0, 120),
                        start_time: times[0] || '',
                        end_time:   times[1] || '',
                        raw: text.slice(0, 300)
                    });
                }
                if (results.length) break;
            }
            return results;
        })()
        """
        try:
            raw = await self.page.evaluate(_EVENTS_JS)
            return raw or []
        except Exception:
            return []

    # ------------------------------------------------------------------
    # Free-slot computation (pure Python, no browser interaction)
    # ------------------------------------------------------------------

    def _compute_free_slots(
        self,
        events: List[Dict],
        duration_mins: int,
        start_hour: int,
        end_hour: int,
        date: str,
    ) -> List[Dict]:
        """Return a list of free time windows of at least ``duration_mins`` minutes.

        Works entirely in-memory from the scraped events list.  Returns at most
        8 suggestions.
        """
        # Convert events to (start_min, end_min) pairs measured from midnight.
        busy: List[tuple] = []
        time_re = re.compile(
            r"(\d{1,2}):(\d{2})\s?(AM|PM|am|pm)", re.IGNORECASE
        )
        for ev in events:
            def _parse(s: str) -> Optional[int]:
                m = time_re.search(s or "")
                if not m:
                    return None
                h, mn, ampm = int(m.group(1)), int(m.group(2)), m.group(3).upper()
                if ampm == "PM" and h != 12:
                    h += 12
                elif ampm == "AM" and h == 12:
                    h = 0
                return h * 60 + mn

            s = _parse(ev.get("start_time", ""))
            e = _parse(ev.get("end_time", ""))
            if s is not None and e is not None and e > s:
                busy.append((s, e))

        busy.sort()

        # Scan the work window for gaps.
        window_start = start_hour * 60
        window_end   = end_hour * 60
        free_slots: List[Dict] = []
        cursor = window_start

        for bs, be in busy:
            gap = min(bs, window_end) - cursor
            if gap >= duration_mins:
                free_slots.append(self._fmt_slot(cursor, cursor + duration_mins, date))
            cursor = max(cursor, be)
            if cursor >= window_end:
                break

        # Gap after the last event.
        remaining = window_end - cursor
        if remaining >= duration_mins:
            free_slots.append(self._fmt_slot(cursor, cursor + duration_mins, date))

        return free_slots[:8]

    @staticmethod
    def _fmt_slot(start_min: int, end_min: int, date: str) -> Dict:
        """Format a (start_min, end_min) pair as a human-readable slot dict."""
        def _fmt(mins: int) -> str:
            h, m = divmod(mins, 60)
            suffix = "AM" if h < 12 else "PM"
            h12 = h % 12 or 12
            return f"{h12}:{m:02d} {suffix}"

        return {
            "date":       date,
            "start_time": _fmt(start_min),
            "end_time":   _fmt(end_min),
            "start_min":  start_min,
            "end_min":    end_min,
        }

    # ------------------------------------------------------------------
    # Conflict detection (pure Python)
    # ------------------------------------------------------------------

    def _find_overlapping(
        self,
        events: List[Dict],
        start_time: str,
        end_time: str,
    ) -> List[Dict]:
        """Return events that overlap with the [start_time, end_time] window.

        When start_time/end_time are empty, returns all events as potential
        conflicts (surface everything for the user to review).
        """
        if not start_time and not end_time:
            return events

        time_re = re.compile(
            r"(\d{1,2}):(\d{2})\s?(AM|PM|am|pm)", re.IGNORECASE
        )

        def _parse(s: str) -> Optional[int]:
            m = time_re.search(s or "")
            if not m:
                return None
            h, mn, ampm = int(m.group(1)), int(m.group(2)), m.group(3).upper()
            if ampm == "PM" and h != 12:
                h += 12
            elif ampm == "AM" and h == 12:
                h = 0
            return h * 60 + mn

        qs = _parse(start_time)
        qe = _parse(end_time)
        if qs is None or qe is None:
            return events  # can't parse query window → return all

        conflicts: List[Dict] = []
        for ev in events:
            es = _parse(ev.get("start_time", ""))
            ee = _parse(ev.get("end_time", ""))
            if es is None or ee is None:
                continue
            # Overlap condition: not (ee <= qs or es >= qe)
            if not (ee <= qs or es >= qe):
                conflicts.append(ev)
        return conflicts

    # ------------------------------------------------------------------
    # URL builders per portal family
    # ------------------------------------------------------------------

    def _build_day_view_url(
        self, portal_name: Optional[str], portal_url: str, date: str
    ) -> str:
        """Build a day-view URL for the given date.

        Falls back to the portal root when the date string cannot be formatted.
        """
        if portal_name == "outlook" or "outlook.live.com" in (portal_url or ""):
            base = "https://outlook.live.com/calendar/0/view/day"
            return f"{base}/{date}" if date else base
        if portal_name == "office365" or "outlook.office.com" in (portal_url or ""):
            base = "https://outlook.office.com/calendar/view/day"
            return f"{base}/{date}" if date else base
        # Default: Google Calendar day view.
        # Google uses /r/day/YYYY/M/D format.
        if date:
            try:
                parsed = datetime.fromisoformat(date)
                return (
                    f"https://calendar.google.com/calendar/r/day/"
                    f"{parsed.year}/{parsed.month}/{parsed.day}"
                )
            except ValueError:
                pass
        return "https://calendar.google.com/calendar/r/day"

    # ------------------------------------------------------------------
    # Generic DOM helpers (self-healing)
    # ------------------------------------------------------------------

    async def _find_element(self, selectors: List[str]) -> Optional[Any]:
        """Try each selector in sequence; return the first visible element found."""
        if not self.page:
            return None
        for sel in selectors:
            try:
                el = await self.page.query_selector(sel)
                if el and await el.is_visible():
                    return el
            except Exception:
                continue
        return None

    async def _find_selector(self, selectors: List[str]) -> Optional[str]:
        """Return the first selector string that matches a visible element."""
        if not self.page:
            return None
        for sel in selectors:
            try:
                el = await self.page.query_selector(sel)
                if el and await el.is_visible():
                    return sel
            except Exception:
                continue
        return None

    # ------------------------------------------------------------------
    # Resolution helpers
    # ------------------------------------------------------------------

    def _resolve_action(self, task_type: str, goal: str) -> str:
        key = (task_type or "").strip().lower()
        if key in TASK_ACTION_MAP:
            return TASK_ACTION_MAP[key]
        g = goal.lower()
        if any(w in g for w in ("create", "add", "schedule", "new event", "new meeting", "set up")):
            return "create_event"
        if any(w in g for w in ("free slot", "free time", "availability", "when am i free", "open slot")):
            return "find_slot"
        if any(w in g for w in ("conflict", "overlap", "clash", "double-book", "busy")):
            return "detect_conflict"
        if any(w in g for w in ("reschedule", "move", "postpone", "change time")):
            return "reschedule"
        if any(w in g for w in ("travel", "buffer", "commute", "transit", "drive")):
            return "add_travel_buffer"
        return "find_slot"  # safe default — read-only

    def _resolve_portal(
        self, portal_key: str, goal: str
    ) -> tuple[Optional[str], Optional[str]]:
        if portal_key and portal_key in CALENDAR_PORTALS:
            return portal_key, CALENDAR_PORTALS[portal_key]
        g = goal.lower()
        for name, url in CALENDAR_PORTALS.items():
            if name in g:
                return name, url
        # Default to Google Calendar.
        return "google", CALENDAR_PORTALS["google"]

    # ------------------------------------------------------------------
    # Bridge helpers — degrade to no-ops in standalone CLI mode
    # ------------------------------------------------------------------

    async def _log(self, message: str, level: str = "info") -> None:
        self.logger.info("[%s] %s", level.upper(), message)
        if self.bridge is not None:
            try:
                await self.bridge.log(message, level=level)
            except Exception:
                pass

    async def _gate(self, description: str, step_data: Dict) -> bool:
        """Request user approval before a write action.

        Returns True (proceed) when:
          - running standalone (no bridge) — auto-approve in CLI mode
          - CALENDAR_AUTO_APPROVE env var is set
          - bridge.gate() returns True
        """
        auto = os.environ.get("CALENDAR_AUTO_APPROVE", "").strip().lower() in (
            "1", "true", "yes"
        )
        if auto:
            await self._log("Auto-approved (CALENDAR_AUTO_APPROVE=true)", level="warn")
            return True
        if self.bridge is None:
            await self._log("Standalone mode — auto-approving calendar gate.", level="warn")
            return True
        try:
            return await self.bridge.gate(description, step_data)
        except Exception:
            return False

    async def _emit(self, kind: str, items: List[Dict]) -> None:
        self._results.extend(items)
        if self.bridge is not None:
            try:
                await self.bridge.emit_result(kind, items)
            except Exception:
                pass

    async def _cancelled(self) -> bool:
        if self.bridge is not None:
            try:
                return bool(await self.bridge.cancelled())
            except Exception:
                pass
        return False

    async def _ai_summarise(self, text: str, instruction: str) -> Optional[str]:
        ai = getattr(self.bridge, "ai", None)
        if ai is None or not getattr(ai, "available", False):
            return None
        try:
            return await ai.summarize(text, instruction)
        except Exception:
            return None

    # ------------------------------------------------------------------
    # Result packaging
    # ------------------------------------------------------------------

    @staticmethod
    def _result(
        phase: str,
        action: str,
        items: List[Dict],
        status: str = "success",
    ) -> Dict:
        first = items[0] if items else {}
        return {
            "action":          action,
            "phase":           phase,
            "status":          status,
            "event":           first,
            "conflicts":       first.get("conflicts", []),
            "suggested_times": first.get("suggested_times", []),
            "data":            {"items": items, "count": len(items)},
            "items":           items,
        }


# ---------------------------------------------------------------------------
# Standalone CLI entry point (mirrors booking_agent pattern)
# ---------------------------------------------------------------------------

async def _cli_main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [calendar_agent] %(levelname)s %(message)s",
    )
    logger = logging.getLogger("Main")
    logger.info("=" * 60)
    logger.info("CALENDAR AGENT — standalone mode")
    logger.info("=" * 60)

    task_context = {
        "goal":             os.environ.get("CALENDAR_GOAL", "find a free 1-hour slot tomorrow morning"),
        "action":           os.environ.get("CALENDAR_ACTION", "find_slot"),
        "portal":           os.environ.get("CALENDAR_PORTAL", "google"),
        "title":            os.environ.get("CALENDAR_TITLE", ""),
        "date":             os.environ.get("CALENDAR_DATE", ""),
        "start_time":       os.environ.get("CALENDAR_START_TIME", ""),
        "end_time":         os.environ.get("CALENDAR_END_TIME", ""),
        "duration_mins":    int(os.environ.get("CALENDAR_DURATION_MINS", "60")),
        "attendees":        [],
        "location":         os.environ.get("CALENDAR_LOCATION", ""),
        "description":      os.environ.get("CALENDAR_DESCRIPTION", ""),
        "travel_buffer_mins": int(os.environ.get("CALENDAR_TRAVEL_BUFFER_MINS", "30")),
    }

    agent = CalendarAgent()
    result = await agent.execute(task_context)

    logger.info(
        "Result: action=%s status=%s items=%d",
        result.get("action"),
        result.get("status"),
        len(result.get("items", [])),
    )
    for item in result.get("items", []):
        logger.info("  %s", item)


if __name__ == "__main__":
    import asyncio
    asyncio.run(_cli_main())
