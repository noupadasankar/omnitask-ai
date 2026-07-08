"""Travel domain, ported from apps/backend/src/travel/ (travel.service.ts +
flight-search / hotel-search / itinerary-builder + dto/travel.dto.ts). Same 5
endpoints and request/response shapes, so the frontend's services/travel.service.ts
(reverse-proxied through the Node backend at /api/travel) needs no changes.

Flight/hotel search return the same hardcoded demo listings as the Node stubs
(the original 1000ms artificial delay is dropped — a no-value demo artifact).
Each search/itinerary call also records a TravelBooking row (the Node side did
the same) and then returns the results, not the booking. Itinerary generation
uses the shared LLM client (ai.py) with the identical deterministic fallback.
"""

import base64
from datetime import datetime
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, field_validator

from ai import AIClient
from db.session_db import create_travel_booking, list_travel_bookings
from http_api.auth import AuthedUser, require_user

router = APIRouter(prefix="/travel", dependencies=[Depends(require_user)])


# ── Request models ───────────────────────────────────────────────────────────

def _parse_date(value: str) -> datetime:
    """Parse a request date string the way the Node DTO's Date.parse() check did
    (lenient for the common ISO forms). Raises ValueError on anything unparseable
    so the Pydantic validator surfaces a 422 — the same rejection the Zod
    `.refine(!isNaN(Date.parse()))` produced (as a 400) on the Node side."""
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        pass
    try:
        return datetime.strptime(value, "%Y-%m-%d")
    except ValueError as exc:
        raise ValueError("Invalid date format") from exc


class FlightSearchBody(BaseModel):
    origin: str = Field(min_length=1, max_length=100)
    destination: str = Field(min_length=1, max_length=100)
    date: str = Field(min_length=1)
    budget: Optional[float] = Field(default=None, gt=0)

    @field_validator("date")
    @classmethod
    def _valid_date(cls, v: str) -> str:
        _parse_date(v)
        return v


class HotelSearchBody(BaseModel):
    destination: str = Field(min_length=1, max_length=100)
    checkIn: str = Field(min_length=1)
    checkOut: str = Field(min_length=1)
    budget: Optional[float] = Field(default=None, gt=0)

    @field_validator("checkIn", "checkOut")
    @classmethod
    def _valid_dates(cls, v: str) -> str:
        _parse_date(v)
        return v


class ItineraryBody(BaseModel):
    destination: str = Field(min_length=1, max_length=100)
    days: int = Field(gt=0, le=365)
    interests: Optional[list[str]] = None


class CreateBookingBody(BaseModel):
    type: Literal["FLIGHT", "HOTEL", "ITINERARY", "PACKAGE"]
    destination: str = Field(min_length=1, max_length=100)
    details: dict[str, Any]


# ── Stub search data (identical to the Node flight/hotel stubs) ───────────────

def _search_flights(budget: Optional[float]) -> list[dict]:
    flights = [
        {"id": "fl_001", "airline": "IndiGo", "price": 5400, "departure": "06:00", "arrival": "08:30", "stops": 0},
        {"id": "fl_002", "airline": "Air India", "price": 6200, "departure": "09:15", "arrival": "11:45", "stops": 0},
        {"id": "fl_003", "airline": "Akasa Air", "price": 4800, "departure": "13:00", "arrival": "15:30", "stops": 0},
        {"id": "fl_004", "airline": "Vistara", "price": 7500, "departure": "18:30", "arrival": "21:00", "stops": 0},
    ]
    return [f for f in flights if f["price"] <= budget] if budget else flights


def _search_hotels(budget: Optional[float]) -> list[dict]:
    hotels = [
        {"id": "ht_001", "name": "Grand Palace Hotel", "pricePerNight": 3500, "rating": 4.5, "address": "Mall Road"},
        {"id": "ht_002", "name": "Budget Inn", "pricePerNight": 1800, "rating": 3.8, "address": "Near Railway Station"},
        {"id": "ht_003", "name": "Royal Residency", "pricePerNight": 5200, "rating": 4.8, "address": "Lake View Road"},
        {"id": "ht_004", "name": "Greenwood Resort", "pricePerNight": 4100, "rating": 4.2, "address": "Forest Range"},
    ]
    return [h for h in hotels if h["pricePerNight"] <= budget] if budget else hotels


