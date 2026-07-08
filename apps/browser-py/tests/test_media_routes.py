"""Tests for the media domain ported off apps/backend/src/media/ — routes
(domains/media.py), FastAPI wiring (http_api/app.py), and the direct-Postgres
access layer (db/session_db.py)."""

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


class TestHealth:
    def test_health_reports_up_when_redis_reachable(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "up"
        assert body["service"] == "browser-py"
        assert body["redis"]["status"] == "up"
        assert body["activeJobs"] == 0


class TestSearch:
    def test_search_returns_youtube_and_spotify_results(self, client):
        resp = client.get("/media/search", params={"query": "Bohemian Rhapsody"})
        assert resp.status_code == 200
        results = resp.json()
        providers = {r["provider"] for r in results}
        assert providers == {"youtube", "spotify"}

    def test_search_respects_type_filter(self, client):
        resp = client.get("/media/search", params={"query": "lofi", "type": "album"})
        assert resp.status_code == 200
        results = resp.json()
        assert all(r["provider"] == "spotify" for r in results)

    def test_search_respects_limit(self, client):
        resp = client.get("/media/search", params={"query": "lofi", "limit": 1})
        assert resp.status_code == 200
        assert len(resp.json()) == 1


class TestPlay:
    def test_play_by_track_id_creates_session_and_returns_youtube_url(self, client):
        with patch("domains.media.create_media_session", new=AsyncMock(return_value={})) as mock_create:
            resp = client.post("/media/play", json={"trackId": "abc123"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert body["url"] == "https://music.youtube.com/watch?v=abc123"
        mock_create.assert_awaited_once_with("u1", "youtube", "play", "abc123")

    def test_play_by_query_searches_then_plays_top_result(self, client):
        with patch("domains.media.create_media_session", new=AsyncMock(return_value={})) as mock_create:
            resp = client.post("/media/play", json={"query": "Bohemian Rhapsody"})
        assert resp.status_code == 200
        assert resp.json()["success"] is True
        mock_create.assert_awaited_once()

    def test_play_spotify_provider_returns_spotify_url(self, client):
        with patch("domains.media.create_media_session", new=AsyncMock(return_value={})):
            resp = client.post("/media/play", json={"trackId": "xyz", "provider": "spotify"})
        assert resp.json()["url"] == "https://open.spotify.com/track/xyz"

    def test_play_without_query_or_track_id_is_rejected(self, client):
        resp = client.post("/media/play", json={})
        assert resp.status_code == 422


class TestQueueAndPause:
    def test_queue_creates_session(self, client):
        with patch("domains.media.create_media_session", new=AsyncMock(return_value={})) as mock_create:
            resp = client.post("/media/queue", json={"trackId": "abc123"})
        assert resp.status_code == 200
        assert resp.json()["action"] == "queue"
        mock_create.assert_awaited_once_with("u1", "youtube", "queue", "abc123")

    def test_pause_creates_session_without_track_id(self, client):
        with patch("domains.media.create_media_session", new=AsyncMock(return_value={})) as mock_create:
            resp = client.post("/media/pause", json={})
        assert resp.status_code == 200
        assert resp.json()["message"] == "Playback paused"
        mock_create.assert_awaited_once_with("u1", "youtube", "pause", None)


class TestHistory:
    def test_history_scoped_to_authed_user(self, client):
        with patch("domains.media.find_media_history", new=AsyncMock(return_value=[{"id": "s1"}])) as mock_find:
            resp = client.get("/media/history")
        assert resp.status_code == 200
        assert resp.json() == [{"id": "s1"}]
        mock_find.assert_awaited_once_with("u1", 20)


class TestAuth:
    def test_media_routes_require_auth(self):
        app = create_app(AsyncMock(), {})
        client = TestClient(app)
        resp = client.get("/media/search", params={"query": "x"})
        assert resp.status_code == 401
