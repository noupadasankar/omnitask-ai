"""Tests for the shopping domain ported off apps/backend/src/shopping/ — the
rule-based scorer, reconciled preferences, evaluate, watch, observe-price,
products, stats. DB calls mocked at their point of use (domains.shopping.*)."""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from domains.shopping import _score_product
from http_api.app import create_app
from http_api.auth import AuthedUser, require_user

AUTHED = AuthedUser(id="u1", email="user@example.com", role="USER")


@pytest.fixture
def client():
    app = create_app(AsyncMock(), {})
    app.dependency_overrides[require_user] = lambda: AUTHED
    return TestClient(app)


def _prefs(**over):
    base = {
        "categories": [], "mustHaveFeatures": [], "avoidKeywords": [], "preferredBrands": [],
        "maxPrice": None, "minRating": 4.0, "minScore": 60, "autoBuyLimit": 0,
    }
    base.update(over)
    return base


# ── Scorer (pure) ────────────────────────────────────────────────────────────

class TestScorer:
    def test_within_budget_awards_scaled_price_points(self):
        # headroom 0.5 -> (0.4 + 0.6*0.5)*30 = 21
        r = _score_product({"title": "Phone", "price": 500}, _prefs(maxPrice=1000, minScore=0))
        assert r["breakdown"]["price"] == 21

    def test_over_budget_disqualifies(self):
        r = _score_product({"title": "Phone", "price": 1500}, _prefs(maxPrice=1000, minScore=0))
        assert r["qualifies"] is False
        assert r["breakdown"]["price"] == -999

    def test_rating_below_floor_disqualifies(self):
        r = _score_product({"title": "Phone", "rating": 3.0}, _prefs(minRating=4.0, minScore=0))
        assert r["qualifies"] is False
        assert r["breakdown"]["rating"] == -999

    def test_avoid_keyword_penalty_and_disqualifies(self):
        r = _score_product({"title": "Refurbished Phone"}, _prefs(avoidKeywords=["refurbished"], minScore=0))
        assert r["breakdown"]["avoid"] == -50
        assert r["qualifies"] is False

    def test_brand_and_category_bonuses(self):
        r = _score_product(
            {"title": "Apple iPhone", "brand": "Apple", "description": "smartphone"},
            _prefs(preferredBrands=["apple"], categories=["smartphone"], minScore=0),
        )
        assert r["breakdown"]["brand"] == 10
        assert r["breakdown"]["category"] == 10

    def test_features_use_js_round(self):
        # 1 of 2 features -> 0.5*25 = 12.5 -> JS round = 13
        r = _score_product({"title": "Phone 5G OLED", "description": "5g"}, _prefs(mustHaveFeatures=["5g", "wireless"], minScore=0))
        assert r["breakdown"]["features"] == 13


# ── Preferences (reconciled) ─────────────────────────────────────────────────

class TestPreferences:
    def test_save_packs_extras_into_metadata(self, client):
        body = {
            "categories": ["phones"], "preferredBrands": ["apple"], "maxPrice": 1000,
            "mustHaveFeatures": ["5g"], "avoidKeywords": ["refurb"], "minRating": 4.5,
            "minScore": 70, "autoBuyLimit": 500,
        }
        with patch("domains.shopping.upsert_shopping_preference", new=AsyncMock(return_value={"ok": True})) as mock_up:
            resp = client.put("/shopping/preferences", json=body)
        assert resp.status_code == 200
        kw = mock_up.call_args.kwargs
        assert kw["categories"] == ["phones"] and kw["preferred_brands"] == ["apple"] and kw["max_price"] == 1000
        assert kw["metadata"] == {
            "mustHaveFeatures": ["5g"], "avoidKeywords": ["refurb"], "minRating": 4.5,
            "minScore": 70, "autoBuyLimit": 500,
        }

    def test_get_passthrough(self, client):
        pref = _prefs(categories=["phones"])
        pref["userId"] = "u1"
        with patch("domains.shopping.get_shopping_preference", new=AsyncMock(return_value=pref)):
            resp = client.get("/shopping/preferences")
        assert resp.json()["categories"] == ["phones"]


# ── evaluate ─────────────────────────────────────────────────────────────────

