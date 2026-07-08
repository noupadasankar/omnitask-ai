"""Tests for ConfidenceModel and StepConfidence.

All tests are synchronous — no browser, no async.
"""

import pytest
from engine.confidence_model import ConfidenceModel, StepConfidence, _WEIGHTS


# ── Helpers ───────────────────────────────────────────────────────────────────

def perfect_step(step_id="s1", is_critical=False) -> StepConfidence:
    return StepConfidence(
        step_id=step_id,
        action_type="click",
        is_critical_path=is_critical,
        selector_stability=1.0,
        verification=1.0,
        fallback_usage=1.0,
        recovery_attempts=1.0,
        manual_intervention=1.0,
    )


def step_with(step_id="s1", is_critical=False, **signals) -> StepConfidence:
    defaults = dict(
        selector_stability=1.0,
        verification=1.0,
        fallback_usage=1.0,
        recovery_attempts=1.0,
        manual_intervention=1.0,
    )
    defaults.update(signals)
    return StepConfidence(
        step_id=step_id,
        action_type="click",
        is_critical_path=is_critical,
        **defaults,
    )


# ── StepConfidence ────────────────────────────────────────────────────────────

def test_perfect_step_confidence_is_one():
    assert perfect_step().confidence == 1.0


def test_weights_sum_to_one():
    total = sum(_WEIGHTS.values())
    assert abs(total - 1.0) < 1e-9


def test_failed_verification_penalty():
    step = step_with(verification=0.0)
    expected = 1.0 - _WEIGHTS["verification"]
    assert abs(step.confidence - expected) < 0.001


def test_all_zero_signals_confidence_is_zero():
    step = step_with(
        selector_stability=0.0,
        verification=0.0,
        fallback_usage=0.0,
        recovery_attempts=0.0,
        manual_intervention=0.0,
    )
    assert step.confidence == 0.0


def test_confidence_clamped_to_zero_one():
    # All signals at 1.0 should stay at 1.0, never exceed
    assert perfect_step().confidence <= 1.0
    step = step_with(
        selector_stability=0.0,
        verification=0.0,
        fallback_usage=0.0,
        recovery_attempts=0.0,
        manual_intervention=0.0,
    )
    assert step.confidence >= 0.0


def test_to_dict_contains_all_signals():
    d = perfect_step().to_dict()
    assert "confidence" in d
    assert "signals" in d
    for key in _WEIGHTS:
        assert key in d["signals"]


# ── ConfidenceModel ───────────────────────────────────────────────────────────

def test_empty_model_returns_zero():
    model = ConfidenceModel()
    assert model.workflow_confidence() == 0.0


def test_all_perfect_critical_steps():
    model = ConfidenceModel()
    for i in range(4):
        model.record_step(perfect_step(f"s{i}", is_critical=True))
    assert model.workflow_confidence() == 1.0


def test_critical_path_floor_enforced():
    model = ConfidenceModel()
    model.record_step(perfect_step("s1", is_critical=True))
    weak = step_with("s2", is_critical=True, verification=0.0)  # confidence = 0.65
    model.record_step(weak)
    wc = model.workflow_confidence()
    assert wc <= weak.confidence, f"workflow={wc} should not exceed critical floor {weak.confidence}"


def test_non_critical_steps_have_no_floor_effect():
    model = ConfidenceModel()
    model.record_step(perfect_step("s1", is_critical=True))
    weak_non_critical = step_with("s2", is_critical=False, verification=0.0)
    model.record_step(weak_non_critical)
    wc = model.workflow_confidence()
    # Floor only applies to critical steps; non-critical weakness is diluted, not capping
    assert wc > weak_non_critical.confidence


def test_no_critical_steps_uses_avg():
    model = ConfidenceModel()
    model.record_step(step_with("s1", is_critical=False, verification=0.0))  # 0.65
    model.record_step(perfect_step("s2", is_critical=False))                  # 1.0
    wc = model.workflow_confidence()
    assert 0.65 < wc < 1.0


def test_steps_below_threshold():
    model = ConfidenceModel()
    model.record_step(step_with("s1", verification=0.0))    # 0.65 — below 0.8
    model.record_step(perfect_step("s2"))                    # 1.0 — above 0.8
    below = model.steps_below_threshold(0.8)
    assert len(below) == 1
    assert below[0].step_id == "s1"


def test_lowest_confidence_step():
    model = ConfidenceModel()
    model.record_step(perfect_step("s1"))
    model.record_step(step_with("s2", verification=0.0))
    low = model.lowest_confidence_step()
    assert low.step_id == "s2"


def test_summary_structure():
    model = ConfidenceModel()
    model.record_step(perfect_step("s1", is_critical=True))
    s = model.summary()
    assert "workflow_confidence" in s
    assert "step_count" in s
    assert "critical_path_steps" in s
    assert s["step_count"] == 1
    assert s["critical_path_steps"] == 1


# ── Temporal decay ────────────────────────────────────────────────────────────

def test_decayed_confidence_at_zero_hours():
    model = ConfidenceModel()
    model.record_step(perfect_step("s1", is_critical=True))
    assert model.decayed_confidence(0.0) == pytest.approx(1.0, abs=0.001)


def test_decayed_confidence_decreases_with_time():
    model = ConfidenceModel()
    model.record_step(perfect_step("s1", is_critical=True))
    c0 = model.decayed_confidence(0.0)
    c24 = model.decayed_confidence(24.0)
    assert c24 < c0
    assert c24 > 0.4   # should not drop to near-zero at 24h


def test_decayed_confidence_never_negative():
    model = ConfidenceModel()
    model.record_step(perfect_step("s1", is_critical=True))
    assert model.decayed_confidence(10000.0) >= 0.0


# ── from_step_record ──────────────────────────────────────────────────────────

class _FakeRecord:
    def __init__(self, step_id="r1", action="click", recovery=0, verif="passed"):
        self.step_id = step_id
        self.action = action
        self.recovery_attempts = recovery
        self.verification_result = verif


def test_from_step_record_perfect():
    step = ConfidenceModel.from_step_record(_FakeRecord(recovery=0, verif="passed"))
    assert step.verification == 1.0
    assert step.recovery_attempts == 1.0
    assert step.confidence == pytest.approx(
        1.0 * _WEIGHTS["selector_stability"]
        + 1.0 * _WEIGHTS["verification"]
        + 1.0 * _WEIGHTS["fallback_usage"]
        + 1.0 * _WEIGHTS["recovery_attempts"]
        + 1.0 * _WEIGHTS["manual_intervention"],
        abs=0.001,
    )


def test_from_step_record_with_two_recoveries_and_failed_verif():
    step = ConfidenceModel.from_step_record(_FakeRecord(recovery=2, verif="failed"))
    assert step.verification == 0.0
    assert step.recovery_attempts == 0.0
    assert step.confidence < 0.5


def test_from_step_record_skipped_verif():
    step = ConfidenceModel.from_step_record(_FakeRecord(recovery=0, verif=None))
    assert step.verification == 0.5