# ── Itinerary (LLM with deterministic fallback, mirrors ItineraryBuilder) ─────

def _fallback_itinerary(destination: str, days: int) -> list[dict]:
    return [
        {
            "day": i,
            "theme": f"Explore {destination} - Day {i}",
            "activities": [
                "Breakfast at local café",
                f"Visit top landmarks and scenic locations in {destination}",
                "Lunch at a traditional eatery",
                "Afternoon walking tour/local market visit",
                "Dinner at a recommended local restaurant",
            ],
        }
        for i in range(1, days + 1)
    ]


async def _generate_itinerary(destination: str, days: int, interests: list[str]) -> Any:
    system = "You are an expert travel planner. Respond ONLY with a JSON object."
    user = (
        f"Create a day-by-day travel itinerary for {destination} for {days} days.\n"
        f"Interests: {', '.join(interests)}\n"
        'Format: a JSON object with an "itinerary" array; each element has '
        '"day" (number), "theme" (string), and "activities" (string array).'
    )
    result = await AIClient().extract_json(system, user)
    if isinstance(result, dict):
        extracted = result.get("itinerary") or result.get("days") or result
        if extracted:
            return extracted
    return _fallback_itinerary(destination, days)


# ── Cursor helpers (base64url, no padding — matches the Node convention) ──────

def _encode_cursor(row_id: str) -> str:
    return base64.urlsafe_b64encode(row_id.encode()).decode().rstrip("=")


def _decode_cursor(cursor: str) -> Optional[str]:
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        return base64.urlsafe_b64decode(padded.encode()).decode()
    except Exception:
        return None


# ── Routes ───────────────────────────────────────────────────────────────────

@router.post("/search/flights")
async def search_flights(body: FlightSearchBody, user: AuthedUser = Depends(require_user)):
    results = _search_flights(body.budget)
    await create_travel_booking(
        user.id,
        "FLIGHT",
        origin=body.origin,
        destination=body.destination,
        depart_date=_parse_date(body.date),
        budget=int(body.budget) if body.budget is not None else None,
        status="FOUND",
        results=results,
    )
    return results


@router.post("/search/hotels")
async def search_hotels(body: HotelSearchBody, user: AuthedUser = Depends(require_user)):
    results = _search_hotels(body.budget)
    await create_travel_booking(
        user.id,
        "HOTEL",
        destination=body.destination,
        depart_date=_parse_date(body.checkIn),
        return_date=_parse_date(body.checkOut),
        budget=int(body.budget) if body.budget is not None else None,
        status="FOUND",
        results=results,
    )
    return results


@router.post("/itinerary")
async def generate_itinerary(body: ItineraryBody, user: AuthedUser = Depends(require_user)):
    itinerary = await _generate_itinerary(body.destination, body.days, body.interests or [])
    await create_travel_booking(
        user.id,
        "ITINERARY",
        destination=body.destination,
        status="FOUND",
        results=itinerary,
    )
    return itinerary


@router.get("/bookings")
async def list_bookings(
    cursor: Optional[str] = None,
    take: int = 20,
    user: AuthedUser = Depends(require_user),
):
    page_size = min(take, 100)
    decoded = _decode_cursor(cursor) if cursor else None
    items = await list_travel_bookings(user.id, page_size + 1, decoded)
    has_more = len(items) > page_size
    data = items[:page_size] if has_more else items
    last = data[-1] if data else None
    return {
        "data": data,
        "nextCursor": _encode_cursor(last["id"]) if (last and has_more) else None,
        "hasMore": has_more,
    }


@router.post("/bookings")
async def create_booking(body: CreateBookingBody, user: AuthedUser = Depends(require_user)):
    return await create_travel_booking(
        user.id,
        body.type,
        destination=body.destination,
        status="BOOKED",
        selected_option=body.details,
    )