class TestEvaluate:
    def test_qualifying_under_autobuy_is_pending_else_watching(self, client):
        pref = _prefs(minScore=0, autoBuyLimit=600)
        products = [
            {"site": "amazon", "externalProductId": "p1", "title": "Cheap", "price": 500},   # under autobuy -> PENDING
            {"site": "amazon", "externalProductId": "p2", "title": "Pricey", "price": 900},   # qualifies but > autobuy -> WATCHING
        ]
        with patch("domains.shopping.get_shopping_preference", new=AsyncMock(return_value=pref)), \
             patch("domains.shopping.shopping_already_seen", new=AsyncMock(return_value=False)), \
             patch("domains.shopping.record_tracked_product", new=AsyncMock(side_effect=lambda *a, **k: {"id": "t"})):
            resp = client.post("/shopping/evaluate", json={"products": products})
        body = resp.json()
        assert body["evaluated"] == 2
        assert len(body["qualified"]) == 2  # both qualify (minScore 0)
        statuses = sorted(e["status"] for e in body["qualified"])
        assert statuses == ["PENDING_APPROVAL", "WATCHING"]
        assert body["best"] is not None

    def test_non_qualifying_is_skipped(self, client):
        pref = _prefs(minScore=200)  # impossible threshold
        products = [{"site": "amazon", "externalProductId": "p1", "title": "X", "price": 500}]
        with patch("domains.shopping.get_shopping_preference", new=AsyncMock(return_value=pref)), \
             patch("domains.shopping.shopping_already_seen", new=AsyncMock(return_value=False)), \
             patch("domains.shopping.record_tracked_product", new=AsyncMock(return_value={"id": "t"})):
            resp = client.post("/shopping/evaluate", json={"products": products})
        body = resp.json()
        assert len(body["skipped"]) == 1 and body["skipped"][0]["status"] == "SKIPPED"
        assert body["best"] is None

    def test_dedupes_seen(self, client):
        pref = _prefs(minScore=0)
        products = [{"site": "amazon", "externalProductId": "p1", "title": "X"}]
        with patch("domains.shopping.get_shopping_preference", new=AsyncMock(return_value=pref)), \
             patch("domains.shopping.shopping_already_seen", new=AsyncMock(return_value=True)), \
             patch("domains.shopping.record_tracked_product", new=AsyncMock(return_value={"id": "t"})) as mock_rec:
            resp = client.post("/shopping/evaluate", json={"products": products})
        assert resp.json()["duplicates"] == 1
        mock_rec.assert_not_awaited()

    def test_empty_products_rejected(self, client):
        assert client.post("/shopping/evaluate", json={"products": []}).status_code == 422


# ── watch / observe-price ────────────────────────────────────────────────────

class TestWatchObserve:
    def test_watch_sets_target_price(self, client):
        with patch("domains.shopping.record_tracked_product", new=AsyncMock(return_value={"id": "t1"})), \
             patch("domains.shopping.set_product_target_price", new=AsyncMock(return_value={"id": "t1", "targetPrice": 400})) as mock_tp:
            resp = client.post("/shopping/watch", json={"product": {"site": "amazon", "externalProductId": "p1", "title": "X"}, "targetPrice": 400})
        assert resp.json()["targetPrice"] == 400
        mock_tp.assert_awaited_once_with("t1", 400)

    def test_observe_price_defaults_drop_pct_to_10(self, client):
        with patch("domains.shopping.observe_price", new=AsyncMock(return_value=None)) as mock_obs:
            resp = client.post("/shopping/observe-price", json={"trackedId": "t1", "price": 300})
        assert resp.status_code == 200
        mock_obs.assert_awaited_once_with("t1", 300, 10)


# ── products / stats / auth ──────────────────────────────────────────────────

class TestTracking:
    def test_products_passes_status(self, client):
        with patch("domains.shopping.list_tracked_products", new=AsyncMock(return_value=[{"id": "t1"}])) as mock_list:
            resp = client.get("/shopping/products", params={"status": "WATCHING"})
        assert resp.json() == [{"id": "t1"}]
        mock_list.assert_awaited_once_with("u1", "WATCHING")

    def test_stats_passthrough(self, client):
        stats = {"matched": 1, "watching": 2}
        with patch("domains.shopping.shopping_stats", new=AsyncMock(return_value=stats)):
            assert client.get("/shopping/stats").json() == stats


class TestAuth:
    def test_shopping_routes_require_auth(self):
        c = TestClient(create_app(AsyncMock(), {}))
        assert c.get("/shopping/stats").status_code == 401
