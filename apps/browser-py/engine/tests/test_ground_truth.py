"""Tests for ground truth providers.

Uses ControlledMockPage to inject specific DOM content per scenario.
All assertions check confirmed/pending decisions, not page parsing internals.
"""

import pytest
from engine.ground_truth import (
    FoodOrderGroundTruth,
    JobApplicationGroundTruth,
    TravelBookingGroundTruth,
    ShoppingOrderGroundTruth,
    EmailSentGroundTruth,
    GenericGroundTruth,
    get_ground_truth_provider,
)
from engine.tests.conftest import run, ControlledMockPage


# ── get_ground_truth_provider ─────────────────────────────────────────────────

def test_registry_food():
    p = get_ground_truth_provider("food")
    assert isinstance(p, FoodOrderGroundTruth)


def test_registry_job():
    p = get_ground_truth_provider("job")
    assert isinstance(p, JobApplicationGroundTruth)


def test_registry_travel():
    p = get_ground_truth_provider("travel")
    assert isinstance(p, TravelBookingGroundTruth)


def test_registry_shopping():
    p = get_ground_truth_provider("shopping")
    assert isinstance(p, ShoppingOrderGroundTruth)


def test_registry_email():
    p = get_ground_truth_provider("email")
    assert isinstance(p, EmailSentGroundTruth)


def test_registry_unknown_falls_back_to_generic():
    p = get_ground_truth_provider("unknown_domain")
    assert isinstance(p, GenericGroundTruth)


def test_registry_case_insensitive():
    assert isinstance(get_ground_truth_provider("FOOD"), FoodOrderGroundTruth)
    assert isinstance(get_ground_truth_provider("Job"), JobApplicationGroundTruth)


# ── Provider attributes ───────────────────────────────────────────────────────

def test_food_timeout_and_retry():
    p = FoodOrderGroundTruth()
    assert p.confirmation_timeout() > 0
    assert isinstance(p.retry_schedule(), list)


def test_job_has_longer_timeout_than_food():
    food = FoodOrderGroundTruth()
    job = JobApplicationGroundTruth()
    assert job.confirmation_timeout() > food.confirmation_timeout()


def test_travel_has_short_timeout():
    p = TravelBookingGroundTruth()
    assert p.confirmation_timeout() <= 30   # travel confirms immediately


# ── FoodOrderGroundTruth ──────────────────────────────────────────────────────

def test_food_confirms_on_order_confirmed_text():
    page = ControlledMockPage(evaluate_returns={
        "document.body.innerText": {"confirmed": True, "order_id": "FOOD-123"}
    })
    result = run(FoodOrderGroundTruth().check_confirmation({"page": page}))
    assert result.confirmed
    assert result.confidence > 0.8


def test_food_pending_when_no_confirmation():
    page = ControlledMockPage(evaluate_returns={
        "document.body.innerText": {"confirmed": False, "order_id": None}
    })
    result = run(FoodOrderGroundTruth().check_confirmation({"page": page}))
    assert not result.confirmed


def test_food_pending_when_no_page():
    result = run(FoodOrderGroundTruth().check_confirmation({}))
    assert not result.confirmed
    assert "No page" in result.reason


# ── JobApplicationGroundTruth ─────────────────────────────────────────────────

def test_job_confirms_on_submitted_text():
    page = ControlledMockPage(evaluate_returns={
        "document.body.innerText": {
            "submitted": True,
            "on_confirm": False,
            "application_id": "APP-456",
        }
    })
    result = run(JobApplicationGroundTruth().check_confirmation({"page": page}))
    assert result.confirmed


def test_job_confirms_on_confirm_url():
    page = ControlledMockPage(evaluate_returns={
        "document.body.innerText": {
            "submitted": False,
            "on_confirm": True,
            "application_id": None,
        }
    })
    result = run(JobApplicationGroundTruth().check_confirmation({"page": page}))
    assert result.confirmed


def test_job_pending_when_no_signal():
    page = ControlledMockPage(evaluate_returns={
        "document.body.innerText": {
            "submitted": False,
            "on_confirm": False,
            "application_id": None,
        }
    })
    result = run(JobApplicationGroundTruth().check_confirmation({"page": page}))
    assert not result.confirmed
    assert "ATS" in result.reason


# ── TravelBookingGroundTruth ──────────────────────────────────────────────────

def test_travel_confirms_with_booking_ref():
    page = ControlledMockPage(evaluate_returns={
        "document.body.innerText": {"confirmed": True, "booking_ref": "BOOK-XYZ99"}
    })
    result = run(TravelBookingGroundTruth().check_confirmation({"page": page}))
    assert result.confirmed
    assert result.confidence >= 0.9


def test_travel_pending_without_reference():
    page = ControlledMockPage(evaluate_returns={
        "document.body.innerText": {"confirmed": False, "booking_ref": None}
    })
    result = run(TravelBookingGroundTruth().check_confirmation({"page": page}))
    assert not result.confirmed


# ── GenericGroundTruth ────────────────────────────────────────────────────────

def test_generic_confirms_with_success_signal():
    page = ControlledMockPage(evaluate_returns={
        "document.body.innerText": {"has_success": True, "has_error": False}
    })
    result = run(GenericGroundTruth().check_confirmation({"page": page}))
    assert result.confirmed


def test_generic_pending_when_error_present():
    page = ControlledMockPage(evaluate_returns={
        "document.body.innerText": {"has_success": True, "has_error": True}
    })
    result = run(GenericGroundTruth().check_confirmation({"page": page}))
    assert not result.confirmed


def test_generic_confidence_lower_than_domain_specific():
    generic = GenericGroundTruth()
    food = FoodOrderGroundTruth()
    # Generic heuristic should have lower base confidence ceiling
    page_ok = ControlledMockPage(evaluate_returns={
        "document.body.innerText": {"has_success": True, "has_error": False}
    })
    page_food = ControlledMockPage(evaluate_returns={
        "document.body.innerText": {"confirmed": True, "order_id": "X"}
    })
    r_generic = run(generic.check_confirmation({"page": page_ok}))
    r_food = run(food.check_confirmation({"page": page_food}))
    assert r_generic.confidence < r_food.confidence


# ── ConfirmationResult structure ──────────────────────────────────────────────

def test_confirmation_result_has_required_fields():
    page = ControlledMockPage(evaluate_returns={
        "document.body.innerText": {"confirmed": True, "order_id": "X"}
    })
    result = run(FoodOrderGroundTruth().check_confirmation({"page": page}))
    assert hasattr(result, "confirmed")
    assert hasattr(result, "confidence")
    assert hasattr(result, "evidence")
    assert hasattr(result, "reason")
    assert hasattr(result, "checked_at")
    assert 0.0 <= result.confidence <= 1.0
