"""Crash recovery tests — browser crash handling, page relaunch, _LiveSession."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.mark.asyncio
class TestBrowserCrash:
    async def test_new_page_relaunches_on_dead_context(self, mock_playwright):
        with patch("browser_manager.Path.mkdir"):
            from browser_manager import BrowserManager
            bm = BrowserManager(mock_playwright["pw"], launch_args=[], user_agent="test",
                                default_viewport={"width": 1280, "height": 800})
            ctx = MagicMock()
            ctx.new_page = AsyncMock(side_effect=[Exception("target closed"), mock_playwright["page"]])
            bm._contexts["crash-user"] = ctx
            got_ctx, page = await bm.new_page("crash-user", headless=True)
            assert page is mock_playwright["page"]

    async def test_close_user_removes_context(self, mock_playwright):
        with patch("browser_manager.Path.mkdir"):
            from browser_manager import BrowserManager
            bm = BrowserManager(mock_playwright["pw"], launch_args=[], user_agent="test")
            await bm.get_context("user-crash", headless=True)
            assert "user-crash" in bm._contexts
            await bm.close_user("user-crash")
            assert "user-crash" not in bm._contexts

    async def test_close_all_after_crashes(self, mock_playwright):
        with patch("browser_manager.Path.mkdir"):
            from browser_manager import BrowserManager
            bm = BrowserManager(mock_playwright["pw"], launch_args=[], user_agent="test")
            await bm.get_context("u1", headless=True)
            await bm.get_context("u2", headless=True)
            await bm.close_all()
            assert len(bm._contexts) == 0


@pytest.mark.asyncio
class TestLiveSession:
    async def test_recover_relaunches_page(self, mock_playwright, event_publisher):
        from executor import _LiveSession
        from events import EventPublisher
        manager = MagicMock()
        manager.new_page = AsyncMock(return_value=(mock_playwright["context"], mock_playwright["page"]))
        live = _LiveSession(manager, "user-r", True, event_publisher, "s1")
        live.page = mock_playwright["page"]
        ok = await live.recover()
        assert ok is True

    async def test_recover_exhausts_retries(self, mock_playwright, event_publisher):
        from executor import _LiveSession
        manager = MagicMock()
        manager.new_page = AsyncMock(side_effect=Exception("fail"))
        live = _LiveSession(manager, "user-f", True, event_publisher, "s1")
        live.page = mock_playwright["page"]
        ok = await live.recover()
        assert ok is False

    async def test_recover_tracks_attempts(self, mock_playwright, event_publisher):
        from executor import _LiveSession
        manager = MagicMock()
        manager.new_page = AsyncMock(return_value=(mock_playwright["context"], mock_playwright["page"]))
        live = _LiveSession(manager, "user-t", True, event_publisher, "s1")
        live.page = mock_playwright["page"]
        await live.recover()
        assert live.recoveries == 1


class TestStepRecovery:
    @pytest.mark.asyncio
    async def test_failed_step_raises_error(self, mock_playwright, event_publisher):
        from executor import execute_action
        step = {"action": "navigate", "value": "https://crash.example"}
        mock_playwright["page"].goto = AsyncMock(side_effect=Exception("Browser crashed"))
        with pytest.raises(Exception, match="Browser crashed"):
            await execute_action(mock_playwright["page"], step, event_publisher, "s1")
