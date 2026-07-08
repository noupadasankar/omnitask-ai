"""Tests for the job domain ported off apps/backend/src/job/ — the rule-based
scorer, reconciled preferences, evaluate, resume upload, and the bridge-backed
launch/stop. DB and bridge calls are mocked at their point of use (domains.job.*)."""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from domains.job import _score_job
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
        "roles": [], "locations": [], "requiredKeywords": [], "preferredKeywords": [],
        "excludeKeywords": [], "skills": [], "minScore": 60, "remoteOnly": False, "minSalary": None,
    }
    base.update(over)
    return base


# ── Scorer (pure, deterministic) ─────────────────────────────────────────────

class TestScorer:
    def test_role_match_awards_30(self):
        r = _score_job({"title": "Senior Backend Engineer"}, _prefs(roles=["backend"], minScore=0))
        assert r["breakdown"]["role"] == 30
        assert r["qualifies"] is True

    def test_exclude_keyword_applies_hard_penalty_and_disqualifies(self):
        r = _score_job({"title": "Backend Engineer (unpaid intern)"}, _prefs(roles=["backend"], excludeKeywords=["unpaid"], minScore=0))
        assert r["breakdown"]["exclude"] == -50
        assert r["qualifies"] is False  # exclude hit forces disqualification

    def test_required_keywords_use_js_round_half_up(self):
        # 1 of 2 required matched -> 0.5 * 25 = 12.5 -> JS Math.round = 13 (Python round would give 12)
        r = _score_job({"title": "Python role", "description": ""}, _prefs(requiredKeywords=["python", "django"], minScore=0))
        assert r["breakdown"]["required"] == 13

    def test_salary_below_floor_disqualifies(self):
        r = _score_job({"title": "Engineer", "salary": 50000}, _prefs(roles=["engineer"], minSalary=80000, minScore=0))
        assert r["qualifies"] is False
        assert r["breakdown"]["salary"] == -999

    def test_qualifies_requires_min_score(self):
        # role(30) only, minScore 60 -> not qualified
        r = _score_job({"title": "Backend Engineer"}, _prefs(roles=["backend"], minScore=60))
        assert r["score"] == 30
        assert r["qualifies"] is False

    def test_remote_only_awards_location_when_remote(self):
        r = _score_job({"title": "Engineer", "remote": True}, _prefs(remoteOnly=True, minScore=0))
        assert r["breakdown"]["location"] == 20


# ── Preferences (reconciled) ─────────────────────────────────────────────────

class TestPreferences:
    def test_get_returns_reconciled_shape(self, client):
        pref = {"userId": "u1", "roles": ["SWE"], "dailyLimit": 15, "minScore": 70}
        with patch("domains.job.get_job_preference", new=AsyncMock(return_value=pref)):
            resp = client.get("/job/preferences")
        assert resp.status_code == 200
        assert resp.json()["dailyLimit"] == 15

    def test_save_packs_extras_into_metadata(self, client):
        body = {
            "roles": ["SWE"], "locations": ["Remote"], "skills": ["python"],
            "requiredKeywords": ["python"], "preferredKeywords": ["django"],
            "excludeKeywords": ["senior"], "minScore": 70, "dailyLimit": 15,
            "remoteOnly": True, "minSalary": 90000,
        }
        with patch("domains.job.upsert_job_preference", new=AsyncMock(return_value={"ok": True})) as mock_up:
            resp = client.put("/job/preferences", json=body)
        assert resp.status_code == 200
        kw = mock_up.call_args.kwargs
        assert kw["roles"] == ["SWE"] and kw["daily_limit"] == 15 and kw["min_salary"] == 90000
        assert kw["metadata"] == {
            "minScore": 70, "requiredKeywords": ["python"], "preferredKeywords": ["django"],
            "excludeKeywords": ["senior"], "remoteOnly": True,
        }


# ── evaluate ─────────────────────────────────────────────────────────────────

class TestEvaluate:
    def test_qualifies_within_quota_then_skips_over_quota(self, client):
        pref = _prefs(minScore=0)
        pref.update({"dailyLimit": 2})
        jobs = [{"portal": "linkedin", "externalJobId": f"j{i}", "title": f"Role {i}"} for i in range(3)]
        with patch("domains.job.get_job_preference", new=AsyncMock(return_value=pref)), \
             patch("domains.job.job_applied_today", new=AsyncMock(return_value=0)), \
             patch("domains.job.job_already_seen", new=AsyncMock(return_value=False)), \
             patch("domains.job.record_job_match", new=AsyncMock(side_effect=lambda *a, **k: {"id": "app"})):
            resp = client.post("/job/evaluate", json={"jobs": jobs})
        body = resp.json()
        assert body["evaluated"] == 3
        assert len(body["qualified"]) == 2  # quota = 2
        assert len(body["skipped"]) == 1
        assert body["dailyLimitReached"] is True
        assert body["remainingToday"] == 0

    def test_dedupes_already_seen(self, client):
        pref = _prefs(minScore=0)
        pref.update({"dailyLimit": 10})
        jobs = [{"portal": "linkedin", "externalJobId": "j1", "title": "Role"}]
        with patch("domains.job.get_job_preference", new=AsyncMock(return_value=pref)), \
             patch("domains.job.job_applied_today", new=AsyncMock(return_value=0)), \
             patch("domains.job.job_already_seen", new=AsyncMock(return_value=True)), \
             patch("domains.job.record_job_match", new=AsyncMock(return_value={"id": "app"})) as mock_rec:
            resp = client.post("/job/evaluate", json={"jobs": jobs})
        body = resp.json()
        assert body["duplicates"] == 1 and body["evaluated"] == 0
        mock_rec.assert_not_awaited()

    def test_empty_jobs_rejected(self, client):
        resp = client.post("/job/evaluate", json={"jobs": []})
        assert resp.status_code == 422


