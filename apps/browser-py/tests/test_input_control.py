"""Tests for InputController — remote input dispatch, file upload, lifecycle."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.mark.asyncio
class TestInputControllerStartStop:
    async def test_start_subscribes_to_channel(self, mock_playwright, mock_redis):
        from input_control import InputController
        ctl = InputController(mock_playwright["page"], mock_redis, "s1")
        await ctl.start()
        mock_redis.pubsub.assert_called_once()

    async def test_start_unavailable_does_not_crash(self, mock_playwright, mock_redis):
        from input_control import InputController
        mock_redis.pubsub = MagicMock(side_effect=Exception("Redis down"))
        ctl = InputController(mock_playwright["page"], mock_redis, "s1")
        await ctl.start()

    async def test_stop_cancels_task(self, mock_playwright, mock_redis):
        from input_control import InputController
        ctl = InputController(mock_playwright["page"], mock_redis, "s1")
        ctl._task = MagicMock()
        ctl._pubsub = MagicMock()
        ctl._pubsub.unsubscribe = AsyncMock()
        ctl._pubsub.close = AsyncMock()
        await ctl.stop()
        ctl._task.cancel.assert_called_once()

    async def test_stop_unsubscribes(self, mock_playwright, mock_redis):
        from input_control import InputController
        ctl = InputController(mock_playwright["page"], mock_redis, "s1")
        ctl._task = MagicMock()
        ctl._pubsub = MagicMock()
        ctl._pubsub.unsubscribe = AsyncMock()
        ctl._pubsub.close = AsyncMock()
        await ctl.stop()
        ctl._pubsub.unsubscribe.assert_awaited_once()


@pytest.mark.asyncio
class TestInputControllerRebind:
    async def test_rebind_swaps_page(self, mock_playwright, mock_redis):
        from input_control import InputController
        ctl = InputController(mock_playwright["page"], mock_redis, "s1")
        new_page = MagicMock()
        ctl.rebind(new_page)
        assert ctl.page is new_page

    async def test_rebind_clears_pending_file_chooser(self, mock_playwright, mock_redis):
        from input_control import InputController
        ctl = InputController(mock_playwright["page"], mock_redis, "s1")
        ctl.pending_file_chooser = MagicMock()
        ctl.rebind(MagicMock())
        assert ctl.pending_file_chooser is None


@pytest.mark.asyncio
class TestInputControllerDispatch:
    async def test_click(self, mock_playwright, mock_redis):
        from input_control import InputController
        ctl = InputController(mock_playwright["page"], mock_redis, "s1")
        await ctl._dispatch({"type": "click", "x": 100, "y": 200})
        mock_playwright["page"].mouse.click.assert_awaited_with(100.0, 200.0)

    async def test_mousemove(self, mock_playwright, mock_redis):
        from input_control import InputController
        ctl = InputController(mock_playwright["page"], mock_redis, "s1")
        await ctl._dispatch({"type": "mousemove", "x": 50, "y": 60})
        mock_playwright["page"].mouse.move.assert_awaited_with(50.0, 60.0)

    async def test_mousedown(self, mock_playwright, mock_redis):
        from input_control import InputController
        ctl = InputController(mock_playwright["page"], mock_redis, "s1")
        await ctl._dispatch({"type": "mousedown", "x": 10, "y": 20})
        mock_playwright["page"].mouse.down.assert_awaited_once()

    async def test_mouseup(self, mock_playwright, mock_redis):
        from input_control import InputController
        ctl = InputController(mock_playwright["page"], mock_redis, "s1")
        await ctl._dispatch({"type": "mouseup"})
        mock_playwright["page"].mouse.up.assert_awaited_once()

    async def test_wheel(self, mock_playwright, mock_redis):
        from input_control import InputController
        ctl = InputController(mock_playwright["page"], mock_redis, "s1")
        await ctl._dispatch({"type": "wheel", "deltaY": 100})
        mock_playwright["page"].mouse.wheel.assert_awaited_with(0.0, 100.0)

    async def test_type(self, mock_playwright, mock_redis):
        from input_control import InputController
        ctl = InputController(mock_playwright["page"], mock_redis, "s1")
        await ctl._dispatch({"type": "type", "text": "hello"})
        mock_playwright["page"].keyboard.type.assert_awaited_with("hello")

    async def test_key(self, mock_playwright, mock_redis):
        from input_control import InputController
        ctl = InputController(mock_playwright["page"], mock_redis, "s1")
        await ctl._dispatch({"type": "key", "key": "Enter"})
        mock_playwright["page"].keyboard.press.assert_awaited_with("Enter")

    async def test_key_empty_skipped(self, mock_playwright, mock_redis):
        from input_control import InputController
        ctl = InputController(mock_playwright["page"], mock_redis, "s1")
        await ctl._dispatch({"type": "key", "key": ""})
        mock_playwright["page"].keyboard.press.assert_not_called()

    async def test_navigate(self, mock_playwright, mock_redis):
        from input_control import InputController
        ctl = InputController(mock_playwright["page"], mock_redis, "s1")
        await ctl._dispatch({"type": "navigate", "url": "https://example.com"})
        mock_playwright["page"].goto.assert_awaited_with(
            "https://example.com", wait_until="domcontentloaded", timeout=30_000,
        )

    async def test_back(self, mock_playwright, mock_redis):
        from input_control import InputController
        ctl = InputController(mock_playwright["page"], mock_redis, "s1")
        await ctl._dispatch({"type": "back"})
        mock_playwright["page"].go_back.assert_awaited_once()

    async def test_forward(self, mock_playwright, mock_redis):
        from input_control import InputController
        ctl = InputController(mock_playwright["page"], mock_redis, "s1")
        await ctl._dispatch({"type": "forward"})
        mock_playwright["page"].go_forward.assert_awaited_once()

    async def test_reload(self, mock_playwright, mock_redis):
        from input_control import InputController
        ctl = InputController(mock_playwright["page"], mock_redis, "s1")
        await ctl._dispatch({"type": "reload"})
        mock_playwright["page"].reload.assert_awaited_once()

    async def test_rightclick(self, mock_playwright, mock_redis):
        from input_control import InputController
        ctl = InputController(mock_playwright["page"], mock_redis, "s1")
        await ctl._dispatch({"type": "rightclick", "x": 30, "y": 40})
        mock_playwright["page"].mouse.click.assert_awaited_with(30.0, 40.0, button="right")

    async def test_dblclick(self, mock_playwright, mock_redis):
        from input_control import InputController
        ctl = InputController(mock_playwright["page"], mock_redis, "s1")
        await ctl._dispatch({"type": "dblclick", "x": 5, "y": 10})
        mock_playwright["page"].mouse.dblclick.assert_awaited_with(5.0, 10.0)

    async def test_unknown_type_silently_ignored(self, mock_playwright, mock_redis):
        from input_control import InputController
        ctl = InputController(mock_playwright["page"], mock_redis, "s1")
        await ctl._dispatch({"type": "unknown_type"})

    async def test_closed_page_skips_dispatch(self, mock_playwright, mock_redis):
        from input_control import InputController
        mock_playwright["page"].is_closed = MagicMock(return_value=True)
        ctl = InputController(mock_playwright["page"], mock_redis, "s1")
        await ctl._dispatch({"type": "click", "x": 0, "y": 0})
        mock_playwright["page"].mouse.click.assert_not_called()


@pytest.mark.asyncio
class TestInputControllerFileUpload:
    async def test_file_upload_no_b64_skipped(self, mock_playwright, mock_redis):
        from input_control import InputController
        ctl = InputController(mock_playwright["page"], mock_redis, "s1")
        await ctl._handle_file_upload({"filename": "test.txt"})

    async def test_file_upload_no_pending_chooser(self, mock_playwright, mock_redis):
        from input_control import InputController
        ctl = InputController(mock_playwright["page"], mock_redis, "s1")
        await ctl._handle_file_upload({"base64": "dGVzdA==", "filename": "test.txt"})

    async def test_file_upload_with_chooser(self, mock_playwright, mock_redis):
        from input_control import InputController
        import tempfile
        ctl = InputController(mock_playwright["page"], mock_redis, "s1")
        chooser = AsyncMock()
        ctl.pending_file_chooser = chooser
        with patch("tempfile.NamedTemporaryFile") as mock_tmp:
            mock_tmp.return_value.__enter__ = MagicMock(return_value=mock_tmp.return_value)
            mock_tmp.return_value.name = "upload.txt"
            await ctl._handle_file_upload({"base64": "dGVzdA==", "filename": "test.txt"})
            assert ctl.pending_file_chooser is None
