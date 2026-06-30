"""Self-healing tests — DOM extraction, crash detection, healing pipeline."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


class TestRawDomExtraction:
    @pytest.mark.asyncio
    async def test_extract_raw_dom_returns_list(self, mock_playwright):
        from dom import extract_raw_dom
        result = await extract_raw_dom(mock_playwright["page"])
        assert isinstance(result, list)

    @pytest.mark.asyncio
    async def test_extract_raw_dom_returns_empty_on_error(self, mock_playwright):
        from dom import extract_raw_dom
        mock_playwright["page"].evaluate = AsyncMock(side_effect=Exception("fail"))
        result = await extract_raw_dom(mock_playwright["page"])
        assert result == []

    @pytest.mark.asyncio
    async def test_extract_raw_dom_includes_visibility(self, mock_playwright):
        from dom import extract_raw_dom
        mock_playwright["page"].evaluate = AsyncMock(return_value=[
            {"id": "node_0", "tag": "button", "visible": True, "text": "Submit"},
        ])
        result = await extract_raw_dom(mock_playwright["page"])
        assert result[0]["visible"] is True
        assert result[0]["tag"] == "button"


class TestCrashDetection:
    def test_is_crash_error_detects_crash(self):
        from executor import _is_crash_error
        assert _is_crash_error(Exception("target page, context or browser has been closed")) is True

    def test_is_crash_error_detects_crash_word(self):
        from executor import _is_crash_error
        assert _is_crash_error(Exception("browser crash")) is True

    def test_is_crash_error_ignores_normal_error(self):
        from executor import _is_crash_error
        assert _is_crash_error(Exception("Element not found")) is False

    def test_is_crash_error_ignores_timeout(self):
        from executor import _is_crash_error
        assert _is_crash_error(Exception("Timeout 30000ms exceeded")) is False


class TestHealingPipeline:
    @pytest.mark.asyncio
    async def test_healing_skipped_when_no_healing_returned(self, mock_playwright, event_publisher):
        from executor import _attempt_healing
        step = {"action": "click", "target": "#ghost", "description": "Click ghost"}
        result = await _attempt_healing(
            mock_playwright["page"], step, 0, 0,
            Exception("not found"), event_publisher, "s1", [],
        )
        assert result is False

    @pytest.mark.asyncio
    async def test_healing_returns_true_when_verdict_says_healed(self, mock_playwright, event_publisher):
        from executor import _attempt_healing
        event_publisher.wait_for_healing = AsyncMock(return_value={
            "healed": True, "recoveryType": "alternative_selector",
            "alternativeSelector": "#new-btn", "explanation": "Found alt",
        })
        step = {"action": "click", "target": "#ghost", "description": "Click ghost"}
        results = []
        ok = await _attempt_healing(
            mock_playwright["page"], step, 0, 0,
            Exception("not found"), event_publisher, "s1", results,
        )
        assert ok is True
        assert len(results) == 1
        assert results[0]["success"] is True

    @pytest.mark.asyncio
    async def test_recovery_steps_executed_before_retry(self, mock_playwright, event_publisher):
        from executor import _attempt_healing
        event_publisher.wait_for_healing = AsyncMock(return_value={
            "healed": True, "recoveryType": "navigate_back",
            "recoverySteps": [{"action": "navigate", "value": "https://example.com", "description": "nav"}],
            "explanation": "Navigated back",
        })
        step = {"action": "click", "target": "#btn", "description": "Click"}
        results = []
        ok = await _attempt_healing(
            mock_playwright["page"], step, 1, 0,
            Exception("crash"), event_publisher, "s1", results,
        )
        assert ok is True
