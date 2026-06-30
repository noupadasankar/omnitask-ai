"""pytest fixtures for the browser-py engine."""

import os
import sys
import asyncio
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


@pytest.fixture(autouse=True)
def clear_env():
    old = dict(os.environ)
    yield
    os.environ.clear()
    os.environ.update(old)


@pytest.fixture
def mock_openai():
    with patch.dict(os.environ, {"OPENAI_API_KEY": "sk-test-key"}):
        with patch.dict("sys.modules", {"openai": MagicMock()}):
            yield


@pytest.fixture
def mock_playwright():
    mock_page = AsyncMock()
    mock_page.goto = AsyncMock()
    mock_page.evaluate = AsyncMock(return_value=[])
    mock_page.title = AsyncMock(return_value="Test Page")
    mock_page.content = AsyncMock(return_value="<html><body>Test</body></html>")
    mock_page.viewport_size = {"width": 1280, "height": 800}
    mock_page.is_closed = MagicMock(return_value=False)
    mock_page.query_selector = MagicMock(return_value=None)
    mock_page.query_selector_all = MagicMock(return_value=[])
    mock_page.wait_for_selector = AsyncMock()
    mock_page.click = AsyncMock()
    mock_page.fill = AsyncMock()
    mock_page.screenshot = AsyncMock(return_value=b"image-data")
    mock_page.text_content = AsyncMock(return_value="Hello World")
    mock_page.eval_on_selector = AsyncMock(return_value="Hello World")
    mock_page.set_viewport_size = AsyncMock()
    mock_page.keyboard = MagicMock()
    mock_page.keyboard.press = AsyncMock()
    mock_page.keyboard.type = AsyncMock()

    mock_context = AsyncMock()
    mock_context.new_page = AsyncMock(return_value=mock_page)
    mock_context.pages = [mock_page]
    mock_context.close = AsyncMock()
    mock_context.on = MagicMock()  # Playwright .on() is sync, not async

    mock_page.context = mock_context

    mock_browser = AsyncMock()
    mock_browser.new_context = AsyncMock(return_value=mock_context)
    mock_browser.launch_persistent_context = AsyncMock(return_value=mock_context)
    mock_browser.close = AsyncMock()

    mock_pw = AsyncMock()
    mock_pw.chromium = AsyncMock()
    mock_pw.chromium.launch = AsyncMock(return_value=mock_browser)
    mock_pw.chromium.launch_persistent_context = AsyncMock(return_value=mock_context)

    yield {
        "pw": mock_pw,
        "browser": mock_browser,
        "context": mock_context,
        "page": mock_page,
    }


@pytest.fixture
def mock_redis():
    return AsyncMock()


@pytest.fixture
def event_publisher(mock_redis):
    from events import EventPublisher
    pub = EventPublisher(mock_redis)
    pub.publish = AsyncMock()
    pub.is_cancelled = AsyncMock(return_value=False)
    pub.wait_for_approval = AsyncMock(return_value=True)
    pub.wait_for_healing = AsyncMock(return_value=None)
    return pub


@pytest.fixture
def sample_plan():
    return [
        {"action": "navigate", "value": "https://example.com", "description": "Go to example"},
        {"action": "click", "target": "#submit", "description": "Click submit"},
        {"action": "extract_text", "target": "h1", "description": "Get heading"},
    ]


@pytest.fixture
def event_loop():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    yield loop
    loop.close()
