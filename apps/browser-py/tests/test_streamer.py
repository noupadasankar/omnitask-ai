"""Tests for Screencaster — CDP stream, interval fallback, rebind, stop."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def _mock_cdp():
    """CDP session: .on() is sync, .send() is async."""
    cdp = MagicMock()
    cdp.send = AsyncMock()
    return cdp


@pytest.mark.asyncio
class TestScreencasterStart:
    async def test_start_cdp_path(self, mock_playwright, event_publisher):
        from streamer import Screencaster
        cdp = _mock_cdp()
        mock_playwright["context"].new_cdp_session = AsyncMock(return_value=cdp)
        sc = Screencaster(mock_playwright["page"], event_publisher, "s1", 1280, 800, 60)
        await sc.start()
        assert sc._running is True
        cdp.send.assert_awaited_once()

    async def test_start_fallback_on_cdp_failure(self, mock_playwright, event_publisher):
        from streamer import Screencaster
        mock_playwright["context"].new_cdp_session = AsyncMock(side_effect=Exception("CDP unavailable"))
        sc = Screencaster(mock_playwright["page"], event_publisher, "s1", 1280, 800, 60)
        await sc.start()
        assert sc._running is True
        assert sc._fallback_task is not None

    async def test_start_fires_title_loop(self, mock_playwright, event_publisher):
        from streamer import Screencaster
        cdp = _mock_cdp()
        mock_playwright["context"].new_cdp_session = AsyncMock(return_value=cdp)
        sc = Screencaster(mock_playwright["page"], event_publisher, "s1", 1024, 768, 50)
        await sc.start()
        assert sc._title_task is not None

    async def test_quality_default(self, mock_playwright, event_publisher):
        from streamer import Screencaster
        sc = Screencaster(mock_playwright["page"], event_publisher, "s1", 1280, 800)
        assert sc.quality == 60


@pytest.mark.asyncio
class TestScreencasterRebind:
    async def test_rebind_stops_old_cdp_and_starts_new(self, mock_playwright, event_publisher):
        from streamer import Screencaster
        cdp = _mock_cdp()
        mock_playwright["context"].new_cdp_session = AsyncMock(return_value=cdp)
        sc = Screencaster(mock_playwright["page"], event_publisher, "s1", 1280, 800)
        sc._cdp = cdp
        new_page = MagicMock()
        await sc.rebind(new_page)
        assert sc.page is new_page
        cdp.send.assert_awaited_with("Page.stopScreencast")

    async def test_rebind_cancels_fallback(self, mock_playwright, event_publisher):
        from streamer import Screencaster
        cdp = _mock_cdp()
        mock_playwright["context"].new_cdp_session = AsyncMock(return_value=cdp)
        sc = Screencaster(mock_playwright["page"], event_publisher, "s1", 1280, 800)
        fallback = MagicMock()
        sc._fallback_task = fallback
        sc._cdp = cdp
        await sc.rebind(MagicMock())
        fallback.cancel.assert_called_once()


@pytest.mark.asyncio
class TestScreencasterStop:
    async def test_stop_sets_running_false(self, mock_playwright, event_publisher):
        from streamer import Screencaster
        cdp = _mock_cdp()
        mock_playwright["context"].new_cdp_session = AsyncMock(return_value=cdp)
        sc = Screencaster(mock_playwright["page"], event_publisher, "s1", 1280, 800)
        sc._cdp = cdp
        sc._running = True
        sc._title_task = MagicMock()
        await sc.stop()
        assert sc._running is False

    async def test_stop_cancels_tasks(self, mock_playwright, event_publisher):
        from streamer import Screencaster
        cdp = _mock_cdp()
        mock_playwright["context"].new_cdp_session = AsyncMock(return_value=cdp)
        sc = Screencaster(mock_playwright["page"], event_publisher, "s1", 1280, 800)
        sc._running = True
        sc._fallback_task = MagicMock()
        sc._title_task = MagicMock()
        sc._cdp = cdp
        await sc.stop()
        sc._fallback_task.cancel.assert_called_once()
        sc._title_task.cancel.assert_called_once()

    async def test_stop_sends_stop_screencast(self, mock_playwright, event_publisher):
        from streamer import Screencaster
        cdp = _mock_cdp()
        mock_playwright["context"].new_cdp_session = AsyncMock(return_value=cdp)
        sc = Screencaster(mock_playwright["page"], event_publisher, "s1", 1280, 800)
        sc._cdp = cdp
        sc._running = True
        sc._title_task = MagicMock()
        await sc.stop()
        cdp.send.assert_awaited_with("Page.stopScreencast")

    async def test_stop_no_cdp_does_not_error(self, mock_playwright, event_publisher):
        from streamer import Screencaster
        sc = Screencaster(mock_playwright["page"], event_publisher, "s1", 1280, 800)
        sc._running = True
        sc._title_task = MagicMock()
        await sc.stop()


@pytest.mark.asyncio
class TestScreencasterFrame:
    async def test_handle_frame_publishes_event(self, mock_playwright, event_publisher):
        from streamer import Screencaster
        import unittest.mock
        cdp = _mock_cdp()
        sc = Screencaster(mock_playwright["page"], event_publisher, "s1", 1280, 800)
        sc._cdp = cdp
        await sc._handle_frame({"data": "base64data", "sessionId": 1})
        event_publisher.publish.assert_awaited_with(
            "s1", "screenshot:frame", unittest.mock.ANY
        )

    async def test_handle_frame_acks_cdp_frame(self, mock_playwright, event_publisher):
        from streamer import Screencaster
        cdp = _mock_cdp()
        sc = Screencaster(mock_playwright["page"], event_publisher, "s1", 1280, 800)
        sc._cdp = cdp
        await sc._handle_frame({"data": "d", "sessionId": 1})
        cdp.send.assert_awaited_with("Page.screencastFrameAck", {"sessionId": 1})

    async def test_publish_error_tracking(self, mock_playwright, event_publisher):
        from streamer import Screencaster
        sc = Screencaster(mock_playwright["page"], event_publisher, "s1", 1280, 800)
        sc._note_publish_error(Exception("Redis down"))
        assert sc._publish_errors == 1
        sc._note_publish_error(Exception("Redis down"))
        assert sc._publish_errors == 2

    async def test_safe_url_returns_empty_on_error(self, mock_playwright, event_publisher):
        from streamer import Screencaster
        sc = Screencaster(mock_playwright["page"], event_publisher, "s1", 1280, 800)
        mock_playwright["page"].url = "https://example.com"
        assert sc._safe_url() == "https://example.com"
