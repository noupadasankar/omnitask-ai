"""Tests for the travel domain ported off apps/backend/src/travel/ — routes
(domains/travel.py) and the TravelBooking asyncpg layer (db/session_db.py).
DB and LLM calls are mocked at their point of use (domains.travel.*)."""

import base64
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from http_api.app import create_app
from http_api.auth import AuthedUser, require_user

AUTHED = AuthedUser(id="u1", email="user@example.com", role="USER")


@pytest.fixture
def client():
    app = create_app(AsyncMock(), {})
    app.dependency_overrides[require_user] = lambda: AUTHED
    return TestClient(app)


class TestFlightSearch:
    def test_returns_all_flights_and_records_a_booking(self, client):
        with patch("domains.travel.create_travel_booking", new=AsyncMock(return_value={})) as mock_create:
            resp = client.post(
                "/travel/search/flights",
                json={"origin": "DEL", "destination": "GOI", "date": "2026-08-15"},
            )
        assert resp.status_code == 200
        assert len(resp.json()) == 4
        mock_create.assert_awaited_once()
        # booking recorded as a FLIGHT for the authed user with the stub results
        _, kwargs = mock_create.call_args
        args = mock_create.call_args.args
        assert args[0] == "u1" and args[1] == "FLIGHT"
        assert kwargs["origin"] == "DEL" and kwargs["destination"] == "GOI"
        assert len(kwargs["results"]) == 4

    def test_budget_filters_the_stub_list(self, client):
        with patch("domains.travel.create_travel_booking", new=AsyncMock(return_value={})):
            resp = client.post(
                "/travel/search/flights",
                json={"origin": "DEL", "destination": "GOI", "date": "2026-08-15", "budget": 5000},
            )
        assert resp.status_code == 200
        prices = [f["price"] for f in resp.json()]
        assert prices == [4800]  # only fl_003 is <= 5000

    def test_budget_passed_to_booking_as_int(self, client):
        with patch("domains.travel.create_travel_booking", new=AsyncMock(return_value={})) as mock_create:
            client.post(
                "/travel/search/flights",
                json={"origin": "DEL", "destination": "GOI", "date": "2026-08-15", "budget": 5000},
            )
        assert mock_create.call_args.kwargs["budget"] == 5000
        assert isinstance(mock_create.call_args.kwargs["budget"], int)

    def test_invalid_date_is_rejected(self, client):
        resp = client.post(
            "/travel/search/flights",
            json={"origin": "DEL", "destination": "GOI", "date": "not-a-date"},
        )
        assert resp.status_code == 422


class TestHotelSearch:
    def test_returns_all_hotels_and_records_a_booking(self, client):
        with patch("domains.travel.create_travel_booking", new=AsyncMock(return_value={})) as mock_create:
            resp = client.post(
                "/travel/search/hotels",
                json={"destination": "GOI", "checkIn": "2026-08-15", "checkOut": "2026-08-18"},
            )
        assert resp.status_code == 200
        assert len(resp.json()) == 4
        assert mock_create.call_args.args[1] == "HOTEL"

    def test_budget_filters_hotels(self, client):
        with patch("domains.travel.create_travel_booking", new=AsyncMock(return_value={})):
            resp = client.post(
                "/travel/search/hotels",
                json={"destination": "GOI", "checkIn": "2026-08-15", "checkOut": "2026-08-18", "budget": 2000},
            )
        names = [h["id"] for h in resp.json()]
        assert names == ["ht_002"]  # only Budget Inn (1800) <= 2000


class TestItinerary:
    def test_uses_llm_result_when_available(self, client):
        llm_out = {"itinerary": [{"day": 1, "theme": "Beaches", "activities": ["Surf"]}]}
        with patch("domains.travel.create_travel_booking", new=AsyncMock(return_value={})), \
             patch("domains.travel.AIClient") as MockAI:
            MockAI.return_value.extract_json = AsyncMock(return_value=llm_out)
            resp = client.post("/travel/itinerary", json={"destination": "Goa", "days": 1})
        assert resp.status_code == 200
        assert resp.json() == llm_out["itinerary"]

    def test_falls_back_to_deterministic_plan_when_llm_unavailable(self, client):
        with patch("domains.travel.create_travel_booking", new=AsyncMock(return_value={})), \
             patch("domains.travel.AIClient") as MockAI:
            MockAI.return_value.extract_json = AsyncMock(return_value=None)
            resp = client.post("/travel/itinerary", json={"destination": "Goa", "days": 3})
        assert resp.status_code == 200
        plan = resp.json()
        assert len(plan) == 3
        assert plan[0]["day"] == 1 and "Goa" in plan[0]["theme"]


class TestBookings:
    def test_list_paginates_with_a_next_cursor(self, client):
        rows = [{"id": f"b{i}", "type": "FLIGHT"} for i in range(21)]
        with patch("domains.travel.list_travel_bookings", new=AsyncMock(return_value=rows)) as mock_list:
            resp = client.get("/travel/bookings")
        assert resp.status_code == 200
        body = resp.json()
        assert body["hasMore"] is True
        assert len(body["data"]) == 20
        expected_cursor = base64.urlsafe_b64encode(b"b19").decode().rstrip("=")
        assert body["nextCursor"] == expected_cursor
        mock_list.assert_awaited_once_with("u1", 21, None)

    def test_list_decodes_incoming_cursor(self, client):
        cursor = base64.urlsafe_b64encode(b"b5").decode().rstrip("=")
        with patch("domains.travel.list_travel_bookings", new=AsyncMock(return_value=[])) as mock_list:
            client.get("/travel/bookings", params={"cursor": cursor})
        mock_list.assert_awaited_once_with("u1", 21, "b5")

    def test_create_booking_records_booked_with_details(self, client):
        # Uses a valid enum value: the live TravelBookingType enum is
        # FLIGHT/HOTEL/ITINERARY only. 'PACKAGE' is accepted by the request
        # Literal (faithful to the Node DTO) but 500s at the DB on both stacks.
        with patch("domains.travel.create_travel_booking", new=AsyncMock(return_value={"id": "b1", "status": "BOOKED"})) as mock_create:
            resp = client.post(
                "/travel/bookings",
                json={"type": "ITINERARY", "destination": "Goa", "details": {"nights": 3}},
            )
        assert resp.status_code == 200
        assert resp.json()["status"] == "BOOKED"
        assert mock_create.call_args.args[1] == "ITINERARY"
        assert mock_create.call_args.kwargs["selected_option"] == {"nights": 3}
        assert mock_create.call_args.kwargs["status"] == "BOOKED"


class TestAuth:
    def test_travel_routes_require_auth(self):
        app = create_app(AsyncMock(), {})
        c = TestClient(app)
        resp = c.get("/travel/bookings")
        assert resp.status_code == 401
