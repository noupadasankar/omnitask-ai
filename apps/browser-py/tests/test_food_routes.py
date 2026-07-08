"""Tests for the food domain's Places-independent half ported to Python
(domains/food.py: recipe LLM+nutrition, FoodOrder list/create). Restaurants/
availability/book stay in Node and are not covered here."""

import base64
from unittest.mock import AsyncMock, patch

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


class TestRecipe:
    def test_uses_llm_recipe_and_computes_nutrition(self, client):
        llm = {"title": "Veg Stir Fry", "prepTime": "5m", "cookTime": "10m", "ingredients": ["tofu", "rice", "soy"], "instructions": ["cook"]}
        with patch("domains.food.AIClient") as MockAI:
            MockAI.return_value.extract_json = AsyncMock(return_value=llm)
            resp = client.post("/food/recipe", json={"ingredients": ["tofu", "rice"], "dietPreference": "vegan"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["recipe"] == llm
        # nutrition analyzed over the LLM's ingredients (3) -> calories 3*120 = 360
        assert body["nutrition"]["calories"] == 360
        assert body["nutrition"]["macronutrients"]["protein"] == "13.5g"

    def test_falls_back_when_llm_unavailable(self, client):
        with patch("domains.food.AIClient") as MockAI:
            MockAI.return_value.extract_json = AsyncMock(return_value=None)
            resp = client.post("/food/recipe", json={"ingredients": ["egg", "flour"]})
        body = resp.json()
        assert body["recipe"]["title"] == "Healthy Ingredient Bowl"
        assert body["recipe"]["ingredients"] == ["egg", "flour"]
        assert body["nutrition"]["calories"] == 240  # fallback ingredients (2) * 120

    def test_empty_ingredients_rejected(self, client):
        assert client.post("/food/recipe", json={"ingredients": []}).status_code == 422


class TestOrders:
    def test_create_order_defaults_status_ordered(self, client):
        with patch("domains.food.create_food_order", new=AsyncMock(return_value={"id": "o1", "status": "ORDERED"})) as mock_create:
            resp = client.post("/food/orders", json={"platform": "doordash", "restaurantName": "Thai Place", "items": [{"n": "pad thai"}], "totalAmount": 24.5})
        assert resp.status_code == 200
        assert resp.json()["status"] == "ORDERED"
        kw = mock_create.call_args.kwargs
        assert kw["platform"] == "doordash" and kw["restaurant_name"] == "Thai Place"
        assert kw["items"] == [{"n": "pad thai"}] and kw["total_amount"] == 24.5

    def test_create_order_requires_positive_total(self, client):
        assert client.post("/food/orders", json={"platform": "x", "restaurantName": "y", "totalAmount": 0}).status_code == 422

    def test_list_orders_paginates(self, client):
        rows = [{"id": f"o{i}"} for i in range(21)]
        with patch("domains.food.list_food_orders", new=AsyncMock(return_value=rows)) as mock_list:
            resp = client.get("/food/orders")
        body = resp.json()
        assert body["hasMore"] is True and len(body["data"]) == 20
        assert body["nextCursor"] == base64.urlsafe_b64encode(b"o19").decode().rstrip("=")
        mock_list.assert_awaited_once_with("u1", 21, None)

    def test_list_orders_decodes_cursor(self, client):
        cursor = base64.urlsafe_b64encode(b"o5").decode().rstrip("=")
        with patch("domains.food.list_food_orders", new=AsyncMock(return_value=[])) as mock_list:
            client.get("/food/orders", params={"cursor": cursor})
        mock_list.assert_awaited_once_with("u1", 21, "o5")


class TestAuth:
    def test_food_routes_require_auth(self):
        c = TestClient(create_app(AsyncMock(), {}))
        assert c.get("/food/orders").status_code == 401