# ── resume upload (multipart) ────────────────────────────────────────────────

class TestResume:
    def test_saves_resume_to_config_dir(self, client, tmp_path):
        with patch("domains.job._CONFIG_DIR", tmp_path):
            resp = client.post("/job/resume", files={"resume": ("cv.pdf", b"%PDF-fake", "application/pdf")})
        assert resp.status_code == 200
        assert resp.json() == {"filename": "resume.pdf", "saved": True}
        assert (tmp_path / "resume.pdf").read_bytes() == b"%PDF-fake"


# ── launch (bridge) ──────────────────────────────────────────────────────────

class TestLaunch:
    def test_creates_run_and_dispatches_with_reconciled_prefs(self, client):
        pref = _prefs(roles=["SWE"], minScore=55, requiredKeywords=["python"])
        pref.update({"dailyLimit": 10})
        with patch("domains.job.get_job_preference", new=AsyncMock(return_value=pref)), \
             patch("domains.job.create_job_run", new=AsyncMock(return_value={"taskId": "t1", "sessionId": "s1"})), \
             patch("domains.job.is_engine_alive", new=AsyncMock(return_value=True)), \
             patch("domains.job.dispatch_job", new=AsyncMock()) as mock_dispatch:
            resp = client.post("/job/launch", json={"portals": ["linkedin"], "roles": ["Backend"]})
        assert resp.status_code == 200
        assert resp.json() == {"sessionId": "s1", "taskId": "t1", "dispatched": True}
        payload = mock_dispatch.call_args.args[0]
        assert payload["skill"] == "job_application"
        assert payload["sessionId"] == "s1" and payload["taskId"] == "t1"
        prefs = payload["config"]["preferences"]
        assert prefs["roles"] == ["Backend"]  # request override
        assert prefs["portals"] == ["linkedin"]
        assert prefs["minScore"] == 55  # from saved pref (not overridden)
        assert prefs["requiredKeywords"] == ["python"]  # now real (metadata), not always []

    def test_passes_credentials_and_profile_when_provided(self, client):
        pref = _prefs()
        pref.update({"dailyLimit": 10})
        with patch("domains.job.get_job_preference", new=AsyncMock(return_value=pref)), \
             patch("domains.job.create_job_run", new=AsyncMock(return_value={"taskId": "t1", "sessionId": "s1"})), \
             patch("domains.job.is_engine_alive", new=AsyncMock(return_value=False)), \
             patch("domains.job.dispatch_job", new=AsyncMock()) as mock_dispatch:
            resp = client.post("/job/launch", json={
                "userProfile": {"name": "A", "email": "a@b.com", "phone": "1"},
                "credentials": {"linkedin": {"email": "a@b.com", "password": "x"}},
            })
        assert resp.json()["dispatched"] is False  # engine offline
        prefs = mock_dispatch.call_args.args[0]["config"]["preferences"]
        assert prefs["userProfile"] == {"name": "A", "email": "a@b.com", "phone": "1"}
        assert prefs["credentials"] == {"linkedin": {"email": "a@b.com", "password": "x"}}


# ── stop (bridge) ────────────────────────────────────────────────────────────

class TestStop:
    def test_cancels_when_session_found(self, client):
        with patch("domains.job.find_execution_session", new=AsyncMock(return_value={"id": "s1", "taskId": "t1"})), \
             patch("domains.job.cancel_job", new=AsyncMock()) as mock_cancel, \
             patch("domains.job.mark_job_cancelled", new=AsyncMock()) as mock_mark:
            resp = client.post("/job/stop", json={"sessionId": "s1"})
        assert resp.json() == {"stopped": True}
        mock_cancel.assert_awaited_once_with("s1")
        mock_mark.assert_awaited_once_with("s1", "t1")

    def test_returns_false_when_session_missing(self, client):
        with patch("domains.job.find_execution_session", new=AsyncMock(return_value=None)), \
             patch("domains.job.cancel_job", new=AsyncMock()) as mock_cancel:
            resp = client.post("/job/stop", json={"sessionId": "nope"})
        assert resp.json() == {"stopped": False}
        mock_cancel.assert_not_awaited()


# ── applications / stats / auth ──────────────────────────────────────────────

class TestTracking:
    def test_applications_passes_status_filter(self, client):
        with patch("domains.job.list_job_applications", new=AsyncMock(return_value=[{"id": "a1"}])) as mock_list:
            resp = client.get("/job/applications", params={"status": "APPLIED"})
        assert resp.json() == [{"id": "a1"}]
        mock_list.assert_awaited_once_with("u1", "APPLIED")

    def test_stats_passthrough(self, client):
        stats = {"matched": 1, "applied": 2, "appliedToday": 0}
        with patch("domains.job.job_stats", new=AsyncMock(return_value=stats)):
            resp = client.get("/job/stats")
        assert resp.json() == stats


class TestAuth:
    def test_job_routes_require_auth(self):
        app = create_app(AsyncMock(), {})
        c = TestClient(app)
        assert c.get("/job/stats").status_code == 401
