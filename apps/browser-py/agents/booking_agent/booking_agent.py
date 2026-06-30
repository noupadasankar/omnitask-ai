"""
Booking Agent
Autonomous browser agent for reservations, appointments, and tickets.

Supports:
  - Restaurant reservations (OpenTable, Resy)
  - Appointment booking (generic booking portals)
  - Event ticket purchase / availability check (Ticketmaster, StubHub)
  - Hotel room reservations (Booking.com, Hotels.com)

Usage (standalone CLI):
    python booking_agent.py

Usage (as an OmniTask skill — injected by skills/booking.py):
    agent = BookingAgent(bridge=bridge, page=page)
    result = await agent.execute(task_context)

The `bridge` parameter is None in standalone mode (no live dashboard, no
approval gate). When injected by the skill dispatcher it exposes the same
PortalBridge-style interface used by FinanceAgent / JobAgentOrchestrator for
streaming events and gating every confirm/submit through the approval panel.

All consequential actions (completing a reservation, buying a ticket, checking
out a hotel room) are ALWAYS gated through bridge.gate() before any click is
made. BOOKING_AUTO_APPROVE=true skips the gate (autonomous mode, off by
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

log = logging.getLogger("booking_agent")


# ---------------------------------------------------------------------------
# Portal catalogue
# ---------------------------------------------------------------------------

BOOKING_PORTALS: Dict[str, str] = {
    # Restaurants
    "opentable":   "https://www.opentable.com/",
    "resy":        "https://resy.com/",
    "yelp":        "https://www.yelp.com/",
    # Hotels
    "booking":     "https://www.booking.com/",
    "hotels":      "https://www.hotels.com/",
    "expedia":     "https://www.expedia.com/",
    "airbnb":      "https://www.airbnb.com/",
    # Tickets / events
    "ticketmaster": "https://www.ticketmaster.com/",
    "stubhub":     "https://www.stubhub.com/",
    "eventbrite":  "https://www.eventbrite.com/",
    "seatgeek":    "https://www.seatgeek.com/",
    # Appointments
    "zocdoc":      "https://www.zocdoc.com/",
    "calendly":    "https://calendly.com/",
    "acuity":      "https://acuityscheduling.com/",
}

# Task-type → action label so the result shape is consistent with FinanceAgent.
TASK_ACTION_MAP: Dict[str, str] = {
    # Booking-domain task types (exact strings from BookingDomainAgent in backend)
    "ticket_booking":       "book_ticket",
    "hotel_booking":        "book_hotel",
    "restaurant_booking":   "book_restaurant",
    "appointment":          "book_appointment",
    "reservation":          "book_restaurant",
    # Generic aliases that may arrive from the frontend
    "booking":              "check_availability",
    "book":                 "check_availability",
    "reserve":              "book_restaurant",
    "check_availability":   "check_availability",
    "cancel":               "cancel_booking",
    "cancel_booking":       "cancel_booking",
}

# Selectors tried in sequence to find a "confirm / book / reserve" button on
# booking-portal confirmation pages.  Self-heals: the first one that exists wins.
CONFIRM_SELECTORS: List[str] = [
    "button[data-testid*='confirm']",
    "button[data-testid*='reserve']",
    "button[data-testid*='book']",
    "[class*='confirm'][role='button']",
    "[class*='reserve'][role='button']",
    "button:has-text('Confirm')",
    "button:has-text('Reserve')",
    "button:has-text('Book')",
    "button:has-text('Complete Reservation')",
    "button:has-text('Complete Booking')",
    "input[type='submit'][value*='Confirm']",
    "input[type='submit'][value*='Book']",
]


class BookingAgent:
    """Autonomous browser agent for reservations, appointments and tickets.

    Constructor mirrors FinanceAgent so the skill wrapper can treat both agents
    uniformly.

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
        self.logger = logging.getLogger("BookingAgent")

        self._results: List[Dict] = []
        self._start_time: Optional[datetime] = None
        self._end_time: Optional[datetime] = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def execute(self, task_context: Dict) -> Dict:
        """Entry point called by skills/booking.py (and directly in CLI mode).

        Args:
            task_context: dict with keys:
                goal          — natural-language goal string
                task_type     — backend taskType string (e.g. 'restaurant_booking')
                portal        — optional portal name hint (e.g. 'opentable')
                query         — optional supplementary query string
                date          — ISO date or human string (e.g. '2026-07-04')
                time          — time string (e.g. '7:30 PM')
                party_size    — int, number of guests / seats
                location      — city or address string
                event         — event name for ticket booking
                config        — optional per-run overrides

        Returns:
            {
                "action":  "book_restaurant" | "book_hotel" | "book_ticket"
                           | "book_appointment" | "check_availability"
                           | "cancel_booking",
                "booking": {...},           # structured booking details
                "status":  "success" | "partial" | "failed",
                "items":   [...],           # list consumed by Skill.ok()
            }
        """
        self._start_time = datetime.now()

        goal       = task_context.get("goal", "")
        task_type  = task_context.get("task_type", "")
        portal_key = (task_context.get("portal") or "").lower()
        query      = task_context.get("query") or goal

        action      = self._resolve_action(task_type, goal)
        portal_name, portal_url = self._resolve_portal(portal_key, goal, action)

        await self._log(
            f"Starting booking task: action={action}, portal={portal_name or 'web'}",
            level="info",
        )

        if await self._cancelled():
            return self._result("cancelled", action, [], status="partial")

        try:
            if action == "book_restaurant":
                items = await self._book_restaurant(
                    portal_name, portal_url, query, task_context
                )

            elif action == "book_hotel":
                items = await self._book_hotel(
                    portal_name, portal_url, query, task_context
                )

            elif action == "book_ticket":
                items = await self._book_ticket(
                    portal_name, portal_url, query, task_context
                )

            elif action == "book_appointment":
                items = await self._book_appointment(
                    portal_name, portal_url, query, task_context
                )

            elif action == "cancel_booking":
                items = await self._cancel_booking(
                    portal_name, portal_url, query, task_context
                )

            else:
                # Default: check availability and surface options without booking.
                items = await self._check_availability(
                    portal_name, portal_url, query, task_context
                )

        except Exception as exc:  # noqa: BLE001
            self.logger.error("BookingAgent error: %s", exc, exc_info=True)
            await self._log(f"Booking task failed: {exc}", level="error")
            return self._result("error", action, [], status="failed")

        finally:
            self._end_time = datetime.now()

        await self._log(
            f"Booking task complete — {len(items)} item(s) returned.",
            level="success",
        )
        return self._result("done", action, items, status="success")

    # ------------------------------------------------------------------
    # Action implementations
    # ------------------------------------------------------------------

    async def _book_restaurant(
        self,
        portal_name: Optional[str],
        portal_url: Optional[str],
        query: str,
        task_context: Dict,
    ) -> List[Dict]:
        """Search for restaurant availability and gate the confirmation."""
        date       = task_context.get("date", "")
        time_pref  = task_context.get("time", "")
        party_size = task_context.get("party_size") or 2
        location   = task_context.get("location", "")

        await self._log(
            f"Searching restaurant availability: {query!r} for {party_size} on {date} {time_pref}",
            level="info",
        )

        # --- Find available slots ---
        slots: List[Dict] = []
        if portal_url and self.page:
            slots = await self._scrape_restaurant_slots(
                portal_url, portal_name, query, date, time_pref, party_size, location
            )
        if not slots:
            slots = await self._google_search_slots(query, location, date, time_pref)

        if not slots:
            item = self._no_results_item("book_restaurant", query, portal_name,
                                         note="No available slots found. Try a different date or time.")
            await self._emit("booking_restaurant", [item])
            return [item]

        await self._log(f"Found {len(slots)} slot(s). Requesting approval to confirm.", level="info")

        # Gate the first available slot through the approval panel.
        best = slots[0]
        candidate = {
            "action":      "book_restaurant",
            "portal":      portal_name or "web",
            "restaurant":  best.get("name") or query,
            "date":        date or best.get("date", ""),
            "time":        time_pref or best.get("time", ""),
            "party_size":  party_size,
            "location":    location,
            "url":         best.get("url", portal_url or ""),
            "slots":       slots,
            "timestamp":   datetime.now().isoformat(),
            "status":      "PENDING_APPROVAL",
        }

        approved = await self._gate(
            description=(
                f"Book restaurant: {candidate['restaurant']} "
                f"on {candidate['date']} at {candidate['time']} for {party_size} guest(s)"
            ),
            step_data=candidate,
        )

        if not approved:
            await self._log("Restaurant booking denied or timed out — skipping.", level="warn")
            candidate["status"] = "DENIED"
            await self._emit("booking_restaurant", [candidate])
            return [candidate]

        # Approved — attempt to navigate to the booking URL.
        await self._log("Booking approved — navigating to reservation page.", level="info")
        candidate = await self._navigate_and_confirm(candidate, portal_url)
        await self._emit("booking_restaurant", [candidate])
        return [candidate]

    async def _book_hotel(
        self,
        portal_name: Optional[str],
        portal_url: Optional[str],
        query: str,
        task_context: Dict,
    ) -> List[Dict]:
        """Search hotel availability and gate the checkout."""
        check_in   = task_context.get("check_in") or task_context.get("date", "")
        check_out  = task_context.get("check_out", "")
        guests     = task_context.get("party_size") or task_context.get("guests") or 2
        location   = task_context.get("location", "")

        await self._log(
            f"Searching hotel availability: {query!r} in {location!r} "
            f"check-in={check_in} check-out={check_out}",
            level="info",
        )

        hotels: List[Dict] = []
        if portal_url and self.page:
            hotels = await self._scrape_hotel_listings(
                portal_url, portal_name, query, location, check_in, check_out, guests
            )
        if not hotels:
            hotels = await self._google_search_hotels(query, location, check_in, check_out)

        if not hotels:
            item = self._no_results_item("book_hotel", query, portal_name,
                                         note="No hotel rooms found for these dates. Try adjusting dates or location.")
            await self._emit("booking_hotel", [item])
            return [item]

        await self._log(f"Found {len(hotels)} hotel option(s). Requesting approval.", level="info")

        best = hotels[0]
        candidate = {
            "action":    "book_hotel",
            "portal":    portal_name or "web",
            "hotel":     best.get("name") or query,
            "location":  location or best.get("location", ""),
            "check_in":  check_in,
            "check_out": check_out,
            "guests":    guests,
            "price":     best.get("price", ""),
            "url":       best.get("url", portal_url or ""),
            "hotels":    hotels,
            "timestamp": datetime.now().isoformat(),
            "status":    "PENDING_APPROVAL",
        }

        approved = await self._gate(
            description=(
                f"Book hotel: {candidate['hotel']} in {location} "
                f"({check_in} → {check_out}, {guests} guest(s))"
                + (f" — {candidate['price']}" if candidate["price"] else "")
            ),
            step_data=candidate,
        )

        if not approved:
            await self._log("Hotel booking denied or timed out — skipping.", level="warn")
            candidate["status"] = "DENIED"
            await self._emit("booking_hotel", [candidate])
            return [candidate]

        await self._log("Hotel booking approved — navigating to checkout.", level="info")
        candidate = await self._navigate_and_confirm(candidate, portal_url)
        await self._emit("booking_hotel", [candidate])
        return [candidate]

    async def _book_ticket(
        self,
        portal_name: Optional[str],
        portal_url: Optional[str],
        query: str,
        task_context: Dict,
    ) -> List[Dict]:
        """Find event tickets and gate the purchase."""
        event    = task_context.get("event") or query
        date     = task_context.get("date", "")
        location = task_context.get("location", "")
        qty      = task_context.get("party_size") or task_context.get("quantity") or 1

        await self._log(
            f"Searching tickets: {event!r} on {date} in {location!r} — qty={qty}",
            level="info",
        )

        tickets: List[Dict] = []
        if portal_url and self.page:
            tickets = await self._scrape_ticket_listings(
                portal_url, portal_name, event, date, location, qty
            )
        if not tickets:
            tickets = await self._google_search_tickets(event, date, location)

        if not tickets:
            item = self._no_results_item("book_ticket", query, portal_name,
                                         note="No tickets found. Try different dates or check the venue site directly.")
            await self._emit("booking_ticket", [item])
            return [item]

        await self._log(f"Found {len(tickets)} ticket option(s). Requesting purchase approval.", level="info")

        best = tickets[0]
        candidate = {
            "action":    "book_ticket",
            "portal":    portal_name or "web",
            "event":     event,
            "date":      date or best.get("date", ""),
            "location":  location or best.get("venue", ""),
            "quantity":  qty,
            "price":     best.get("price", ""),
            "url":       best.get("url", portal_url or ""),
            "tickets":   tickets,
            "timestamp": datetime.now().isoformat(),
            "status":    "PENDING_APPROVAL",
        }

        approved = await self._gate(
            description=(
                f"Buy {qty} ticket(s) to: {event}"
                + (f" on {date}" if date else "")
                + (f" in {location}" if location else "")
                + (f" — {candidate['price']}" if candidate["price"] else "")
            ),
            step_data=candidate,
        )

        if not approved:
            await self._log("Ticket purchase denied or timed out — skipping.", level="warn")
            candidate["status"] = "DENIED"
            await self._emit("booking_ticket", [candidate])
            return [candidate]

        await self._log("Purchase approved — navigating to checkout.", level="info")
        candidate = await self._navigate_and_confirm(candidate, portal_url)
        await self._emit("booking_ticket", [candidate])
        return [candidate]

    async def _book_appointment(
        self,
        portal_name: Optional[str],
        portal_url: Optional[str],
        query: str,
        task_context: Dict,
    ) -> List[Dict]:
        """Find an appointment slot and gate the booking."""
        date      = task_context.get("date", "")
        time_pref = task_context.get("time", "")
        location  = task_context.get("location", "")

        await self._log(
            f"Searching appointment availability: {query!r} on {date} {time_pref}",
            level="info",
        )

        slots: List[Dict] = []
        if portal_url and self.page:
            slots = await self._scrape_appointment_slots(
                portal_url, portal_name, query, date, time_pref, location
            )
        if not slots:
            slots = await self._google_search_appointments(query, location, date)

        if not slots:
            item = self._no_results_item("book_appointment", query, portal_name,
                                         note="No open appointments found. Try a different date or provider.")
            await self._emit("booking_appointment", [item])
            return [item]

        await self._log(f"Found {len(slots)} slot(s). Requesting confirmation.", level="info")

        best = slots[0]
        candidate = {
            "action":    "book_appointment",
            "portal":    portal_name or "web",
            "provider":  best.get("provider") or query,
            "date":      date or best.get("date", ""),
            "time":      time_pref or best.get("time", ""),
            "location":  location or best.get("location", ""),
            "url":       best.get("url", portal_url or ""),
            "slots":     slots,
            "timestamp": datetime.now().isoformat(),
            "status":    "PENDING_APPROVAL",
        }

        approved = await self._gate(
            description=(
                f"Book appointment: {candidate['provider']} "
                f"on {candidate['date']} at {candidate['time']}"
                + (f" ({location})" if location else "")
            ),
            step_data=candidate,
        )

        if not approved:
            await self._log("Appointment booking denied or timed out — skipping.", level="warn")
            candidate["status"] = "DENIED"
            await self._emit("booking_appointment", [candidate])
            return [candidate]

        await self._log("Appointment approved — navigating to booking page.", level="info")
        candidate = await self._navigate_and_confirm(candidate, portal_url)
        await self._emit("booking_appointment", [candidate])
        return [candidate]

    async def _cancel_booking(
        self,
        portal_name: Optional[str],
        portal_url: Optional[str],
        query: str,
        task_context: Dict,
    ) -> List[Dict]:
        """Navigate to the portal and guide the user to cancel an existing booking.

        Cancellation is always gated — never auto-submitted.
        """
        await self._log(
            "Cancellation requested — approval required before any action.",
            level="warn",
        )

        candidate = {
            "action":    "cancel_booking",
            "portal":    portal_name or "web",
            "query":     query,
            "timestamp": datetime.now().isoformat(),
            "status":    "PENDING_APPROVAL",
        }

        approved = await self._gate(
            description=f"Cancel booking: {query}",
            step_data=candidate,
        )

        if not approved:
            await self._log("Cancellation denied or timed out.", level="warn")
            candidate["status"] = "DENIED"
            await self._emit("booking_cancellation", [candidate])
            return [candidate]

        await self._log("Cancellation approved — opening portal.", level="info")
        if portal_url and self.page:
            try:
                await self.page.goto(portal_url, wait_until="domcontentloaded", timeout=30_000)
                await asyncio.sleep(2)
                candidate["portalUrl"] = portal_url
                candidate["note"] = (
                    "Portal opened. Navigate to your bookings / manage reservations "
                    "section and confirm the cancellation on-screen."
                )
            except Exception as exc:  # noqa: BLE001 — self-heal
                await self._log(f"Portal navigation failed ({exc}).", level="warn")
                candidate["error"] = str(exc)
        else:
            candidate["note"] = (
                f"To cancel: visit {portal_url or 'the booking portal'} and navigate "
                "to 'My Bookings' or 'Manage Reservations'."
            )

        candidate["status"] = "PORTAL_OPENED"
        await self._emit("booking_cancellation", [candidate])
        return [candidate]

    async def _check_availability(
        self,
        portal_name: Optional[str],
        portal_url: Optional[str],
        query: str,
        task_context: Dict,
    ) -> List[Dict]:
        """Generic availability check — no booking, just surfaces options."""
        date     = task_context.get("date", "")
        location = task_context.get("location", "")

        await self._log(f"Checking availability for: {query!r}", level="info")

        results: List[Dict] = []

        if portal_url and self.page:
            try:
                search_url = self._build_search_url(portal_url, portal_name, query, location, date)
                await self.page.goto(search_url, wait_until="domcontentloaded", timeout=30_000)
                await asyncio.sleep(2)
                results = await self._extract_generic_listings()
            except Exception as exc:  # noqa: BLE001 — self-heal
                await self._log(f"Portal search failed ({exc}) — web fallback", level="warn")

        if not results:
            results = await self._google_search_generic(query, location, date)

        # AI enrichment (optional, degrades gracefully).
        if ctx_ai := getattr(getattr(self.bridge, "ai", None), "available", False):
            for r in results[:5]:
                if r.get("snippet") and not r.get("summary"):
                    r["summary"] = await self._ai_summarise(
                        r["snippet"],
                        f"Summarise this booking option for: '{query}'.",
                    )

        item = {
            "action":    "check_availability",
            "portal":    portal_name or "web",
            "query":     query,
            "date":      date,
            "location":  location,
            "options":   results,
            "count":     len(results),
            "timestamp": datetime.now().isoformat(),
            "note":      "Availability shown without booking. Use a specific booking action to reserve.",
        }
        await self._emit("booking_availability", [item])
        return [item]

    # ------------------------------------------------------------------
    # Playwright scraping helpers (with self-healing selector fallbacks)
    # ------------------------------------------------------------------

    async def _scrape_restaurant_slots(
        self,
        portal_url: str,
        portal_name: Optional[str],
        query: str,
        date: str,
        time_pref: str,
        party_size: int,
        location: str,
    ) -> List[Dict]:
        """Navigate to a restaurant portal and extract available time slots."""
        if not self.page:
            return []
        try:
            search_url = self._build_restaurant_search_url(
                portal_url, portal_name, query, date, time_pref, party_size, location
            )
            await self.page.goto(search_url, wait_until="domcontentloaded", timeout=30_000)
            await asyncio.sleep(2)
            await self._log(f"Loaded {portal_name} restaurant search", level="info")
            return await self._extract_slot_listings(portal_name)
        except Exception as exc:  # noqa: BLE001 — self-heal
            await self._log(f"Slot scrape failed ({exc}) — will use web fallback", level="warn")
            return []

    async def _scrape_hotel_listings(
        self,
        portal_url: str,
        portal_name: Optional[str],
        query: str,
        location: str,
        check_in: str,
        check_out: str,
        guests: int,
    ) -> List[Dict]:
        """Navigate to a hotel portal and extract room listings."""
        if not self.page:
            return []
        try:
            search_url = self._build_hotel_search_url(
                portal_url, portal_name, query, location, check_in, check_out, guests
            )
            await self.page.goto(search_url, wait_until="domcontentloaded", timeout=30_000)
            await asyncio.sleep(2)
            await self._log(f"Loaded {portal_name} hotel search", level="info")
            return await self._extract_hotel_listings()
        except Exception as exc:  # noqa: BLE001 — self-heal
            await self._log(f"Hotel scrape failed ({exc}) — will use web fallback", level="warn")
            return []

    async def _scrape_ticket_listings(
        self,
        portal_url: str,
        portal_name: Optional[str],
        event: str,
        date: str,
        location: str,
        qty: int,
    ) -> List[Dict]:
        """Navigate to a ticket portal and extract event listings."""
        if not self.page:
            return []
        try:
            search_url = self._build_ticket_search_url(portal_url, portal_name, event, date, location)
            await self.page.goto(search_url, wait_until="domcontentloaded", timeout=30_000)
            await asyncio.sleep(2)
            await self._log(f"Loaded {portal_name} ticket search", level="info")
            return await self._extract_ticket_listings()
        except Exception as exc:  # noqa: BLE001 — self-heal
            await self._log(f"Ticket scrape failed ({exc}) — will use web fallback", level="warn")
            return []

    async def _scrape_appointment_slots(
        self,
        portal_url: str,
        portal_name: Optional[str],
        query: str,
        date: str,
        time_pref: str,
        location: str,
    ) -> List[Dict]:
        """Navigate to an appointment portal and extract open slots."""
        if not self.page:
            return []
        try:
            search_url = self._build_appointment_search_url(
                portal_url, portal_name, query, date, location
            )
            await self.page.goto(search_url, wait_until="domcontentloaded", timeout=30_000)
            await asyncio.sleep(2)
            await self._log(f"Loaded {portal_name} appointment search", level="info")
            return await self._extract_slot_listings(portal_name)
        except Exception as exc:  # noqa: BLE001 — self-heal
            await self._log(f"Appointment scrape failed ({exc}) — will use web fallback", level="warn")
            return []

    # ------------------------------------------------------------------
    # Generic page extraction (self-healing: tries multiple selector patterns)
    # ------------------------------------------------------------------

    async def _extract_generic_listings(self) -> List[Dict]:
        """Extract any card-like elements from the current page."""
        if not self.page:
            return []
        selector_chains = [
            "[data-testid*='card']",
            "[data-testid*='listing']",
            "[data-testid*='result']",
            "[class*='card']",
            "[class*='listing']",
            "[class*='result']",
            "article",
            "li[class*='item']",
        ]
        for sel in selector_chains:
            try:
                cards = await self.page.query_selector_all(sel)
                if len(cards) >= 2:
                    items = []
                    for card in cards[:10]:
                        text = (await card.inner_text()).strip()
                        link_el = await card.query_selector("a[href]")
                        href = await link_el.get_attribute("href") if link_el else None
                        if text:
                            items.append({"text": text[:300], "url": href})
                    return [i for i in items if i["text"]]
            except Exception:
                continue
        return []

    async def _extract_slot_listings(self, portal_name: Optional[str]) -> List[Dict]:
        """Extract time-slot elements from a restaurant/appointment page."""
        if not self.page:
            return []
        slot_selectors = [
            "[data-testid*='time-slot']",
            "[data-testid*='timeslot']",
            "[class*='timeslot']",
            "[class*='time-slot']",
            "[class*='availability']",
            "button[data-datetime]",
            "button[data-time]",
            "a[data-time]",
        ]
        for sel in slot_selectors:
            try:
                els = await self.page.query_selector_all(sel)
                if els:
                    slots = []
                    for el in els[:20]:
                        text = (await el.inner_text()).strip()
                        dt = (
                            await el.get_attribute("data-datetime")
                            or await el.get_attribute("data-time")
                        )
                        if text:
                            slots.append({
                                "time":   text,
                                "dt":     dt,
                                "portal": portal_name or "web",
                            })
                    if slots:
                        return slots
            except Exception:
                continue

        # Fallback: scan visible text for time-like tokens.
        return await self._extract_times_from_text(portal_name)

    async def _extract_times_from_text(self, portal_name: Optional[str]) -> List[Dict]:
        """Last-resort: regex-scan page text for time strings."""
        if not self.page:
            return []
        try:
            text = await self.page.evaluate("() => document.body.innerText || ''")
            time_re = re.compile(r"\b\d{1,2}:\d{2}\s?(?:AM|PM|am|pm)\b")
            times = list(dict.fromkeys(time_re.findall(text or "")))  # dedupe
            return [{"time": t, "portal": portal_name or "web"} for t in times[:20]]
        except Exception:
            return []

    async def _extract_hotel_listings(self) -> List[Dict]:
        """Extract hotel card data from a hotel search results page."""
        if not self.page:
            return []
        price_re = re.compile(r"\$[\d,]+|\£[\d,]+|[\d,]+\s?per\s?night", re.IGNORECASE)
        selectors = [
            "[data-testid*='property-card']",
            "[data-testid*='hotel-card']",
            "[data-testid*='result-card']",
            "[class*='hotel-card']",
            "[class*='property']",
            "article[data-testid]",
        ]
        for sel in selectors:
            try:
                cards = await self.page.query_selector_all(sel)
                if len(cards) >= 1:
                    hotels = []
                    for card in cards[:10]:
                        text = (await card.inner_text()).strip()
                        link_el = await card.query_selector("a[href]")
                        href = await link_el.get_attribute("href") if link_el else None
                        price_match = price_re.search(text)
                        name_line = text.split("\n")[0][:120] if text else ""
                        if name_line:
                            hotels.append({
                                "name":  name_line,
                                "price": price_match.group(0) if price_match else "",
                                "url":   href,
                                "text":  text[:400],
                            })
                    if hotels:
                        return hotels
            except Exception:
                continue
        return []

    async def _extract_ticket_listings(self) -> List[Dict]:
        """Extract event/ticket card data from a ticket search page."""
        if not self.page:
            return []
        price_re = re.compile(r"\$[\d,]+|\£[\d,]+", re.IGNORECASE)
        selectors = [
            "[data-testid*='event']",
            "[class*='event-card']",
            "[class*='ticket']",
            "li[data-event-id]",
            "article",
        ]
        for sel in selectors:
            try:
                cards = await self.page.query_selector_all(sel)
                if len(cards) >= 1:
                    tickets = []
                    for card in cards[:10]:
                        text = (await card.inner_text()).strip()
                        link_el = await card.query_selector("a[href]")
                        href = await link_el.get_attribute("href") if link_el else None
                        price_match = price_re.search(text)
                        name_line = text.split("\n")[0][:120] if text else ""
                        if name_line:
                            tickets.append({
                                "name":  name_line,
                                "price": price_match.group(0) if price_match else "",
                                "url":   href,
                                "text":  text[:400],
                            })
                    if tickets:
                        return tickets
            except Exception:
                continue
        return []

    # ------------------------------------------------------------------
    # Navigation + confirm helper (self-healing button finder)
    # ------------------------------------------------------------------

    async def _navigate_and_confirm(self, candidate: Dict, portal_url: Optional[str]) -> Dict:
        """Navigate to the booking URL and surface the confirm button.

        Does NOT click the confirm button — that step requires the user to act
        on the live browser view after approval. This ensures OmniTask never
        submits a booking without explicit human confirmation at the UI level.
        """
        target_url = candidate.get("url") or portal_url
        if not target_url or not self.page:
            candidate["status"] = "PORTAL_OPENED"
            candidate["note"] = (
                "No booking URL resolved. Please complete the reservation manually "
                "in the browser."
            )
            return candidate

        try:
            await self.page.goto(target_url, wait_until="domcontentloaded", timeout=30_000)
            await asyncio.sleep(2)
            await self._log(f"Navigated to booking page: {target_url}", level="info")

            # Self-healing: find the confirm button so the user sees it highlighted.
            confirm_btn = None
            for sel in CONFIRM_SELECTORS:
                try:
                    el = await self.page.query_selector(sel)
                    if el:
                        confirm_btn = sel
                        await self._log(
                            f"Confirm button found ({sel}) — awaiting user action on live view.",
                            level="info",
                        )
                        break
                except Exception:
                    continue

            candidate["portalUrl"]  = target_url
            candidate["confirmBtn"] = confirm_btn
            candidate["status"]     = "PORTAL_OPENED"
            candidate["note"] = (
                "Portal opened and booking form loaded. "
                + (
                    f"A '{confirm_btn}' button was detected. "
                    if confirm_btn
                    else "Locate the confirm/reserve button. "
                )
                + "Complete any remaining fields and click confirm on the live browser view. "
                "OmniTask does not click the final submit without your on-screen action."
            )
        except Exception as exc:  # noqa: BLE001 — self-heal
            await self._log(
                f"Navigation to booking page failed ({exc}). "
                "Please complete the booking manually.",
                level="warn",
            )
            candidate["status"] = "PORTAL_OPENED"
            candidate["error"]  = str(exc)
            candidate["note"]   = (
                f"Could not navigate to {target_url}. "
                "Open the portal manually and complete the booking."
            )
        return candidate

    # ------------------------------------------------------------------
    # URL builders per portal family
    # ------------------------------------------------------------------

    def _build_restaurant_search_url(
        self,
        portal_url: str,
        portal_name: Optional[str],
        query: str,
        date: str,
        time_pref: str,
        party_size: int,
        location: str,
    ) -> str:
        q = quote_plus(f"{query} {location}".strip())
        if portal_name == "opentable":
            covers = max(1, int(party_size or 2))
            d = quote_plus(date or "")
            t = quote_plus(time_pref or "19:00")
            return (
                f"https://www.opentable.com/s/?covers={covers}"
                + (f"&dateTime={d}T{t}" if d else "")
                + f"&metroName={quote_plus(location)}&term={quote_plus(query)}"
            )
        if portal_name == "resy":
            d = quote_plus(date or "")
            return (
                f"https://resy.com/cities/{quote_plus(location)}?date={d}"
                f"&seats={party_size}&query={quote_plus(query)}"
            )
        # Generic fallback: Yelp or portal's own search.
        return f"https://www.yelp.com/search?find_desc={q}&find_loc={quote_plus(location)}"

    def _build_hotel_search_url(
        self,
        portal_url: str,
        portal_name: Optional[str],
        query: str,
        location: str,
        check_in: str,
        check_out: str,
        guests: int,
    ) -> str:
        q = quote_plus(f"{query} {location}".strip())
        if portal_name == "booking":
            return (
                f"https://www.booking.com/searchresults.html?"
                f"ss={quote_plus(location or query)}"
                + (f"&checkin={check_in}&checkout={check_out}" if check_in else "")
                + f"&group_adults={guests}"
            )
        if portal_name == "expedia":
            return (
                f"https://www.expedia.com/Hotel-Search?"
                f"destination={quote_plus(location or query)}"
                + (f"&startDate={check_in}&endDate={check_out}" if check_in else "")
                + f"&adults={guests}"
            )
        return f"https://www.hotels.com/search.do?q-destination={quote_plus(location or query)}"

    def _build_ticket_search_url(
        self,
        portal_url: str,
        portal_name: Optional[str],
        event: str,
        date: str,
        location: str,
    ) -> str:
        q = quote_plus(event)
        if portal_name == "ticketmaster":
            return f"https://www.ticketmaster.com/search?q={q}"
        if portal_name == "stubhub":
            return f"https://www.stubhub.com/find/s/?q={q}"
        if portal_name == "eventbrite":
            return f"https://www.eventbrite.com/d/{quote_plus(location or 'online')}/{q}/"
        if portal_name == "seatgeek":
            return f"https://seatgeek.com/{q.replace('+', '-')}"
        return f"https://www.ticketmaster.com/search?q={q}"

    def _build_appointment_search_url(
        self,
        portal_url: str,
        portal_name: Optional[str],
        query: str,
        date: str,
        location: str,
    ) -> str:
        q = quote_plus(query)
        if portal_name == "zocdoc":
            return f"https://www.zocdoc.com/search/?address={quote_plus(location)}&q={q}"
        return f"{portal_url}?q={q}"

    def _build_search_url(
        self,
        portal_url: str,
        portal_name: Optional[str],
        query: str,
        location: str,
        date: str,
    ) -> str:
        q = quote_plus(f"{query} {location} {date}".strip())
        return f"https://www.google.com/search?q={q}+booking+reservation"

    # ------------------------------------------------------------------
    # Web search fallbacks (used when portal scrape returns nothing)
    # ------------------------------------------------------------------

    async def _google_search_slots(
        self, query: str, location: str, date: str, time_pref: str
    ) -> List[Dict]:
        q = f"{query} {location} {date} {time_pref} reservation book table".strip()
        return await self._google_search(q, kind="slot")

    async def _google_search_hotels(
        self, query: str, location: str, check_in: str, check_out: str
    ) -> List[Dict]:
        q = f"{query} {location} {check_in} hotel room availability".strip()
        return await self._google_search(q, kind="hotel")

    async def _google_search_tickets(
        self, event: str, date: str, location: str
    ) -> List[Dict]:
        q = f"{event} {date} {location} tickets buy".strip()
        return await self._google_search(q, kind="ticket")

    async def _google_search_appointments(
        self, query: str, location: str, date: str
    ) -> List[Dict]:
        q = f"{query} {location} {date} appointment schedule".strip()
        return await self._google_search(q, kind="appointment")

    async def _google_search_generic(
        self, query: str, location: str, date: str
    ) -> List[Dict]:
        q = f"{query} {location} {date} book reserve".strip()
        return await self._google_search(q, kind="listing")

    async def _google_search(self, query: str, kind: str = "listing") -> List[Dict]:
        """Perform a Google search and extract organic result cards."""
        if not self.page:
            return []
        try:
            url = f"https://www.google.com/search?q={quote_plus(query)}"
            await self.page.goto(url, wait_until="domcontentloaded", timeout=20_000)
            await asyncio.sleep(1)

            # Extract organic search result blocks.
            results_js = """
            () => {
                const cards = [];
                document.querySelectorAll('div.g, div[data-hveid]').forEach(el => {
                    const title_el = el.querySelector('h3');
                    const link_el  = el.querySelector('a[href]');
                    const snip_el  = el.querySelector('div[data-sncf], span[data-snhf]') ||
                                     el.querySelector('.VwiC3b, .s3v9rd, .st');
                    const title    = title_el ? title_el.innerText.trim() : '';
                    const url      = link_el  ? link_el.href : '';
                    const snippet  = snip_el  ? snip_el.innerText.trim().slice(0, 300) : '';
                    if (title && url && !url.startsWith('https://www.google.')) {
                        cards.push({ title, url, snippet });
                    }
                });
                return cards.slice(0, 8);
            }
            """
            raw = await self.page.evaluate(results_js)
            return [{"name": r.get("title", ""), "url": r.get("url", ""),
                     "snippet": r.get("snippet", ""), "kind": kind}
                    for r in (raw or []) if r.get("title")]
        except Exception as exc:  # noqa: BLE001 — self-heal
            await self._log(f"Google search fallback failed ({exc})", level="warn")
            return []

    # ------------------------------------------------------------------
    # Resolution helpers
    # ------------------------------------------------------------------

    def _resolve_action(self, task_type: str, goal: str) -> str:
        key = (task_type or "").strip().lower()
        if key in TASK_ACTION_MAP:
            return TASK_ACTION_MAP[key]
        g = goal.lower()
        if any(w in g for w in ("restaurant", "dinner", "lunch", "brunch", "table", "resy", "opentable")):
            return "book_restaurant"
        if any(w in g for w in ("hotel", "room", "stay", "airbnb", "hostel", "accommodation")):
            return "book_hotel"
        if any(w in g for w in ("ticket", "concert", "event", "show", "game", "match", "ticketmaster")):
            return "book_ticket"
        if any(w in g for w in ("appointment", "doctor", "dentist", "barber", "salon", "zocdoc")):
            return "book_appointment"
        if any(w in g for w in ("cancel", "refund", "reschedule")):
            return "cancel_booking"
        return "check_availability"

    def _resolve_portal(
        self, portal_key: str, goal: str, action: str
    ) -> tuple[Optional[str], Optional[str]]:
        if portal_key and portal_key in BOOKING_PORTALS:
            return portal_key, BOOKING_PORTALS[portal_key]
        g = goal.lower()
        for name, url in BOOKING_PORTALS.items():
            if name in g:
                return name, url
        # Default portals by action type.
        defaults = {
            "book_restaurant": ("opentable", BOOKING_PORTALS["opentable"]),
            "book_hotel":      ("booking", BOOKING_PORTALS["booking"]),
            "book_ticket":     ("ticketmaster", BOOKING_PORTALS["ticketmaster"]),
            "book_appointment": ("zocdoc", BOOKING_PORTALS["zocdoc"]),
        }
        return defaults.get(action, (None, None))

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
        """Request user approval before a consequential action.

        Returns True (proceed) when:
          - running standalone (no bridge) — auto-approve in CLI mode
          - BOOKING_AUTO_APPROVE env var is set
          - bridge.gate() returns True
        """
        auto = os.environ.get("BOOKING_AUTO_APPROVE", "").strip().lower() in (
            "1", "true", "yes"
        )
        if auto:
            await self._log("Auto-approved (BOOKING_AUTO_APPROVE=true)", level="warn")
            return True
        if self.bridge is None:
            await self._log("Standalone mode — auto-approving booking gate", level="warn")
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
    def _no_results_item(
        action: str, query: str, portal: Optional[str], note: str = ""
    ) -> Dict:
        return {
            "action":    action,
            "portal":    portal or "web",
            "query":     query,
            "status":    "no_results",
            "note":      note,
            "timestamp": datetime.now().isoformat(),
        }

    @staticmethod
    def _result(
        phase: str,
        action: str,
        items: List[Dict],
        status: str = "success",
    ) -> Dict:
        return {
            "action":  action,
            "phase":   phase,
            "status":  status,
            "booking": items[0] if items else {},
            "data":    {"items": items, "count": len(items)},
            "items":   items,
        }


# ---------------------------------------------------------------------------
# Standalone CLI entry point (mirrors finance_agent pattern)
# ---------------------------------------------------------------------------

async def _cli_main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [booking_agent] %(levelname)s %(message)s",
    )
    logger = logging.getLogger("Main")
    logger.info("=" * 60)
    logger.info("BOOKING AGENT — standalone mode")
    logger.info("=" * 60)

    task_context = {
        "goal":      os.environ.get("BOOKING_GOAL", "book a table at an Italian restaurant"),
        "task_type": os.environ.get("BOOKING_TASK_TYPE", "restaurant_booking"),
        "portal":    os.environ.get("BOOKING_PORTAL", ""),
        "query":     os.environ.get("BOOKING_QUERY", ""),
        "date":      os.environ.get("BOOKING_DATE", ""),
        "time":      os.environ.get("BOOKING_TIME", ""),
        "party_size": int(os.environ.get("BOOKING_PARTY_SIZE", "2")),
        "location":  os.environ.get("BOOKING_LOCATION", ""),
        "event":     os.environ.get("BOOKING_EVENT", ""),
    }

    agent = BookingAgent()
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
    asyncio.run(_cli_main())
