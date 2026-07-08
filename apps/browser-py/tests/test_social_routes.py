"""Tests for the social domain ported off apps/backend/src/social/ — routes
(domains/social.py) and the SocialPost asyncpg layer (db/session_db.py). DB and
LLM calls are mocked at their point of use (domains.social.*)."""

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


class TestGenerate:
    def test_creates_draft_from_llm_output(self, client):
        with patch("domains.social.create_social_post", new=AsyncMock(return_value={"id": "p1", "status": "DRAFT"})) as mock_create, \
             patch("domains.social.AIClient") as MockAI:
            MockAI.return_value.summarize = AsyncMock(return_value="Great post about AI!")
            resp = client.post("/social/posts/generate", json={"topic": "AI", "platform": "twitter"})
        assert resp.status_code == 200
        mock_create.assert_awaited_once_with("u1", "twitter", "Great post about AI!", "DRAFT")

    def test_falls_back_when_llm_unavailable(self, client):
        with patch("domains.social.create_social_post", new=AsyncMock(return_value={})) as mock_create, \
             patch("domains.social.AIClient") as MockAI:
            MockAI.return_value.summarize = AsyncMock(return_value=None)
            client.post("/social/posts/generate", json={"topic": "AI", "platform": "linkedin"})
        content = mock_create.call_args.args[2]
        assert "OmniTask-AI" in content  # the deterministic fallback draft


class TestSchedule:
    def test_schedules_a_valid_post(self, client):
        post = {"id": "p1", "content": "hello", "platform": "twitter"}
        with patch("domains.social.find_social_post", new=AsyncMock(return_value=post)), \
             patch("domains.social.schedule_social_post", new=AsyncMock(return_value={"id": "p1", "status": "SCHEDULED"})) as mock_sched:
            resp = client.post("/social/posts/schedule", json={"postId": "p1", "scheduledAt": "2026-08-15T09:00:00"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "SCHEDULED"
        mock_sched.assert_awaited_once()

    def test_404_when_post_missing(self, client):
        with patch("domains.social.find_social_post", new=AsyncMock(return_value=None)):
            resp = client.post("/social/posts/schedule", json={"postId": "x", "scheduledAt": "2026-08-15"})
        assert resp.status_code == 404

    def test_400_when_content_invalid(self, client):
        post = {"id": "p1", "content": "", "platform": "twitter"}  # empty content fails validation
        with patch("domains.social.find_social_post", new=AsyncMock(return_value=post)):
            resp = client.post("/social/posts/schedule", json={"postId": "p1", "scheduledAt": "2026-08-15"})
        assert resp.status_code == 400

    def test_422_on_bad_date(self, client):
        resp = client.post("/social/posts/schedule", json={"postId": "p1", "scheduledAt": "not-a-date"})
        assert resp.status_code == 422


class TestPublish:
    def test_publishes_and_stamps_engagement(self, client):
        post = {"id": "p1", "content": "hello world", "platform": "twitter"}
        with patch("domains.social.find_social_post", new=AsyncMock(return_value=post)), \
             patch("domains.social.publish_social_post", new=AsyncMock(return_value={"id": "p1", "status": "PUBLISHED"})) as mock_pub:
            resp = client.post("/social/posts/p1/publish")
        assert resp.status_code == 200
        assert resp.json()["status"] == "PUBLISHED"
        args = mock_pub.call_args.args  # (post_id, external_id, likes, shares, comments, views)
        assert args[0] == "p1"
        assert args[1].startswith("tw_")
        assert 10 <= args[2] <= 59
        assert 2 <= args[3] <= 11
        assert 1 <= args[4] <= 5
        assert 100 <= args[5] <= 599

    def test_mock_external_id_for_unknown_platform(self, client):
        post = {"id": "p1", "content": "hello", "platform": "facebook"}
        with patch("domains.social.find_social_post", new=AsyncMock(return_value=post)), \
             patch("domains.social.publish_social_post", new=AsyncMock(return_value={})) as mock_pub:
            client.post("/social/posts/p1/publish")
        assert mock_pub.call_args.args[1].startswith("mock_")

    def test_404_when_post_missing(self, client):
        with patch("domains.social.find_social_post", new=AsyncMock(return_value=None)):
            resp = client.post("/social/posts/p1/publish")
        assert resp.status_code == 404


class TestListPosts:
    def test_paginates_with_next_cursor(self, client):
        rows = [{"id": f"p{i}"} for i in range(21)]
        with patch("domains.social.list_social_posts", new=AsyncMock(return_value=rows)) as mock_list:
            resp = client.get("/social/posts")
        body = resp.json()
        assert body["hasMore"] is True
        assert len(body["data"]) == 20
        assert body["nextCursor"] == base64.urlsafe_b64encode(b"p19").decode().rstrip("=")
        mock_list.assert_awaited_once_with("u1", 21, None, None)

    def test_passes_status_filter_and_decoded_cursor(self, client):
        cursor = base64.urlsafe_b64encode(b"p5").decode().rstrip("=")
        with patch("domains.social.list_social_posts", new=AsyncMock(return_value=[])) as mock_list:
            client.get("/social/posts", params={"status": "DRAFT", "cursor": cursor})
        mock_list.assert_awaited_once_with("u1", 21, "p5", "DRAFT")


class TestAnalytics:
    def test_aggregates_engagement_and_counts(self, client):
        posts = [
            {"likes": 10, "shares": 2, "comments": 1, "views": 100, "status": "PUBLISHED"},
            {"likes": 5, "shares": 1, "comments": 0, "views": 50, "status": "SCHEDULED"},
        ]
        with patch("domains.social.fetch_social_posts_for_stats", new=AsyncMock(return_value=posts)):
            resp = client.get("/social/analytics")
        body = resp.json()
        assert body["totalPosts"] == 2
        assert body["publishedCount"] == 1 and body["scheduledCount"] == 1
        assert body["engagement"]["likes"] == 15 and body["engagement"]["views"] == 150
        assert body["followers"] == {"linkedin": 1250, "twitter": 850}
        assert body["growthRate"] == 12.5
        assert abs(body["engagement"]["rate"] - (19 / 150 * 100)) < 1e-6


class TestTrends:
    def test_returns_hardcoded_trends(self, client):
        resp = client.get("/social/trends")
        assert resp.status_code == 200
        assert "#AIagents" in [t["topic"] for t in resp.json()]


class TestAuth:
    def test_social_routes_require_auth(self):
        app = create_app(AsyncMock(), {})
        c = TestClient(app)
        assert c.get("/social/trends").status_code == 401
