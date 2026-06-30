"""
Travel Agent
Autonomous browser agent for flights, hotels, and itinerary building.

Supports:
  - Flight search (Google Flights, Kayak)
  - Hotel search (Booking.com, Hotels.com)
  - Itinerary building (aggregated multi-leg travel plan)

Usage (standalone CLI):
    python travel_agent.py "flights from NYC to London June 10"

Usage (as an OmniTask skill — injected by skills/travel.py):
    agent = TravelAgent(bridge=bridge, page=page)
    result = await agent.execute(task_context)

The `bridge` parameter is None in standalone mode (no live dashboard, no
approval gate). When injected by the skill dispatcher it exposes the same
PortalBridge-style interface used by BookingAgent / FinanceAgent for streaming
events and gating every payment/checkout through the approval panel.

All consequential payment actions are ALWAYS gated through bridge.gate()
before any click is made.  TRAVEL_AUTO_APPROVE=true skips the gate
(autonomous mode, off by default).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import sys
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import quote_plus

log = logging.getLogger("browser-py.travel_agent")


# ---------------------------------------------------------------------------
# Portal catalogue
# ---------------------------------------------------------------------------

TRAVEL_PORTALS: Dict[str, str] = {
    # Flights
    "google_flights": "https://www.google.com/travel/flights",
    "kayak":          "https://www.kayak.com/flights",
    "expedia":        "https://www.expedia.com/Flights",
    "skyscanner":     "https://www.skyscanner.com/",
    # Hotels
    "booking":        "https://www.booking.com/",
    "hotels":         "https://www.hotels.com/",
    "expedia_hotels": "https://www.expedia.com/Hotels",
    "airbnb":         "https://www.airbnb.com/",
}

# Task-type → action label so result shape is consistent with BookingAgent.
TASK_ACTION_MAP: Dict[str, str] = {
    "search_flights":    "search_flights",
    "flight_search":     "search_flights",
    "flights":           "search_flights",
    "search_hotels":     "search_hotels",
    "hotel_search":      "search_hotels",
    "hotels":            "search_hotels",
    "build_itinerary":   "build_itinerary",
    "itinerary":         "build_itinerary",
    "plan_trip":         "build_itinerary",
    "travel":            "search_flights",   # default
    "book_flight":       "search_flights",   # search then gate
    "book_hotel":        "search_hotels",    # search then gate
}

# ---------------------------------------------------------------------------
# DOM helpers (evaluated in live Playwright page)
# ---------------------------------------------------------------------------

_GOOGLE_FLIGHTS_RESULTS_JS = r"""
(() => {
  const out = [];
  const cards = document.querySelectorAll('[data-gs]');
  for (const card of cards) {
    try {
      const price  = (card.querySelector('[data-gs] [aria-label*="$"]') ||
                      card.querySelector('[data-gs] [aria-label*="USD"]'))?.getAttribute('aria-label')
                      || card.querySelector('.YMlIz')?.textContent
                      || card.querySelector('[data-itype="price"]')?.textContent || '';
      const airline = card.querySelector('.Ir0Voe .sSHqwe')?.textContent
                      || card.querySelector('[aria-label*="airlines"]')?.getAttribute('aria-label')
                      || card.querySelector('.h1fkLb')?.textContent || '';
      const duration = card.querySelector('.gvkrdb')?.textContent
                      || card.querySelector('[aria-label*="hr"]')?.getAttribute('aria-label') || '';
      const stops    = card.querySelector('.EfT7Ae span')?.textContent
                      || card.querySelector('.ogfYpf')?.textContent || '';
      const depart   = card.querySelector('.wtdjmc')?.textContent || '';
      const arrive   = card.querySelector('.Ak5kof .eoY5cb')?.textContent || '';
      if (price || airline) {
        out.push({ price, airline, duration, stops, depart, arrive });
      }
    } catch (_) {}
    if (out.length >= 10) break;
  }
  return out;
})()
"""

_KAYAK_FLIGHTS_RESULTS_JS = r"""
(() => {
  const out = [];
  const rows = document.querySelectorAll('.resultWrapper');
  for (const row of rows) {
    try {
      const price   = row.querySelector('.price-text')?.textContent?.trim() || '';
      const airline = row.querySelector('.codeshares-airline-names')?.textContent?.trim()
                      || row.querySelector('.carrier-name')?.textContent?.trim() || '';
      const duration = row.querySelector('.duration')?.textContent?.trim() || '';
      const stops    = row.querySelector('.stops-text')?.textContent?.trim() || '';
      if (price || airline) {
        out.push({ price, airline, duration, stops, depart: '', arrive: '' });
      }
    } catch (_) {}
    if (out.length >= 10) break;
  }
  return out;
})()
"""

_BOOKING_HOTELS_RESULTS_JS = r"""
(() => {
  const out = [];
  const cards = document.querySelectorAll('[data-testid="property-card"]');
  for (const card of cards) {
    try {
      const name    = card.querySelector('[data-testid="title"]')?.textContent?.trim() || '';
      const price   = card.querySelector('[data-testid="price-and-discounted-price"]')?.textContent?.trim()
                      || card.querySelector('.prco-valign-middle-helper')?.textContent?.trim() || '';
      const rating  = card.querySelector('[data-testid="review-score"]')?.textContent?.trim()
                      || card.querySelector('.b5cd09854e')?.textContent?.trim() || '';
      const location = card.querySelector('[data-testid="address"]')?.textContent?.trim() || '';
      const link    = card.querySelector('a[data-testid="title-link"]')?.href || '';
      if (name) {
        out.push({ name, price, rating, location, url: link });
      }
    } catch (_) {}
    if (out.length >= 10) break;
  }
  return out;
})()
"""

_HOTELS_COM_RESULTS_JS = r"""
(() => {
  const out = [];
  const cards = document.querySelectorAll('[data-stid="lodging-card-responsive"]');
  for (const card of cards) {
    try {
      const name  = card.querySelector('h3')?.textContent?.trim() || '';
      const price = card.querySelector('[data-stid="price-summary"]')?.textContent?.trim()
                    || card.querySelector('.price__value')?.textContent?.trim() || '';
      const rating = card.querySelector('[class*="review"] span')?.textContent?.trim() || '';
      const link  = card.querySelector('a')?.href || '';
      if (name) {
        out.push({ name, price, rating, location: '', url: link });
      }
    } catch (_) {}
    if (out.length >= 10) break;
  }
  return out;
})()
"""


# ---------------------------------------------------------------------------
# TravelAgent
# ---------------------------------------------------------------------------

class TravelAgent:
    """Orchestrates flight search, hotel search, and itinerary building.

    Follows the same lifecycle as BookingAgent / ResearchAgentOrchestrator:

      1. Constructed in __init__ (no I/O)
      2. Called via execute(task_context) — OmniTask injected mode
         OR run(page, query) in standalone CLI mode
      3. Progress streamed through ``bridge`` callbacks when available

    The ``bridge`` object is expected to expose:

        bridge.log(message, level='info')   — async, dashboard log line
        bridge.emit_result(kind, items)     — async, structured results
        bridge.cancelled()                  — async bool, stop signal
        bridge.gate(description, step_data) — async bool, approval gate
    """

    # Navigation timeout (ms)
    NAV_TIMEOUT = 30_000
    # Seconds to let JS settle after load
    SETTLE_SECS = 2.0
    # Max results to surface per source
    MAX_RESULTS = 5

    def __init__(self, bridge: Optional[Any] = None, page=None):
        """
        Args:
            bridge: Optional OmniTask integration bridge.  When provided, every
                log line, result, and approval gate is wired to the dashboard.
                When None the agent runs standalone (logs go to Python logging).
            page:   Optional Playwright Page pre-wired by the skill layer.
                    Stored here for convenience; also accepted in execute().
        """
        self.bridge = bridge
        self._page = page
        self._context = None

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    async def execute(self, task_context: Dict) -> Dict:
        """Entry point used by the executor / skill layer.

        ``task_context`` mirrors the SkillContext fields that are plain dicts:
            task_context['goal']       — the user's travel goal
            task_context['page']       — live Playwright Page object
            task_context['job']        — full raw job payload (optional extras)
            task_context['session_id'] — str
            task_context['user_id']    — str
            task_context['publisher']  — EventPublisher (for bridge wiring)
            task_context['task_type']  — 'search_flights' | 'search_hotels' | 'build_itinerary'
            task_context['origin']     — departure city / airport (flights)
            task_context['destination']— arrival city / airport (flights + hotels)
            task_context['check_in']   — ISO date string YYYY-MM-DD
            task_context['check_out']  — ISO date string YYYY-MM-DD (hotels)
            task_context['depart_date']— ISO date string (flights)
            task_context['return_date']— ISO date string (round-trip flights)
            task_context['passengers'] — int (flights)
            task_context['guests']     — int (hotels)
            task_context['portal']     — preferred portal key (optional)

        Returns:
            {
                "action":      "search_flights" | "search_hotels" | "build_itinerary",
                "results":     [...],
                "best_option": {...},
                "total_cost":  0.0,
                "status":      "success" | "partial" | "failed",
                "items":       [...],        # same as results
                "total":       int,
                "step_results":[{"stepIndex": i, "success": bool, "durationMs": 0}],
                "summary":     str,
            }
        """
        # If skill layer wired the page directly into execute(), use it.
        page = task_context.get("page") or self._page
        publisher = task_context.get("publisher")
        session_id = task_context.get("session_id", "")

        # Build a lightweight bridge shim from publisher + session_id when no
        # bridge was provided at construction time (OmniTask injected mode).
        if self.bridge is None and publisher is not None:
            self.bridge = _PublisherBridge(publisher, session_id)

        if page is not None:
            self._page = page

        task_type = (
            task_context.get("task_type")
            or task_context.get("action")
            or task_context.get("skill")
            or ""
        ).lower()
        action = TASK_ACTION_MAP.get(task_type, "search_flights")

        query = (
            task_context.get("query")
            or task_context.get("goal")
            or ""
        )

        return await self.run(
            page=page,
            query=query,
            action=action,
            task_context=task_context,
        )

    async def run(
        self,
        page=None,
        context=None,
        query: str = "",
        action: str = "search_flights",
        task_context: Optional[Dict] = None,
    ) -> Dict:
        """Perform the full travel automation pipeline.

        Args:
            page:         Live Playwright Page (injected by the OmniTask engine).
                          When None the method launches its own standalone browser.
            context:      BrowserContext that owns the page.
            query:        Free-form travel query used when structured fields are absent.
            action:       'search_flights' | 'search_hotels' | 'build_itinerary'
            task_context: Full structured payload from execute().

        Returns:
            {
                "action":      str,
                "results":     list[dict],
                "best_option": dict,
                "total_cost":  float,
                "status":      "success" | "partial" | "failed",
                "items":       list[dict],
                "total":       int,
                "step_results":[{stepIndex, success, durationMs}],
                "summary":     str,
            }
        """
        start_time = datetime.now()
        task_context = task_context or {}
        query = (query or os.environ.get("TRAVEL_QUERY", "")).strip()
        injected = page is not None

        await self._log(f"Travel agent starting — action={action!r}, query={query!r}")

        if not query and not task_context.get("destination"):
            await self._log("No travel query or destination provided — aborting.", level="error")
            return self._empty_result("no_query", action)

        # In standalone mode launch our own browser.  In injected mode reuse
        # the engine's live page so the dashboard screencast works.
        own_playwright = None
        own_browser = None
        if not injected:
            try:
                from playwright.async_api import async_playwright  # noqa: PLC0415
                own_playwright = await async_playwright().start()
                own_browser = await own_playwright.chromium.launch(
                    headless=True,
                    args=["--no-sandbox", "--disable-blink-features=AutomationControlled"],
                )
                context = await own_browser.new_context(
                    viewport={"width": 1280, "height": 800},
                    user_agent=(
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/124.0.0.0 Safari/537.36"
                    ),
                    locale="en-US",
                )
                page = await context.new_page()
            except Exception as exc:
                log.error("Could not launch standalone browser: %s", exc)
                return self._empty_result("browser_launch_failed", action)

        self._page = page
        self._context = context

        try:
            if action == "search_flights":
                result = await self._search_flights(query, task_context)
            elif action == "search_hotels":
                result = await self._search_hotels(query, task_context)
            elif action == "build_itinerary":
                result = await self._build_itinerary(query, task_context)
            else:
                result = await self._search_flights(query, task_context)
        except Exception as exc:
            log.exception("Travel pipeline crashed: %s", exc)
            await self._log(f"Travel pipeline error: {exc}", level="error")
            result = self._empty_result("pipeline_error", action)
        finally:
            if not injected:
                try:
                    if own_browser:
                        await own_browser.close()
                    if own_playwright:
                        await own_playwright.stop()
                except Exception:
                    pass

        duration = (datetime.now() - start_time).total_seconds()
        await self._log(
            f"Travel agent complete — action={action}, "
            f"{result.get('total', 0)} result(s) in {duration:.1f}s",
            level="success",
        )
        return result

    # ------------------------------------------------------------------
    # Core pipeline — flights
    # ------------------------------------------------------------------

    async def _search_flights(self, query: str, ctx: Dict) -> Dict:
        """Search Google Flights then Kayak as fallback."""
        origin      = ctx.get("origin", "")
        destination = ctx.get("destination", "")
        depart_date = ctx.get("depart_date") or ctx.get("check_in", "")
        return_date = ctx.get("return_date") or ctx.get("check_out", "")
        passengers  = ctx.get("passengers") or 1

        # Build a descriptive query when structured fields are present.
        if not query and (origin or destination):
            parts = ["flights"]
            if origin:
                parts.append(f"from {origin}")
            if destination:
                parts.append(f"to {destination}")
            if depart_date:
                parts.append(depart_date)
            if return_date:
                parts.append(f"return {return_date}")
            query = " ".join(parts)

        await self._log(f"Searching flights: {query}")

        results: List[Dict] = []

        # --- Google Flights ---
        results = await self._google_flights(origin, destination, depart_date, return_date, passengers)
        if results:
            await self._log(f"Google Flights returned {len(results)} result(s).")
        else:
            await self._log("Google Flights returned no results — trying Kayak.", level="warn")
            results = await self._kayak_flights(origin, destination, depart_date, return_date, passengers)

        results = results[: self.MAX_RESULTS]

        # Derive best option (cheapest parseable price, else first result).
        best_option = self._pick_best_flight(results)
        total_cost  = _parse_price(best_option.get("price", "0"))

        await self._emit_result("travel_flights", results)

        # Approval gate before any payment action.
        if ctx.get("action", "").startswith("book") or ctx.get("task_type", "").startswith("book"):
            approved = await self._gate(
                f"Proceed to book flight: {best_option.get('airline', 'selected flight')} "
                f"for {best_option.get('price', 'unknown price')}?",
                {
                    "action":      "book_flight",
                    "destination": destination,
                    "date":        depart_date,
                    "price":       best_option.get("price", ""),
                },
            )
            if not approved:
                await self._log("User declined flight booking — stopping.", level="warn")
                return self._build_result("search_flights", results, best_option, total_cost, "partial")

        n = len(results)
        summary = (
            f"Found {n} flight option(s) from {origin or '?'} to {destination or '?'}. "
            f"Best: {best_option.get('airline', '')} at {best_option.get('price', 'N/A')} "
            f"({best_option.get('duration', '')})."
        )
        await self._log(summary, level="success")
        return self._build_result("search_flights", results, best_option, total_cost, "success", summary)

    async def _google_flights(
        self,
        origin: str,
        destination: str,
        depart_date: str,
        return_date: str,
        passengers: int,
    ) -> List[Dict]:
        """Navigate Google Flights and extract result cards."""
        # Build a direct URL with query params when we have structured fields.
        if origin and destination:
            q = quote_plus(
                f"flights from {origin} to {destination}"
                + (f" {depart_date}" if depart_date else "")
            )
            url = f"https://www.google.com/travel/flights?q={q}"
        else:
            url = "https://www.google.com/travel/flights"

        try:
            await self._page.goto(url, wait_until="domcontentloaded", timeout=self.NAV_TIMEOUT)
            await self._dismiss_overlays()
            await asyncio.sleep(self.SETTLE_SECS)

            # Self-healing selector cascade — try JS extraction first.
            results = await self._page.evaluate(_GOOGLE_FLIGHTS_RESULTS_JS)
            if results:
                return results

            # Fallback: generic price anchors.
            results = await self._extract_generic_price_items("flight")
            return results
        except Exception as exc:
            log.debug("Google Flights search failed (%s)", exc)
            return []

    async def _kayak_flights(
        self,
        origin: str,
        destination: str,
        depart_date: str,
        return_date: str,
        passengers: int,
    ) -> List[Dict]:
        """Navigate Kayak and extract flight result rows."""
        if origin and destination:
            orig_code = origin[:3].upper()
            dest_code = destination[:3].upper()
            dep  = depart_date.replace("-", "") if depart_date else datetime.now().strftime("%Y%m%d")
            url  = f"https://www.kayak.com/flights/{orig_code}-{dest_code}/{dep}"
            if return_date:
                ret = return_date.replace("-", "")
                url += f"/{ret}"
            url += f"/{passengers}adults"
        else:
            q   = quote_plus(f"flights {origin} to {destination} {depart_date}".strip())
            url = f"https://www.kayak.com/flights?q={q}"

        try:
            await self._page.goto(url, wait_until="domcontentloaded", timeout=self.NAV_TIMEOUT)
            await self._dismiss_overlays()
            await asyncio.sleep(self.SETTLE_SECS)

            results = await self._page.evaluate(_KAYAK_FLIGHTS_RESULTS_JS)
            if results:
                return results

            return await self._extract_generic_price_items("flight")
        except Exception as exc:
            log.debug("Kayak flights search failed (%s)", exc)
            return []

    # ------------------------------------------------------------------
    # Core pipeline — hotels
    # ------------------------------------------------------------------

    async def _search_hotels(self, query: str, ctx: Dict) -> Dict:
        """Search Booking.com then Hotels.com as fallback."""
        destination = ctx.get("destination", "")
        check_in    = ctx.get("check_in") or ctx.get("depart_date", "")
        check_out   = ctx.get("check_out") or ctx.get("return_date", "")
        guests      = ctx.get("guests") or ctx.get("passengers") or 2

        if not query and destination:
            query = f"hotels in {destination}"
            if check_in:
                query += f" {check_in}"
            if check_out:
                query += f" to {check_out}"

        await self._log(f"Searching hotels: {query}")

        results: List[Dict] = []

        # --- Booking.com ---
        results = await self._booking_com_hotels(destination, check_in, check_out, guests)
        if results:
            await self._log(f"Booking.com returned {len(results)} hotel(s).")
        else:
            await self._log("Booking.com returned no results — trying Hotels.com.", level="warn")
            results = await self._hotels_com(destination, check_in, check_out, guests)

        results = results[: self.MAX_RESULTS]

        best_option = self._pick_best_hotel(results)
        total_cost  = _parse_price(best_option.get("price", "0"))

        await self._emit_result("travel_hotels", results)

        # Approval gate before payment.
        if ctx.get("action", "").startswith("book") or ctx.get("task_type", "").startswith("book"):
            approved = await self._gate(
                f"Proceed to book hotel: {best_option.get('name', 'selected hotel')} "
                f"for {best_option.get('price', 'unknown price')}?",
                {
                    "action":      "book_hotel",
                    "destination": destination,
                    "date":        check_in,
                    "price":       best_option.get("price", ""),
                },
            )
            if not approved:
                await self._log("User declined hotel booking — stopping.", level="warn")
                return self._build_result("search_hotels", results, best_option, total_cost, "partial")

        n = len(results)
        summary = (
            f"Found {n} hotel(s) in {destination or '?'}. "
            f"Best: {best_option.get('name', '')} at {best_option.get('price', 'N/A')} "
            f"(rating: {best_option.get('rating', 'N/A')})."
        )
        await self._log(summary, level="success")
        return self._build_result("search_hotels", results, best_option, total_cost, "success", summary)

    async def _booking_com_hotels(
        self,
        destination: str,
        check_in: str,
        check_out: str,
        guests: int,
    ) -> List[Dict]:
        """Navigate Booking.com and extract hotel cards."""
        q = quote_plus(destination or "hotels")
        url = f"https://www.booking.com/searchresults.html?ss={q}&lang=en-gb"
        if check_in:
            parts = check_in.split("-")
            if len(parts) == 3:
                url += f"&checkin_year={parts[0]}&checkin_month={parts[1]}&checkin_monthday={parts[2]}"
        if check_out:
            parts = check_out.split("-")
            if len(parts) == 3:
                url += f"&checkout_year={parts[0]}&checkout_month={parts[1]}&checkout_monthday={parts[2]}"
        url += f"&group_adults={guests}"

        try:
            await self._page.goto(url, wait_until="domcontentloaded", timeout=self.NAV_TIMEOUT)
            await self._dismiss_overlays()
            await asyncio.sleep(self.SETTLE_SECS)

            results = await self._page.evaluate(_BOOKING_HOTELS_RESULTS_JS)
            if results:
                return results

            return await self._extract_generic_hotel_items()
        except Exception as exc:
            log.debug("Booking.com search failed (%s)", exc)
            return []

    async def _hotels_com(
        self,
        destination: str,
        check_in: str,
        check_out: str,
        guests: int,
    ) -> List[Dict]:
        """Navigate Hotels.com and extract hotel cards."""
        q = quote_plus(destination or "hotels")
        url = f"https://www.hotels.com/search.do?q-destination={q}&q-rooms=1&q-room-0-adults={guests}"
        if check_in:
            url += f"&q-check-in={check_in}"
        if check_out:
            url += f"&q-check-out={check_out}"

        try:
            await self._page.goto(url, wait_until="domcontentloaded", timeout=self.NAV_TIMEOUT)
            await self._dismiss_overlays()
            await asyncio.sleep(self.SETTLE_SECS)

            results = await self._page.evaluate(_HOTELS_COM_RESULTS_JS)
            if results:
                return results

            return await self._extract_generic_hotel_items()
        except Exception as exc:
            log.debug("Hotels.com search failed (%s)", exc)
            return []

    # ------------------------------------------------------------------
    # Core pipeline — itinerary builder
    # ------------------------------------------------------------------

    async def _build_itinerary(self, query: str, ctx: Dict) -> Dict:
        """Build a multi-leg itinerary by combining flight + hotel searches."""
        destination = ctx.get("destination", "")
        origin      = ctx.get("origin", "")

        await self._log(f"Building itinerary for: {destination or query}")

        # Run flight and hotel searches in sequence (same page, reuse tab).
        flight_ctx = dict(ctx, task_type="search_flights", action="search_flights")
        flight_result = await self._search_flights(query, flight_ctx)

        if await self._cancelled():
            return self._empty_result("cancelled", "build_itinerary")

        hotel_ctx = dict(ctx, task_type="search_hotels", action="search_hotels")
        hotel_result  = await self._search_hotels(
            f"hotels in {destination}" if destination else query,
            hotel_ctx,
        )

        flight_best = flight_result.get("best_option", {})
        hotel_best  = hotel_result.get("best_option", {})
        flight_cost = flight_result.get("total_cost", 0.0)
        hotel_cost  = hotel_result.get("total_cost", 0.0)
        total_cost  = flight_cost + hotel_cost

        itinerary_item = {
            "type":          "itinerary",
            "destination":   destination or query,
            "origin":        origin,
            "flight":        flight_best,
            "hotel":         hotel_best,
            "total_cost":    total_cost,
            "currency":      "USD",
            "depart_date":   ctx.get("depart_date") or ctx.get("check_in", ""),
            "return_date":   ctx.get("return_date") or ctx.get("check_out", ""),
        }

        all_items = [itinerary_item]
        await self._emit_result("travel_itinerary", all_items)

        summary = (
            f"Itinerary for {destination or '?'}: "
            f"Flight — {flight_best.get('airline', 'N/A')} at {flight_best.get('price', 'N/A')}; "
            f"Hotel — {hotel_best.get('name', 'N/A')} at {hotel_best.get('price', 'N/A')}. "
            f"Estimated total: ${total_cost:.2f}."
        )
        await self._log(summary, level="success")

        # Approval gate for booking the full itinerary.
        if ctx.get("confirm") or ctx.get("task_type", "") == "book_itinerary":
            approved = await self._gate(
                f"Proceed to book full itinerary to {destination}? "
                f"Estimated cost: ${total_cost:.2f}",
                {
                    "action":      "book_itinerary",
                    "destination": destination,
                    "price":       f"${total_cost:.2f}",
                    "date":        ctx.get("depart_date", ""),
                },
            )
            if not approved:
                await self._log("User declined itinerary booking.", level="warn")
                return self._build_result(
                    "build_itinerary", all_items, itinerary_item, total_cost, "partial", summary
                )

        return self._build_result(
            "build_itinerary", all_items, itinerary_item, total_cost, "success", summary
        )

    # ------------------------------------------------------------------
    # Overlay / cookie wall dismissal (self-healing)
    # ------------------------------------------------------------------

    async def _dismiss_overlays(self) -> None:
        """Best-effort click on consent / cookie / sign-in overlay buttons."""
        labels = [
            "Accept all", "Accept All", "I agree", "Agree", "Accept",
            "Reject all", "Dismiss", "No thanks", "Continue",
            "Close", "Got it",
        ]
        for label in labels:
            try:
                btn = self._page.get_by_role("button", name=label)
                if await btn.count() > 0:
                    await btn.first.click(timeout=2000)
                    await asyncio.sleep(0.4)
                    return
            except Exception:
                continue

        # Also try aria-label close buttons (modals / overlays).
        for sel in ['[aria-label="Close"]', '[aria-label="close"]', 'button[data-testid="close"]']:
            try:
                el = await self._page.query_selector(sel)
                if el and await el.is_visible():
                    await el.click(timeout=1500)
                    await asyncio.sleep(0.3)
                    return
            except Exception:
                continue

    # ------------------------------------------------------------------
    # Generic fallback extractors (self-healing)
    # ------------------------------------------------------------------

    async def _extract_generic_price_items(self, kind: str = "flight") -> List[Dict]:
        """Last-resort extraction: pull any price + label from the visible page."""
        try:
            return await self._page.evaluate(r"""
            (() => {
              const out = [];
              const els = document.querySelectorAll('[aria-label*="$"], .price, [class*="price"]');
              for (const el of els) {
                const txt = (el.textContent || el.getAttribute('aria-label') || '').trim();
                if (txt && txt.length < 80) {
                  out.push({ price: txt, airline: '', duration: '', stops: '', depart: '', arrive: '' });
                }
                if (out.length >= 8) break;
              }
              return out;
            })()
            """)
        except Exception:
            return []

    async def _extract_generic_hotel_items(self) -> List[Dict]:
        """Last-resort extraction for hotel pages."""
        try:
            return await self._page.evaluate(r"""
            (() => {
              const out = [];
              const cards = document.querySelectorAll('article, [class*="hotel"], [class*="property"]');
              for (const card of cards) {
                const name  = card.querySelector('h2, h3')?.textContent?.trim() || '';
                const price = card.querySelector('[class*="price"]')?.textContent?.trim() || '';
                if (name) {
                  out.push({ name, price, rating: '', location: '', url: '' });
                }
                if (out.length >= 8) break;
              }
              return out;
            })()
            """)
        except Exception:
            return []

    # ------------------------------------------------------------------
    # Selection helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _pick_best_flight(results: List[Dict]) -> Dict:
        """Return the cheapest flight by parsed price; fall back to first."""
        if not results:
            return {}
        priced = [
            (r, _parse_price(r.get("price", "")))
            for r in results
            if _parse_price(r.get("price", "")) > 0
        ]
        if priced:
            return min(priced, key=lambda t: t[1])[0]
        return results[0]

    @staticmethod
    def _pick_best_hotel(results: List[Dict]) -> Dict:
        """Return the cheapest hotel by parsed price; fall back to first."""
        if not results:
            return {}
        priced = [
            (r, _parse_price(r.get("price", "")))
            for r in results
            if _parse_price(r.get("price", "")) > 0
        ]
        if priced:
            return min(priced, key=lambda t: t[1])[0]
        return results[0]

    # ------------------------------------------------------------------
    # Result builder
    # ------------------------------------------------------------------

    @staticmethod
    def _build_result(
        action: str,
        results: List[Dict],
        best_option: Dict,
        total_cost: float,
        status: str,
        summary: str = "",
    ) -> Dict:
        n = len(results)
        return {
            "action":      action,
            "results":     results,
            "best_option": best_option,
            "total_cost":  total_cost,
            "status":      status,
            "items":       results,
            "total":       n,
            "step_results": [
                {"stepIndex": i, "success": True, "durationMs": 0}
                for i in range(n)
            ] or [{"stepIndex": 0, "success": status == "success", "durationMs": 0}],
            "summary": summary,
        }

    # ------------------------------------------------------------------
    # Progress / logging helpers
    # ------------------------------------------------------------------

    async def _log(self, message: str, level: str = "info") -> None:
        """Emit a log line to the dashboard (bridge) or Python logging."""
        if self.bridge is not None:
            try:
                await self.bridge.log(message, level)
            except Exception:
                pass
        getattr(
            log,
            level if level in ("debug", "info", "warning", "error") else "info",
        )(message)

    async def _emit_result(self, kind: str, items: List[Dict]) -> None:
        """Emit structured results to the dashboard."""
        if self.bridge is not None:
            try:
                await self.bridge.emit_result(kind, items)
            except Exception:
                pass

    async def _cancelled(self) -> bool:
        """Check if a stop signal has been sent from the dashboard."""
        if self.bridge is not None and hasattr(self.bridge, "cancelled"):
            try:
                return bool(await self.bridge.cancelled())
            except Exception:
                pass
        return False

    async def _gate(self, description: str, step_data: Dict) -> bool:
        """Request approval before any payment/booking action.

        Returns True if approved (or bridge lacks a gate), False if denied.
        Auto-approved when TRAVEL_AUTO_APPROVE=true.
        """
        if os.environ.get("TRAVEL_AUTO_APPROVE", "").strip().lower() in ("1", "true", "yes", "on"):
            await self._log("Auto-approved travel gate (TRAVEL_AUTO_APPROVE=true)", level="warn")
            return True

        if self.bridge is not None and hasattr(self.bridge, "gate"):
            try:
                return bool(await self.bridge.gate(description, step_data))
            except Exception:
                pass
        # No gate available — default allow (standalone / no-gate mode).
        return True

    # ------------------------------------------------------------------
    # Static helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _empty_result(reason: str, action: str = "search_flights") -> Dict:
        return {
            "action":      action,
            "results":     [],
            "best_option": {},
            "total_cost":  0.0,
            "status":      "failed",
            "items":       [],
            "total":       0,
            "step_results": [{"stepIndex": 0, "success": False, "durationMs": 0}],
            "summary":     f"Travel search could not complete: {reason}",
        }


# ---------------------------------------------------------------------------
# Thin bridge shims
# ---------------------------------------------------------------------------

class _PublisherBridge:
    """Adapts an EventPublisher + session_id pair to the bridge interface.

    Mirrors _PublisherBridge in research_agent.py — same structure, different
    source label.
    """

    def __init__(self, publisher, session_id: str):
        self._pub = publisher
        self._sid = session_id

    async def log(self, message: str, level: str = "info") -> None:
        try:
            await self._pub.publish(
                self._sid,
                "execution:event",
                {"type": f"log:{level}", "data": {"source": "TravelAgent", "message": message}},
            )
        except Exception:
            pass

    async def emit_result(self, kind: str, items: list) -> None:
        try:
            await self._pub.publish(
                self._sid,
                "agent:result",
                {"sessionId": self._sid, "kind": kind, "count": len(items), "items": items},
            )
        except Exception:
            pass

    async def cancelled(self) -> bool:
        return False

    async def gate(self, description: str, step_data: dict) -> bool:
        """No interactive gate in shim mode — allow by default."""
        return True


# ---------------------------------------------------------------------------
# Utility functions
# ---------------------------------------------------------------------------

def _parse_price(text: str) -> float:
    """Extract the first numeric value (possibly decimal) from a price string."""
    if not text:
        return 0.0
    match = re.search(r"[\d,]+\.?\d*", text.replace(",", ""))
    if match:
        try:
            return float(match.group().replace(",", ""))
        except ValueError:
            pass
    return 0.0


# ---------------------------------------------------------------------------
# Standalone CLI entry point
# ---------------------------------------------------------------------------

async def _main() -> int:
    query = " ".join(sys.argv[1:]).strip() if len(sys.argv) > 1 else ""
    if not query:
        query = os.environ.get("TRAVEL_QUERY", "")
    if not query:
        print("Usage: python travel_agent.py <your travel query>")
        print("   or: TRAVEL_QUERY='flights from NYC to London' python travel_agent.py")
        return 1

    # Determine action from keywords in the query.
    q_lower = query.lower()
    if "hotel" in q_lower or "stay" in q_lower or "accommodation" in q_lower:
        action = "search_hotels"
    elif "itinerary" in q_lower or "trip" in q_lower or "plan" in q_lower:
        action = "build_itinerary"
    else:
        action = "search_flights"

    agent = TravelAgent()
    result = await agent.run(query=query, action=action)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0 if result.get("status") in ("success", "partial") else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(_main()))
