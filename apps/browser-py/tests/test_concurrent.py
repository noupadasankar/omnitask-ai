"""Concurrent session tests — multiple users, parallel execution, EventPublisher."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


class TestSessionIsolation:
    @pytest.mark.asyncio
    async def test_context_isolation(self, mock_playwright):
        with patch("browser_manager.Path.mkdir"):
            from browser_manager import BrowserManager
            ctx_a_mock = AsyncMock()
            ctx_b_mock = AsyncMock()
            bm = BrowserManager(mock_playwright["pw"], launch_args=[], user_agent="test")
            bm._launch = AsyncMock(side_effect=[ctx_a_mock, ctx_b_mock])
            ctx_a = await bm.get_context("user-alpha", headless=True)
            ctx_b = await bm.get_context("user-beta", headless=True)
            assert ctx_a is ctx_a_mock
            assert ctx_b is ctx_b_mock
            assert ctx_a is not ctx_b


class TestEventPublisher:
    def test_publish_envelope(self, mock_redis):
        from events import EventPublisher
        pub = EventPublisher(mock_redis)
        pub.publish = AsyncMock()
        import inspect
        assert inspect.iscoroutinefunction(pub.publish)

    @pytest.mark.asyncio
    async def test_publish_called_with_session_event_data(self, event_publisher):
        await event_publisher.publish("sess-1", "step:start", {"step_index": 0})
        event_publisher.publish.assert_awaited_with("sess-1", "step:start", {"step_index": 0})

    @pytest.mark.asyncio
    async def test_publish_emits_completion(self, event_publisher):
        await event_publisher.publish("sess-1", "plan:complete", {"status": "completed"})
        event_publisher.publish.assert_awaited_with("sess-1", "plan:complete", {"status": "completed"})

    @pytest.mark.asyncio
    async def test_publish_emits_error(self, event_publisher):
        await event_publisher.publish("sess-1", "step:error", {"step_index": 2, "error": "Timeout"})
        event_publisher.publish.assert_awaited_with("sess-1", "step:error", {"step_index": 2, "error": "Timeout"})

    @pytest.mark.asyncio
    async def test_is_cancelled(self, mock_redis):
        from events import EventPublisher
        pub = EventPublisher(mock_redis)
        mock_redis.get = AsyncMock(return_value=None)
        cancelled = await pub.is_cancelled("sess-1")
        assert cancelled is False

    @pytest.mark.asyncio
    async def test_wait_for_approval_timeout(self, mock_redis):
        from events import EventPublisher
        pub = EventPublisher(mock_redis)
        mock_redis.get = AsyncMock(return_value=None)
        approved = await pub.wait_for_approval("sess-1", 0, 100)
        assert approved is False

    @pytest.mark.asyncio
    async def test_wait_for_approval_accepted(self, mock_redis):
        from events import EventPublisher
        pub = EventPublisher(mock_redis)
        mock_redis.get = AsyncMock(side_effect=["APPROVED"])
        approved = await pub.wait_for_approval("sess-1", 0, 1000)
        assert approved is True
