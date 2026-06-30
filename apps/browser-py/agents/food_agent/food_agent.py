"""
Food Agent
Autonomous browser agent for restaurant discovery, menu reading,
table reservations, and food delivery ordering.

Supports:
  - Restaurant discovery (Yelp, Google Maps, Google Search)
  - Menu reading (navigates to a restaurant page and extracts menu items)
  - Table reservation (OpenTable, Resy) — ALWAYS gated by approval panel
  - Food delivery ordering (DoorDash, Uber Eats) — ALWAYS gated by approval panel

Usage (standalone CLI):
    FOOD_GOAL="pizza near downtown" python food_agent.py

Usage (as an OmniTask skill — injected by skills/food.py):
    agent = FoodAgent(bridge=bridge, page=page)
    result = await agent.execute(task_context)

The `bridge` parameter is None in standalone mode (no live dashboard, no
approval gate). When injected by the skill dispatcher it exposes the same
interface used by BookingAgent / FinanceAgent for streaming events and gating
every order/reservation through the approval panel.

All consequential actions (placing an order, confirming a reservation) are
ALWAYS gated through bridge.gate() before any click is made.
FOOD_AUTO_APPROVE=true skips the gate (autonomous mode, off by default).
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import quote_plus

log = logging.getLogger("browser-py.food_agent")


# ---------------------------------------------------------------------------
# Portal catalogue
# ---------------------------------------------------------------------------

FOOD_PORTALS: Dict[str, str] = {
    # Discovery / reviews
    "yelp":         "https://www.yelp.com/",
    "google_maps":  "https://www.google.com/maps/",
    # Reservations
    "opentable":    "https://www.opentable.com/",
    "resy":         "https://resy.com/",
    # Delivery
    "doordash":     "https://www.doordash.com/",
    "ubereats":     "https://www.ubereats.com/",
    "grubhub":      "https://www.grubhub.com/",
}

# Task-type / action labels used consistently in result dicts.
TASK_ACTION_MAP: Dict[str, str] = {
    "find_restaurant":      "find_restaurant",
    "discover":             "find_restaurant",
    "search_restaurant":    "find_restaurant",
    "read_menu":            "read_menu",
    "menu":                 "read_menu",
    "reserve_table":        "reserve_table",
    "reservation":          "reserve_table",
    "restaurant_booking":   "reserve_table",
    "book_restaurant":      "reserve_table",
    "order_delivery":       "order_delivery",
    "food_order":           "order_delivery",
    "order":                "order_delivery",
    "delivery":             "order_delivery",
}

# Selectors tried in order to find a "Place Order / Confirm / Reserve" button.
CONFIRM_SELECTORS: List[str] = [
    "button[data-testid*='place-order']",
    "button[data-testid*='checkout']",
    "button[data-testid*='confirm']",
    "button[data-testid*='reserve']",
    "[class*='place-order'][role='button']",
    "[class*='checkout'][role='button']",
    "button:has-text('Place Order')",
    "button:has-text('Checkout')",
    "button:has-text('Confirm')",
    "button:has-text('Reserve')",
    "button:has-text('Complete Reservation')",
    "button:has-text('Complete Order')",
    "input[type='submit'][value*='Order']",
    "input[type='submit'][value*='Reserve']",
]

# Selector chains for restaurant cards (Yelp / Google / generic).
RESTAURANT_CARD_SELECTORS: List[str] = [
    "[data-testid*='bizListingCard']",           # Yelp business card
    "[class*='businessName']",                   # Yelp name element
    "div.biz-listing-large",                     # Yelp legacy
    "[data-result-type='organic']",              # Google Local
    ".section-result",                           # Google Maps
    "[data-testid*='restaurant']",               # generic portals
    "[class*='restaurant-card']",
    "[class*='result-card']",
    "article",
    "li[class*='item']",
]

# Price / rating regexes.
_PRICE_RE = re.compile(r"\$[\d,.]+", re.IGNORECASE)
_RATING_RE = re.compile(r"\b([1-5](\.\d)?)\s*(stars?|/5|out of 5)?\b", re.IGNORECASE)


class FoodAgent:
    """Autonomous browser agent for food discovery, reservations and delivery.

    Constructor mirrors BookingAgent so the skill wrapper can treat both agents
    uniformly.

    Args:
        bridge: OmniTask event bridge (None = standalone CLI mode).
                Must expose:
                  await bridge.log(msg, level='info')
                  await bridge.gate(description, step_data) -> bool
                  await bridge.emit_result(kind, items)
                  await bridge.cancelled() -> bool
                  bridge.ai  — AIClient (may be None)
        page:   Playwright Page injected by the skill (None = standalone).
        config: Optional dict with portal / preference hints.
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
        self.logger = logging.getLogger("FoodAgent")

        self._results: List[Dict] = []
        self._start_time: Optional[datetime] = None
        self._end_time: Optional[datetime] = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def execute(self, task_context: Dict) -> Dict:
        """Entry point called by skills/food.py (and directly in CLI mode).

        Args:
            task_context: dict with keys:
                goal          — natural-language goal string
                task_type     — backend taskType string (e.g. 'order_delivery')
                action        — explicit action override
                portal        — optional portal name hint (e.g. 'doordash')
                query         — search query / dish name
                location      — city, address, or neighbourhood
                date          — ISO date for reservations (e.g. '2026-07-04')
                time          — time string for reservations (e.g. '7:30 PM')
                party_size    — int, number of diners for reservations
                restaurant    — explicit restaurant name for menu/reservation
                config        — optional per-run overrides

        Returns:
            {
                "action":      "find_restaurant"|"read_menu"|"reserve_table"|"order_delivery",
                "restaurant":  {...},   # structured restaurant details
                "reservation": {...},   # populated for reserve_table action
                "order":       {...},   # populated for order_delivery action
                "status":      "success"|"partial"|"failed",
                "items":       [...],   # list consumed by Skill.ok()
            }
        """
        self._start_time = datetime.now()

        goal       = task_context.get("goal", "")
        task_type  = task_context.get("task_type", "") or task_context.get("action", "")
        portal_key = (task_context.get("portal") or "").lower()
        query      = task_context.get("query") or goal

        action      = self._resolve_action(task_type, goal)
        portal_name, portal_url = self._resolve_portal(portal_key, goal, action)

        await self._log(
            f"Starting food task: action={action}, portal={portal_name or 'web'}",
            level="info",
        )

        if await self._cancelled():
            return self._result("cancelled", action, [], status="partial")

        try:
            if action == "find_restaurant":
                items = await self._find_restaurant(
                    portal_name, portal_url, query, task_context
                )

            elif action == "read_menu":
                items = await self._read_menu(
                    portal_name, portal_url, query, task_context
                )

            elif action == "reserve_table":
                items = await self._reserve_table(
                    portal_name, portal_url, query, task_context
                )

            elif action == "order_delivery":
                items = await self._order_delivery(
                    portal_name, portal_url, query, task_context
                )

            else:
                # Default: discover restaurants without booking.
                items = await self._find_restaurant(
                    portal_name, portal_url, query, task_context
                )

        except Exception as exc:  # noqa: BLE001
            self.logger.error("FoodAgent error: %s", exc, exc_info=True)
            await self._log(f"Food task failed: {exc}", level="error")
            return self._result("error", action, [], status="failed")

        finally:
            self._end_time = datetime.now()

        await self._log(
            f"Food task complete — {len(items)} item(s) returned.",
            level="success",
        )
        return self._result("done", action, items, status="success")

    # ------------------------------------------------------------------
    # Action implementations
    # ------------------------------------------------------------------

    async def _find_restaurant(
        self,
        portal_name: Optional[str],
        portal_url: Optional[str],
        query: str,
        task_context: Dict,
    ) -> List[Dict]:
        """Discover restaurants via Yelp, Google Maps, or web search."""
        location = task_context.get("location", "")

        await self._log(
            f"Discovering restaurants: {query!r} in {location!r or 'current area'}",
            level="info",
        )

        restaurants: List[Dict] = []

        # 1. Try the requested portal first (Yelp / Google Maps).
        if portal_url and self.page:
            restaurants = await self._scrape_restaurant_listings(
                portal_url, portal_name, query, location
            )

        # 2. Fall back to Yelp search if the portal returned nothing.
        if not restaurants and self.page:
            restaurants = await self._scrape_yelp(query, location)

        # 3. Google web search as last resort.
        if not restaurants:
            restaurants = await self._google_search_restaurants(query, location)

        if not restaurants:
            item = self._no_results_item("find_restaurant", query, portal_name,
                                         note="No restaurants found. Try a different location or cuisine.")
            await self._emit("food_restaurants", [item])
            return [item]

        await self._log(f"Found {len(restaurants)} restaurant(s).", level="success")

        # Optional AI enrichment.
        for r in restaurants[:5]:
            if r.get("snippet") and not r.get("summary"):
                r["summary"] = await self._ai_summarise(
                    r["snippet"],
                    f"Summarise this restaurant for: '{query}'. One sentence, include cuisine and standout dish if known.",
                )

        await self._emit("food_restaurants", restaurants)
        return restaurants

    async def _read_menu(
        self,
        portal_name: Optional[str],
        portal_url: Optional[str],
        query: str,
        task_context: Dict,
    ) -> List[Dict]:
        """Navigate to a restaurant page and extract the menu."""
        restaurant_name = task_context.get("restaurant") or query
        location        = task_context.get("location", "")

        await self._log(
            f"Reading menu for: {restaurant_name!r}",
            level="info",
        )

        if not self.page:
            item = self._no_results_item("read_menu", query, portal_name,
                                         note="No page available in standalone mode.")
            return [item]

        # First find the restaurant URL.
        candidates = await self._google_search_restaurants(
            f"{restaurant_name} menu", location
        )
        target_url = (candidates[0].get("url") if candidates else None) or portal_url

        menu_items: List[Dict] = []
        if target_url:
            try:
                await self.page.goto(target_url, wait_until="domcontentloaded", timeout=30_000)
                await asyncio.sleep(2)
                await self._log(f"Loaded restaurant page: {target_url}", level="info")
                menu_items = await self._extract_menu_items()
            except Exception as exc:  # noqa: BLE001 — self-heal
                await self._log(f"Menu page load failed ({exc}) — using web fallback.", level="warn")

        if not menu_items:
            # Fallback: extract text from the page body / Google snippet.
            menu_items = await self._extract_menu_from_text(
                candidates[0].get("snippet", "") if candidates else ""
            )

        result = {
            "action":      "read_menu",
            "restaurant":  restaurant_name,
            "portal":      portal_name or "web",
            "url":         target_url or "",
            "menu_items":  menu_items,
            "count":       len(menu_items),
            "timestamp":   datetime.now().isoformat(),
        }
        await self._emit("food_menu", [result])
        return [result]

    async def _reserve_table(
        self,
        portal_name: Optional[str],
        portal_url: Optional[str],
        query: str,
        task_context: Dict,
    ) -> List[Dict]:
        """Search for table availability and gate the reservation through approval."""
        date       = task_context.get("date", "")
        time_pref  = task_context.get("time", "")
        party_size = task_context.get("party_size") or 2
        location   = task_context.get("location", "")
        restaurant = task_context.get("restaurant") or query

        await self._log(
            f"Searching table availability: {restaurant!r} for {party_size} on {date} {time_pref}",
            level="info",
        )

        slots: List[Dict] = []
        if portal_url and self.page:
            slots = await self._scrape_reservation_slots(
                portal_url, portal_name, restaurant, date, time_pref, party_size, location
            )
        if not slots:
            slots = await self._google_search_slots(restaurant, location, date, time_pref)

        if not slots:
            item = self._no_results_item(
                "reserve_table", query, portal_name,
                note="No available slots found. Try a different date, time, or party size.",
            )
            await self._emit("food_reservation", [item])
            return [item]

        await self._log(
            f"Found {len(slots)} slot(s). Requesting approval to confirm reservation.",
            level="info",
        )

        best = slots[0]
        candidate = {
            "action":      "reserve_table",
            "portal":      portal_name or "opentable",
            "restaurant":  best.get("name") or restaurant,
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
                f"Reserve table: {candidate['restaurant']} "
                f"on {candidate['date']} at {candidate['time']} "
                f"for {party_size} guest(s)"
            ),
            step_data=candidate,
        )

        if not approved:
            await self._log("Reservation denied or timed out — skipping.", level="warn")
            candidate["status"] = "DENIED"
            await self._emit("food_reservation", [candidate])
            return [candidate]

        await self._log("Reservation approved — navigating to confirmation page.", level="info")
        candidate = await self._navigate_and_surface_confirm(candidate, portal_url)
        await self._emit("food_reservation", [candidate])
        return [candidate]

    async def _order_delivery(
        self,
        portal_name: Optional[str],
        portal_url: Optional[str],
        query: str,
        task_context: Dict,
    ) -> List[Dict]:
        """Find a dish on a delivery platform and gate the order through approval."""
        location   = task_context.get("location", "")
        restaurant = task_context.get("restaurant") or ""
        dish       = task_context.get("query") or query

        await self._log(
            f"Searching delivery options: {dish!r}"
            + (f" from {restaurant!r}" if restaurant else "")
            + (f" in {location!r}" if location else ""),
            level="info",
        )

        listings: List[Dict] = []

        # 1. Try portal-specific search (DoorDash / Uber Eats / Grubhub).
        if portal_url and self.page:
            listings = await self._scrape_delivery_listings(
                portal_url, portal_name, dish, restaurant, location
            )

        # 2. DoorDash as default delivery portal if none specified.
        if not listings and self.page and portal_name not in ("doordash",):
            listings = await self._scrape_delivery_listings(
                FOOD_PORTALS["doordash"], "doordash", dish, restaurant, location
            )

        # 3. Google fallback.
        if not listings:
            listings = await self._google_search_delivery(dish, restaurant, location)

        if not listings:
            item = self._no_results_item(
                "order_delivery", query, portal_name,
                note="No delivery options found. Try a different item or location.",
            )
            await self._emit("food_delivery", [item])
            return [item]

        await self._log(
            f"Found {len(listings)} delivery option(s). Requesting order approval.",
            level="info",
        )

        best = listings[0]
        candidate = {
            "action":      "order_delivery",
            "portal":      portal_name or "doordash",
            "dish":        dish,
            "restaurant":  best.get("name") or restaurant or dish,
            "price":       best.get("price", ""),
            "location":    location,
            "url":         best.get("url", portal_url or ""),
            "listings":    listings,
            "timestamp":   datetime.now().isoformat(),
            "status":      "PENDING_APPROVAL",
        }

        approved = await self._gate(
            description=(
                f"Order delivery: {dish}"
                + (f" from {candidate['restaurant']}" if candidate["restaurant"] else "")
                + (f" — {candidate['price']}" if candidate["price"] else "")
                + f" via {candidate['portal']}"
            ),
            step_data=candidate,
        )

        if not approved:
            await self._log("Delivery order denied or timed out — skipping.", level="warn")
            candidate["status"] = "DENIED"
            await self._emit("food_delivery", [candidate])
            return [candidate]

        await self._log("Order approved — navigating to checkout.", level="info")
        candidate = await self._navigate_and_surface_confirm(candidate, portal_url)
        candidate["order"] = {
            "dish":       dish,
            "restaurant": candidate["restaurant"],
            "price":      candidate["price"],
            "portal":     candidate["portal"],
        }
        await self._emit("food_delivery", [candidate])
        return [candidate]

    # ------------------------------------------------------------------
    # Playwright scraping helpers (self-healing selector fallbacks)
    # ------------------------------------------------------------------

    async def _scrape_restaurant_listings(
        self,
        portal_url: str,
        portal_name: Optional[str],
        query: str,
        location: str,
    ) -> List[Dict]:
        """Navigate to a discovery portal and extract restaurant cards."""
        if not self.page:
            return []
        try:
            search_url = self._build_discovery_url(portal_url, portal_name, query, location)
            await self.page.goto(search_url, wait_until="domcontentloaded", timeout=30_000)
            await asyncio.sleep(2)
            await self._log(f"Loaded {portal_name} restaurant search", level="info")
            return await self._extract_restaurant_cards(portal_name)
        except Exception as exc:  # noqa: BLE001 — self-heal
            await self._log(f"Portal scrape failed ({exc}) — will use web fallback", level="warn")
            return []

    async def _scrape_yelp(self, query: str, location: str) -> List[Dict]:
        """Direct Yelp search as a tier-2 fallback."""
        if not self.page:
            return []
        try:
            q = quote_plus(query)
            loc = quote_plus(location or "")
            url = f"https://www.yelp.com/search?find_desc={q}&find_loc={loc}"
            await self.page.goto(url, wait_until="domcontentloaded", timeout=30_000)
            await asyncio.sleep(2)
            return await self._extract_restaurant_cards("yelp")
        except Exception as exc:  # noqa: BLE001 — self-heal
            await self._log(f"Yelp fallback failed ({exc})", level="warn")
            return []

    async def _scrape_delivery_listings(
        self,
        portal_url: str,
        portal_name: Optional[str],
        dish: str,
        restaurant: str,
        location: str,
    ) -> List[Dict]:
        """Navigate to a delivery portal and extract restaurant/dish listings."""
        if not self.page:
            return []
        try:
            search_url = self._build_delivery_url(portal_url, portal_name, dish, restaurant, location)
            await self.page.goto(search_url, wait_until="domcontentloaded", timeout=30_000)
            await asyncio.sleep(2)
            await self._log(f"Loaded {portal_name} delivery search", level="info")
            return await self._extract_delivery_cards(portal_name)
        except Exception as exc:  # noqa: BLE001 — self-heal
            await self._log(f"Delivery portal scrape failed ({exc})", level="warn")
            return []

    async def _scrape_reservation_slots(
        self,
        portal_url: str,
        portal_name: Optional[str],
        restaurant: str,
        date: str,
        time_pref: str,
        party_size: int,
        location: str,
    ) -> List[Dict]:
        """Navigate to a reservation portal and extract available time slots."""
        if not self.page:
            return []
        try:
            search_url = self._build_reservation_url(
                portal_url, portal_name, restaurant, date, time_pref, party_size, location
            )
            await self.page.goto(search_url, wait_until="domcontentloaded", timeout=30_000)
            await asyncio.sleep(2)
            await self._log(f"Loaded {portal_name} reservation search", level="info")
            return await self._extract_slot_listings(portal_name)
        except Exception as exc:  # noqa: BLE001 — self-heal
            await self._log(f"Reservation slot scrape failed ({exc})", level="warn")
            return []

    # ------------------------------------------------------------------
    # Card / content extractors (self-healing: cascades through selectors)
    # ------------------------------------------------------------------

    async def _extract_restaurant_cards(self, portal_name: Optional[str]) -> List[Dict]:
        """Extract restaurant card elements from the current page."""
        if not self.page:
            return []
        for sel in RESTAURANT_CARD_SELECTORS:
            try:
                cards = await self.page.query_selector_all(sel)
                if len(cards) >= 2:
                    results = []
                    for card in cards[:12]:
                        text = (await card.inner_text()).strip()
                        link_el = await card.query_selector("a[href]")
                        href = await link_el.get_attribute("href") if link_el else None
                        price_m = _PRICE_RE.search(text)
                        rating_m = _RATING_RE.search(text)
                        name_line = text.split("\n")[0][:120] if text else ""
                        if name_line:
                            results.append({
                                "name":    name_line,
                                "price":   price_m.group(0) if price_m else "",
                                "rating":  rating_m.group(1) if rating_m else "",
                                "snippet": text[:400],
                                "url":     href,
                                "portal":  portal_name or "web",
                            })
                    if results:
                        return results
            except Exception:
                continue

        # Last resort: evaluate JS to pull structured data from LD+JSON.
        return await self._extract_ldjson_restaurants()

    async def _extract_ldjson_restaurants(self) -> List[Dict]:
        """Pull any Restaurant schema.org LD+JSON blobs from the page."""
        if not self.page:
            return []
        try:
            raw = await self.page.evaluate(
                r"""
                () => {
                  const out = [];
                  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
                    try {
                      const d = JSON.parse(s.textContent);
                      const arr = Array.isArray(d) ? d : [d];
                      for (const item of arr) {
                        if (item['@type'] === 'Restaurant' || item['@type'] === 'FoodEstablishment') {
                          out.push({
                            name:    item.name || '',
                            address: typeof item.address === 'string'
                                       ? item.address
                                       : (item.address?.streetAddress || ''),
                            rating:  item.aggregateRating?.ratingValue || '',
                            url:     item.url || '',
                          });
                        }
                      }
                    } catch (_) {}
                  }
                  return out.slice(0, 10);
                }
                """
            )
            return [r for r in (raw or []) if r.get("name")]
        except Exception:
            return []

    async def _extract_delivery_cards(self, portal_name: Optional[str]) -> List[Dict]:
        """Extract delivery listing cards from the current page."""
        if not self.page:
            return []
        delivery_selectors = [
            "[data-testid*='store-card']",
            "[data-testid*='restaurant']",
            "[class*='StoreCard']",
            "[class*='restaurant-card']",
            "[class*='store']",
            "article",
            "li[class*='item']",
        ]
        for sel in delivery_selectors:
            try:
                cards = await self.page.query_selector_all(sel)
                if len(cards) >= 2:
                    results = []
                    for card in cards[:12]:
                        text = (await card.inner_text()).strip()
                        link_el = await card.query_selector("a[href]")
                        href = await link_el.get_attribute("href") if link_el else None
                        price_m = _PRICE_RE.search(text)
                        rating_m = _RATING_RE.search(text)
                        name_line = text.split("\n")[0][:120] if text else ""
                        if name_line:
                            results.append({
                                "name":   name_line,
                                "price":  price_m.group(0) if price_m else "",
                                "rating": rating_m.group(1) if rating_m else "",
                                "url":    href,
                                "portal": portal_name or "web",
                            })
                    if results:
                        return results
            except Exception:
                continue
        return []

    async def _extract_slot_listings(self, portal_name: Optional[str]) -> List[Dict]:
        """Extract time-slot buttons from a reservation page."""
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

        # Fallback: regex-scan visible page text for time strings.
        return await self._extract_times_from_text(portal_name)

    async def _extract_times_from_text(self, portal_name: Optional[str]) -> List[Dict]:
        """Last-resort time extraction via regex on the full page text."""
        if not self.page:
            return []
        try:
            text = await self.page.evaluate("() => document.body.innerText || ''")
            time_re = re.compile(r"\b\d{1,2}:\d{2}\s?(?:AM|PM|am|pm)\b")
            times = list(dict.fromkeys(time_re.findall(text or "")))
            return [{"time": t, "portal": portal_name or "web"} for t in times[:20]]
        except Exception:
            return []

    async def _extract_menu_items(self) -> List[Dict]:
        """Extract menu items from the current restaurant page."""
        if not self.page:
            return []
        menu_selectors = [
            "[data-testid*='menu-item']",
            "[class*='menu-item']",
            "[class*='MenuItem']",
            "[class*='dish']",
            ".menu-section li",
            "ul[class*='menu'] li",
            "section[class*='menu'] article",
        ]
        for sel in menu_selectors:
            try:
                items_els = await self.page.query_selector_all(sel)
                if items_els:
                    items = []
                    for el in items_els[:30]:
                        text = (await el.inner_text()).strip()
                        price_m = _PRICE_RE.search(text)
                        name_line = text.split("\n")[0][:120] if text else ""
                        desc_lines = [l.strip() for l in text.split("\n")[1:] if l.strip()]
                        if name_line:
                            items.append({
                                "name":        name_line,
                                "description": " ".join(desc_lines)[:300],
                                "price":       price_m.group(0) if price_m else "",
                            })
                    if items:
                        return items
            except Exception:
                continue

        # Fallback: pull LD+JSON menu data.
        return await self._extract_ldjson_menu()

    async def _extract_ldjson_menu(self) -> List[Dict]:
        """Pull menu items from schema.org LD+JSON on the page."""
        if not self.page:
            return []
        try:
            raw = await self.page.evaluate(
                r"""
                () => {
                  const out = [];
                  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
                    try {
                      const d = JSON.parse(s.textContent);
                      const arr = Array.isArray(d) ? d : [d];
                      for (const item of arr) {
                        const sections = item.hasMenuSection || item.menu?.hasMenuSection || [];
                        for (const sec of sections) {
                          for (const entry of sec.hasMenuItem || []) {
                            out.push({
                              name:        entry.name || '',
                              description: entry.description || '',
                              price:       entry.offers?.price
                                             ? '$' + entry.offers.price
                                             : '',
                            });
                          }
                        }
                      }
                    } catch (_) {}
                  }
                  return out.slice(0, 40);
                }
                """
            )
            return [r for r in (raw or []) if r.get("name")]
        except Exception:
            return []

    async def _extract_menu_from_text(self, text: str) -> List[Dict]:
        """Heuristic: parse price-adjacent lines as dish names from raw text."""
        items = []
        if not text:
            return items
        lines = [l.strip() for l in text.split("\n") if l.strip()]
        for line in lines:
            m = _PRICE_RE.search(line)
            if m:
                name = line[: m.start()].strip()[:100]
                if name:
                    items.append({"name": name, "price": m.group(0), "description": ""})
            if len(items) >= 20:
                break
        return items

    # ------------------------------------------------------------------
    # Navigation + confirm-surface helper (self-healing button finder)
    # ------------------------------------------------------------------

    async def _navigate_and_surface_confirm(
        self, candidate: Dict, portal_url: Optional[str]
    ) -> Dict:
        """Navigate to the booking/order URL and surface the confirm button.

        Does NOT click — the user acts on the live browser after approval.
        This ensures OmniTask never submits an order/reservation without
        explicit human confirmation at the UI level.
        """
        target_url = candidate.get("url") or portal_url
        if not target_url or not self.page:
            candidate["status"] = "PORTAL_OPENED"
            candidate["note"] = (
                "No target URL resolved. Complete the action manually in the browser."
            )
            return candidate

        try:
            await self.page.goto(target_url, wait_until="domcontentloaded", timeout=30_000)
            await asyncio.sleep(2)
            await self._log(f"Navigated to confirmation page: {target_url}", level="info")

            # Self-healing: scan for a confirm button so the user sees it.
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
                "Portal opened and form loaded. "
                + (
                    f"A '{confirm_btn}' button was detected. "
                    if confirm_btn
                    else "Locate the confirm/order button. "
                )
                + "Complete any remaining fields and click confirm on the live browser view. "
                "OmniTask does not click the final submit without your on-screen action."
            )
        except Exception as exc:  # noqa: BLE001 — self-heal
            await self._log(
                f"Navigation to confirmation page failed ({exc}). Complete manually.",
                level="warn",
            )
            candidate["status"] = "PORTAL_OPENED"
            candidate["error"]  = str(exc)
            candidate["note"] = (
                f"Could not navigate to {target_url}. "
                "Open the portal manually and complete the action."
            )
        return candidate

    # ------------------------------------------------------------------
    # Google search fallbacks
    # ------------------------------------------------------------------

    async def _google_search_restaurants(self, query: str, location: str) -> List[Dict]:
        q = f"{query} {location} restaurant".strip()
        return await self._google_search(q, kind="restaurant")

    async def _google_search_delivery(
        self, dish: str, restaurant: str, location: str
    ) -> List[Dict]:
        q = f"{dish} {restaurant} delivery {location}".strip()
        return await self._google_search(q, kind="delivery")

    async def _google_search_slots(
        self, restaurant: str, location: str, date: str, time_pref: str
    ) -> List[Dict]:
        q = f"{restaurant} {location} {date} {time_pref} reservation book table".strip()
        return await self._google_search(q, kind="slot")

    async def _google_search(self, query: str, kind: str = "listing") -> List[Dict]:
        """Perform a Google search and extract organic result cards."""
        if not self.page:
            return []
        try:
            url = f"https://www.google.com/search?q={quote_plus(query)}"
            await self.page.goto(url, wait_until="domcontentloaded", timeout=20_000)
            await asyncio.sleep(1)

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
            return [
                {
                    "name":    r.get("title", ""),
                    "url":     r.get("url", ""),
                    "snippet": r.get("snippet", ""),
                    "kind":    kind,
                }
                for r in (raw or [])
                if r.get("title")
            ]
        except Exception as exc:  # noqa: BLE001 — self-heal
            await self._log(f"Google search fallback failed ({exc})", level="warn")
            return []

    # ------------------------------------------------------------------
    # URL builders per portal family
    # ------------------------------------------------------------------

    def _build_discovery_url(
        self,
        portal_url: str,
        portal_name: Optional[str],
        query: str,
        location: str,
    ) -> str:
        q = quote_plus(query)
        loc = quote_plus(location)
        if portal_name == "yelp":
            return f"https://www.yelp.com/search?find_desc={q}&find_loc={loc}"
        if portal_name == "google_maps":
            return f"https://www.google.com/maps/search/{q}+restaurants+{loc}"
        return f"https://www.yelp.com/search?find_desc={q}&find_loc={loc}"

    def _build_delivery_url(
        self,
        portal_url: str,
        portal_name: Optional[str],
        dish: str,
        restaurant: str,
        location: str,
    ) -> str:
        q = quote_plus(f"{dish} {restaurant}".strip())
        if portal_name == "doordash":
            return f"https://www.doordash.com/search/store/{q}/"
        if portal_name == "ubereats":
            return f"https://www.ubereats.com/feed?diningMode=DELIVERY&pl={quote_plus(location)}"
        if portal_name == "grubhub":
            return f"https://www.grubhub.com/search?queryText={q}"
        return f"https://www.doordash.com/search/store/{q}/"

    def _build_reservation_url(
        self,
        portal_url: str,
        portal_name: Optional[str],
        restaurant: str,
        date: str,
        time_pref: str,
        party_size: int,
        location: str,
    ) -> str:
        q = quote_plus(f"{restaurant} {location}".strip())
        if portal_name == "opentable":
            covers = max(1, int(party_size or 2))
            d = quote_plus(date or "")
            t = quote_plus(time_pref or "19:00")
            return (
                f"https://www.opentable.com/s/?covers={covers}"
                + (f"&dateTime={d}T{t}" if d else "")
                + f"&metroName={quote_plus(location)}&term={quote_plus(restaurant)}"
            )
        if portal_name == "resy":
            d = quote_plus(date or "")
            return (
                f"https://resy.com/cities/{quote_plus(location)}?date={d}"
                f"&seats={party_size}&query={quote_plus(restaurant)}"
            )
        return f"https://www.yelp.com/search?find_desc={q}&find_loc={quote_plus(location)}"

    # ------------------------------------------------------------------
    # Resolution helpers
    # ------------------------------------------------------------------

    def _resolve_action(self, task_type: str, goal: str) -> str:
        key = (task_type or "").strip().lower()
        if key in TASK_ACTION_MAP:
            return TASK_ACTION_MAP[key]
        g = goal.lower()
        if any(w in g for w in ("order", "delivery", "deliver", "doordash", "ubereats", "grubhub")):
            return "order_delivery"
        if any(w in g for w in ("reserve", "reservation", "book", "table", "opentable", "resy")):
            return "reserve_table"
        if any(w in g for w in ("menu", "what does", "what's on")):
            return "read_menu"
        return "find_restaurant"

    def _resolve_portal(
        self, portal_key: str, goal: str, action: str
    ) -> tuple[Optional[str], Optional[str]]:
        if portal_key and portal_key in FOOD_PORTALS:
            return portal_key, FOOD_PORTALS[portal_key]
        g = goal.lower()
        for name, url in FOOD_PORTALS.items():
            if name.replace("_", "") in g.replace(" ", ""):
                return name, url
        defaults: Dict[str, tuple] = {
            "find_restaurant": ("yelp", FOOD_PORTALS["yelp"]),
            "read_menu":       ("yelp", FOOD_PORTALS["yelp"]),
            "reserve_table":   ("opentable", FOOD_PORTALS["opentable"]),
            "order_delivery":  ("doordash", FOOD_PORTALS["doordash"]),
        }
        pair = defaults.get(action, (None, None))
        return pair[0], pair[1]

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
        """Request user approval before any destructive action.

        Returns True (proceed) when:
          - running standalone (no bridge) — auto-approved in CLI mode
          - FOOD_AUTO_APPROVE env var is set
          - bridge.gate() returns True
        """
        auto = os.environ.get("FOOD_AUTO_APPROVE", "").strip().lower() in (
            "1", "true", "yes"
        )
        if auto:
            await self._log("Auto-approved (FOOD_AUTO_APPROVE=true)", level="warn")
            return True
        if self.bridge is None:
            await self._log("Standalone mode — auto-approving food gate", level="warn")
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
        first = items[0] if items else {}
        return {
            "action":      action,
            "phase":       phase,
            "status":      status,
            "restaurant":  first,
            "reservation": first if action == "reserve_table" else {},
            "order":       first.get("order", {}) if action == "order_delivery" else {},
            "data":        {"items": items, "count": len(items)},
            "items":       items,
        }


# ---------------------------------------------------------------------------
# Standalone CLI entry point (mirrors booking_agent pattern)
# ---------------------------------------------------------------------------

async def _cli_main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [food_agent] %(levelname)s %(message)s",
    )
    logger = logging.getLogger("Main")
    logger.info("=" * 60)
    logger.info("FOOD AGENT — standalone mode")
    logger.info("=" * 60)

    task_context = {
        "goal":        os.environ.get("FOOD_GOAL", "find a good Italian restaurant"),
        "task_type":   os.environ.get("FOOD_TASK_TYPE", "find_restaurant"),
        "portal":      os.environ.get("FOOD_PORTAL", ""),
        "query":       os.environ.get("FOOD_QUERY", ""),
        "location":    os.environ.get("FOOD_LOCATION", ""),
        "restaurant":  os.environ.get("FOOD_RESTAURANT", ""),
        "date":        os.environ.get("FOOD_DATE", ""),
        "time":        os.environ.get("FOOD_TIME", ""),
        "party_size":  int(os.environ.get("FOOD_PARTY_SIZE", "2")),
    }

    agent = FoodAgent()
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
    import asyncio as _asyncio
    _asyncio.run(_cli_main())
