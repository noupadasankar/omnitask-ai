"""Tests for executor.py — action execution, error handling, step results."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.mark.asyncio
class TestExecuteAction:
    async def test_navigate_action(self, mock_playwright, event_publisher):
        from executor import execute_action
        step = {"action": "navigate", "value": "https://example.com", "description": "Go"}
        result = await execute_action(mock_playwright["page"], step, event_publisher, "s1")
        mock_playwright["page"].goto.assert_awaited_once_with(
            "https://example.com", wait_until="domcontentloaded", timeout=30_000
        )
        assert "url" in result

    async def test_click_action(self, mock_playwright, event_publisher):
        from executor import execute_action
        step = {"action": "click", "target": "#btn", "description": "Click"}
        result = await execute_action(mock_playwright["page"], step, event_publisher, "s1")
        mock_playwright["page"].click.assert_awaited_once_with("#btn")
        assert result == {"clicked": "#btn"}

    async def test_type_action(self, mock_playwright, event_publisher):
        from executor import execute_action
        step = {"action": "type", "target": "#search", "value": "hello", "description": "Type"}
        result = await execute_action(mock_playwright["page"], step, event_publisher, "s1")
        assert result["typed"] == "hello"

    async def test_extract_text_action(self, mock_playwright, event_publisher):
        from executor import execute_action
        step = {"action": "extract_text", "target": "h1", "description": "Extract"}
        result = await execute_action(mock_playwright["page"], step, event_publisher, "s1")
        assert result["text"] == "Hello World"

    async def test_screenshot_action(self, mock_playwright, event_publisher):
        from executor import execute_action
        step = {"action": "screenshot", "description": "Shot"}
        result = await execute_action(mock_playwright["page"], step, event_publisher, "s1")
        assert "base64" in result

    async def test_scroll_action(self, mock_playwright, event_publisher):
        from executor import execute_action
        step = {"action": "scroll", "value": "500", "description": "Scroll"}
        result = await execute_action(mock_playwright["page"], step, event_publisher, "s1")
        assert result["scrolled"] == 500

    async def test_wait_action(self, mock_playwright, event_publisher):
        from executor import execute_action
        step = {"action": "wait", "value": "100", "description": "Wait"}
        result = await execute_action(mock_playwright["page"], step, event_publisher, "s1")
        assert result["waited"] == 100

    async def test_select_action(self, mock_playwright, event_publisher):
        from executor import execute_action
        step = {"action": "select", "target": "#menu", "value": "opt1", "description": "Select"}
        result = await execute_action(mock_playwright["page"], step, event_publisher, "s1")
        assert result["selected"] == "opt1"

    async def test_hover_action(self, mock_playwright, event_publisher):
        from executor import execute_action
        step = {"action": "hover", "target": "#tooltip", "description": "Hover"}
        result = await execute_action(mock_playwright["page"], step, event_publisher, "s1")
        assert result["hovered"] == "#tooltip"

    async def test_press_key_action(self, mock_playwright, event_publisher):
        from executor import execute_action
        step = {"action": "press_key", "value": "Enter", "description": "Press"}
        result = await execute_action(mock_playwright["page"], step, event_publisher, "s1")
        assert result["pressed"] == "Enter"

    async def test_unknown_action_returns_skipped(self, mock_playwright, event_publisher):
        from executor import execute_action
        step = {"action": "fly", "description": "Unknown"}
        result = await execute_action(mock_playwright["page"], step, event_publisher, "s1")
        assert result["skipped"] is True

    async def test_action_error_propagates(self, mock_playwright, event_publisher):
        from executor import execute_action
        step = {"action": "navigate", "value": "https://bad.example"}
        mock_playwright["page"].goto = AsyncMock(side_effect=Exception("Connection refused"))
        with pytest.raises(Exception, match="Connection refused"):
            await execute_action(mock_playwright["page"], step, event_publisher, "s1")
