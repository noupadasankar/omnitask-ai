"""Tests for WorkflowOutcome lifecycle and OutcomeManager.

Uses mock ground truth providers from conftest.py — no live browser.
"""

import time
import pytest
from engine.outcome_model import OutcomeState, OutcomeManager, OutcomeEvidence
from engine.tests.conftest import run, AlwaysConfirmsProvider, NeverConfirmsProvider, SlowConfirmsProvider


# ── OutcomeEvidence ────────────────────────────────────────────────────────────

def test_evidence_from_dict_extracts_order_id():
    ev = OutcomeEvidence.from_dict({"order_id": "ORD-123"}, source="confirmation_page", confidence=0.9)
    assert ev.reference_id == "ORD-123"
    assert ev.source == "confirmation_page"
    assert ev.confidence == 0.9


def test_evidence_from_dict_extracts_booking_ref():
    ev = OutcomeEvidence.from_dict({"booking_ref": "BOOK-XYZ"}, source="booking_page", confidence=0.95)
    assert ev.reference_id == "BOOK-XYZ"


def test_evidence_from_dict_no_known_ref():
    ev = OutcomeEvidence.from_dict({"source": "generic"}, source="page", confidence=0.6)
    assert ev.reference_id is None


def test_evidence_to_dict_structure():
    ev = OutcomeEvidence.from_dict({"order_id": "X"}, source="s", confidence=0.8)
    d = ev.to_dict()
    assert "source" in d
    assert "reference_id" in d
    assert "confidence" in d
    assert "timestamp" in d


# ── OutcomeManager — state lifecycle ─────────────────────────────────────────

def test_start_creates_execution_started():
    mgr = OutcomeManager()
    outcome = mgr.start("wf-1", "food")
    assert outcome.state == OutcomeState.EXECUTION_STARTED.value
    assert outcome.domain == "food"
    assert outcome.workflow_id == "wf-1"


def test_mark_actions_completed():
    mgr = OutcomeManager()
    mgr.start("wf-1", "food")
    mgr.mark_actions_completed("wf-1")
    outcome = mgr.get("wf-1")
    assert outcome.state == OutcomeState.ACTIONS_COMPLETED.value
    assert outcome.actions_completed_at is not None


def test_mark_failed():
    mgr = OutcomeManager()
    mgr.start("wf-1", "food")
    mgr.mark_failed("wf-1", "Browser crashed")
    outcome = mgr.get("wf-1")
    assert outcome.state == OutcomeState.FAILED.value
    assert outcome.failure_reason == "Browser crashed"
    assert outcome.is_terminal


def test_state_history_recorded():
    mgr = OutcomeManager()
    mgr.start("wf-1", "food")
    mgr.mark_actions_completed("wf-1")
    mgr.mark_failed("wf-1", "Network error")
    outcome = mgr.get("wf-1")
    assert len(outcome.state_history) == 2
    assert outcome.state_history[0]["to"] == OutcomeState.ACTIONS_COMPLETED.value


def test_is_terminal_for_confirmed():
    mgr = OutcomeManager()
    outcome = mgr.start("wf-1", "food")
    outcome.transition(OutcomeState.CONFIRMED)
    assert outcome.is_terminal


def test_is_terminal_for_unconfirmed():
    mgr = OutcomeManager()
    outcome = mgr.start("wf-1", "food")
    outcome.transition(OutcomeState.UNCONFIRMED)
    assert outcome.is_terminal


def test_is_not_terminal_for_pending():
    mgr = OutcomeManager()
    outcome = mgr.start("wf-1", "food")
    outcome.transition(OutcomeState.CONFIRMATION_PENDING)
    assert not outcome.is_terminal


def test_duration_ms_positive():
    mgr = OutcomeManager()
    mgr.start("wf-1", "food")
    time.sleep(0.01)
    outcome = mgr.get("wf-1")
    assert outcome.duration_ms > 0


def test_to_dict_structure():
    mgr = OutcomeManager()
    mgr.start("wf-1", "food")
    mgr.mark_actions_completed("wf-1")
    d = mgr.get("wf-1").to_dict()
    assert d["workflow_id"] == "wf-1"
    assert d["domain"] == "food"
    assert "state" in d
    assert "is_terminal" in d
    assert "duration_ms" in d
    assert "state_history" in d


def test_get_returns_none_for_unknown():
    mgr = OutcomeManager()
    assert mgr.get("nonexistent") is None


# ── OutcomeManager.verify_outcome ─────────────────────────────────────────────

def test_verify_outcome_confirmed():
    mgr = OutcomeManager()
    mgr.start("wf-1", "food")
    mgr.mark_actions_completed("wf-1")
    outcome = run(mgr.verify_outcome("wf-1", AlwaysConfirmsProvider(), {}))
    assert outcome.state == OutcomeState.CONFIRMED.value
    assert outcome.is_terminal
    assert outcome.confirmation_result is not None
    assert outcome.confirmation_result.confirmed


def test_verify_outcome_unconfirmed_short_timeout():
    mgr = OutcomeManager()
    mgr.start("wf-1", "food")
    mgr.mark_actions_completed("wf-1")
    outcome = run(mgr.verify_outcome("wf-1", NeverConfirmsProvider(), {}))
    # Short timeout → UNCONFIRMED (not FAILED)
    assert outcome.state == OutcomeState.UNCONFIRMED.value
    assert outcome.is_terminal


def test_verify_outcome_confirmation_pending_long_timeout():
    mgr = OutcomeManager()
    mgr.start("wf-1", "job")
    mgr.mark_actions_completed("wf-1")
    outcome = run(mgr.verify_outcome("wf-1", SlowConfirmsProvider(), {}))
    # Long timeout provider that never confirms → CONFIRMATION_PENDING
    assert outcome.state == OutcomeState.CONFIRMATION_PENDING.value
    assert not outcome.is_terminal   # pending is not terminal


def test_verify_outcome_skips_failed_workflow():
    mgr = OutcomeManager()
    mgr.start("wf-1", "food")
    mgr.mark_failed("wf-1", "crashed")
    outcome = run(mgr.verify_outcome("wf-1", AlwaysConfirmsProvider(), {}))
    # FAILED should block verify_outcome from overwriting state
    assert outcome.state == OutcomeState.FAILED.value


def test_verify_outcome_unknown_workflow_raises():
    mgr = OutcomeManager()
    with pytest.raises(KeyError):
        run(mgr.verify_outcome("ghost-wf", AlwaysConfirmsProvider(), {}))


def test_get_all_returns_list():
    mgr = OutcomeManager()
    mgr.start("wf-1", "food")
    mgr.start("wf-2", "job")
    all_outcomes = mgr.get_all()
    assert len(all_outcomes) == 2
    assert all(isinstance(o, dict) for o in all_outcomes)
