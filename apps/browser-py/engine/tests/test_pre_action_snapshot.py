"""Tests for PreActionSnapshotter and PreActionSnapshot.

Uses ControlledMockPage — no live browser required.
"""

import pytest
from engine.pre_action_snapshot import PreActionSnapshotter, SnapshotRisk
from engine.tests.conftest import run, ControlledMockPage


# ── should_snapshot ───────────────────────────────────────────────────────────

def test_should_snapshot_medium():
    assert PreActionSnapshotter().should_snapshot("MEDIUM") is True


def test_should_snapshot_high():
    assert PreActionSnapshotter().should_snapshot("HIGH") is True


def test_should_snapshot_critical():
    assert PreActionSnapshotter().should_snapshot("CRITICAL") is True


def test_should_not_snapshot_low():
    assert PreActionSnapshotter().should_snapshot("LOW") is False


def test_should_not_snapshot_read_only():
    assert PreActionSnapshotter().should_snapshot("READ_ONLY") is False


def test_should_not_snapshot_unknown():
    assert PreActionSnapshotter().should_snapshot("WHATEVER") is False


# ── capture() returns None for low risk ───────────────────────────────────────

def test_capture_returns_none_for_low_risk():
    page = ControlledMockPage()
    snap = run(PreActionSnapshotter().capture(page, step_id="s1", risk_level="LOW"))
    assert snap is None


# ── capture() produces snapshot for medium risk ───────────────────────────────

def _make_form_page(fields=None, gaps=None, scroll=None):
    fields = fields or []
    gaps = gaps or []
    scroll = scroll or {"x": 0, "y": 0}
    return ControlledMockPage(evaluate_returns={
        "input, select, textarea": {"fields": fields, "gaps": gaps},
        "Object.keys(localStorage)": [],
        "Object.keys(sessionStorage)": [],
        "window.scrollX": scroll,
        "activeElement": None,
    })


def test_capture_returns_snapshot_for_medium_risk():
    page = ControlledMockPage(evaluate_returns={
        "input, select, textarea": {"fields": [], "gaps": []},
        "Object.keys(localStorage)": [],
        "Object.keys(sessionStorage)": [],
        "window.scrollX": {"x": 0, "y": 0},
        "activeElement": None,
    })
    snap = run(PreActionSnapshotter().capture(page, step_id="s1", risk_level="MEDIUM"))
    assert snap is not None
    assert snap.risk_level == "MEDIUM"
    assert snap.step_id == "s1"


def test_capture_snapshot_has_required_fields():
    page = ControlledMockPage()
    snap = run(PreActionSnapshotter().capture(page, step_id="s2", risk_level="HIGH", workflow_id="wf-1"))
    assert snap is not None
    assert snap.workflow_id == "wf-1"
    assert snap.snapshot_id != ""
    assert snap.captured_at > 0


def test_capture_records_url():
    page = ControlledMockPage(url="https://checkout.example.com")
    snap = run(PreActionSnapshotter().capture(page, step_id="s1", risk_level="HIGH"))
    assert snap.url == "https://checkout.example.com"


def test_to_dict_structure():
    page = ControlledMockPage()
    snap = run(PreActionSnapshotter().capture(page, step_id="s1", risk_level="CRITICAL"))
    d = snap.to_dict()
    required_keys = [
        "snapshot_id", "workflow_id", "step_id", "risk_level",
        "url", "captured_at", "scroll_position",
        "can_reconstruct", "reconstruction_gaps",
    ]
    for key in required_keys:
        assert key in d, f"Missing key: {key}"


def test_can_reconstruct_true_when_no_gaps():
    page = ControlledMockPage(evaluate_returns={
        "input, select, textarea": {"fields": [
            {"selector": "#email", "field_type": "email", "value": "test@example.com",
             "name": "email", "label": "Email", "is_required": True, "is_visible": True}
        ], "gaps": []},
        "Object.keys(localStorage)": [],
        "Object.keys(sessionStorage)": [],
        "window.scrollX": {"x": 0, "y": 100},
        "activeElement": "#email",
    })
    snap = run(PreActionSnapshotter().capture(page, step_id="s1", risk_level="HIGH"))
    assert snap is not None
    assert snap.can_reconstruct is True
    assert len(snap.reconstruction_gaps) == 0


def test_can_reconstruct_false_when_gaps_exist():
    page = ControlledMockPage(evaluate_returns={
        "input, select, textarea": {
            "fields": [],
            "gaps": ["#richtext (rich text editor — not serializable)"],
        },
        "Object.keys(localStorage)": [],
        "Object.keys(sessionStorage)": [],
        "window.scrollX": {"x": 0, "y": 0},
        "activeElement": None,
    })
    snap = run(PreActionSnapshotter().capture(page, step_id="s1", risk_level="HIGH"))
    assert snap is not None
    assert snap.can_reconstruct is False
    assert len(snap.reconstruction_gaps) == 1


# ── SnapshotRisk enum ─────────────────────────────────────────────────────────

def test_snapshot_risk_values():
    assert SnapshotRisk.MEDIUM == "MEDIUM"
    assert SnapshotRisk.HIGH == "HIGH"
    assert SnapshotRisk.CRITICAL == "CRITICAL"


# ── reconstruct() URL mismatch ────────────────────────────────────────────────

def test_reconstruct_fails_on_url_mismatch():
    snapshotter = PreActionSnapshotter()
    original_page = ControlledMockPage(url="https://original.com")
    snap = run(snapshotter.capture(original_page, step_id="s1", risk_level="HIGH"))
    assert snap is not None

    different_page = ControlledMockPage(url="https://different.com")
    report = run(snapshotter.reconstruct(different_page, snap))
    assert report["success"] is False
    assert "URL mismatch" in report["reason"]
    assert report["fields_restored"] == 0
