"""Fixture replay — offline mock pages from FixtureBundles for unit testing.

Allows DOM extraction, accessibility, and storage inspection code to be
tested without a live browser. MockPage responds to the same evaluate()
expressions used by the engine; it cannot simulate clicks or navigation.
"""

import base64
import hashlib
import logging
import time
from typing import Any, Optional

log = logging.getLogger("browser-py.engine.fixture_replay")


class MockLocator:
    """Minimal locator that works against pre-captured data."""

    def __init__(self, selector: str, elements: Optional[list] = None):
        self._selector = selector
        self._elements = elements or []

    async def count(self) -> int:
        return len(self._elements)

    async def first(self) -> Optional["MockElement"]:
        return MockElement(self._elements[0]) if self._elements else None

    async def all(self) -> list:
        return [MockElement(e) for e in self._elements]

    async def is_visible(self) -> bool:
        return len(self._elements) > 0

    async def inner_text(self) -> str:
        return self._elements[0].get("text", "") if self._elements else ""


class MockElement:
    def __init__(self, data: dict):
        self._data = data

    async def inner_text(self) -> str:
        return self._data.get("text", "")

    async def get_attribute(self, name: str) -> Optional[str]:
        return self._data.get("attributes", {}).get(name)

    async def is_visible(self) -> bool:
        return self._data.get("visible", True)

    async def is_enabled(self) -> bool:
        return self._data.get("enabled", True)


class _MockAccessibility:
    def __init__(self, tree: dict):
        self._tree = tree

    async def snapshot(self) -> dict:
        return self._tree


class _MockContext:
    def __init__(self, cookies: list):
        self._cookies = cookies

    async def cookies(self) -> list:
        return self._cookies


class MockPage:
    """Offline page-like object backed by a FixtureBundle.

    Supports evaluate(), locator(), content(), screenshot(), and
    accessibility snapshot without a live browser. Suitable for unit
    tests of DOM extraction, semantic page analysis, and verifier logic.
    """

    def __init__(self, bundle):
        self._bundle = bundle

    @property
    def url(self) -> str:
        return self._bundle.url

    @property
    def viewport_size(self) -> dict:
        return self._bundle.viewport

    @property
    def accessibility(self) -> _MockAccessibility:
        return _MockAccessibility(self._bundle.accessibility_tree)

    @property
    def context(self) -> _MockContext:
        return _MockContext(self._bundle.storage.get("cookies", []))

    async def evaluate(self, expression: str, arg: Any = None) -> Any:
        """Handle the evaluate() patterns used by engine modules."""
        expr = expression.strip()
        if "document.documentElement.outerHTML" in expr:
            return self._bundle.dom_html
        if "querySelectorAll('*').length" in expr:
            return self._bundle.element_count
        if "document.body.innerText" in expr or "document.body.innerHTML" in expr:
            return self._bundle.accessibility_tree.get("name", "")
        if "localStorage" in expr:
            return self._bundle.storage.get("local_storage", {})
        if "sessionStorage" in expr:
            return self._bundle.storage.get("session_storage", {})
        if "window.__consoleLogs" in expr:
            return self._bundle.console_logs
        if "window.__domChanges" in expr:
            return []
        return None

    def locator(self, selector: str) -> MockLocator:
        return MockLocator(selector)

    async def content(self) -> str:
        return self._bundle.dom_html

    async def screenshot(self, **kwargs) -> bytes:
        if self._bundle.screenshot_b64:
            return base64.b64decode(self._bundle.screenshot_b64)
        return b""

    async def wait_for_load_state(self, state: str = "load", timeout: int = 30000) -> None:
        return

    async def wait_for_selector(self, selector: str, **kwargs) -> None:
        return


class FixtureReplayer:
    """Creates MockPage instances from FixtureBundles for offline testing."""

    def create_mock_page(self, bundle) -> MockPage:
        return MockPage(bundle)

    def create_mock_page_from_html(
        self,
        html: str,
        url: str = "about:blank",
        storage: Optional[dict] = None,
    ) -> MockPage:
        """Build a MockPage from raw HTML without a full captured fixture."""
        from .fixture_capture import FixtureBundle

        bundle = FixtureBundle(
            fixture_id="mock",
            workflow_id="",
            label="inline",
            url=url,
            captured_at=time.time(),
            dom_html=html,
            dom_hash=hashlib.md5(html.encode()).hexdigest(),
            accessibility_tree={},
            screenshot_b64=None,
            screenshot_hash=None,
            storage=storage or {"cookies": [], "local_storage": {}, "session_storage": {}},
            network_summary=[],
            console_logs=[],
            element_count=0,
            viewport={"width": 1280, "height": 720},
        )
        return MockPage(bundle)
