"""Tests for MockPage and FixtureReplayer offline replay.

All tests run without a live browser — they use FixtureBundle directly.
"""

import time
import pytest
from engine.fixture_capture import FixtureBundle
from engine.fixture_replay import FixtureReplayer, MockPage, MockLocator
from engine.tests.conftest import run


# ── Helpers ───────────────────────────────────────────────────────────────────

def make_bundle(
    url="https://example.com",
    dom_html="<html><body>hello</body></html>",
    element_count=3,
    accessibility_tree=None,
    local_storage=None,
    cookies=None,
    console_logs=None,
) -> FixtureBundle:
    import hashlib
    return FixtureBundle(
        fixture_id="test-fixture-1",
        workflow_id="wf-test",
        label="test_page",
        url=url,
        captured_at=time.time(),
        dom_html=dom_html,
        dom_hash=hashlib.md5(dom_html.encode()).hexdigest(),
        accessibility_tree=accessibility_tree or {"name": "Test page"},
        screenshot_b64=None,
        screenshot_hash=None,
        storage={
            "cookies": cookies or [],
            "local_storage": local_storage or {},
            "session_storage": {},
        },
        network_summary=[],
        console_logs=console_logs or [],
        element_count=element_count,
        viewport={"width": 1280, "height": 720},
    )


# ── MockPage properties ───────────────────────────────────────────────────────

def test_mock_page_url():
    page = MockPage(make_bundle(url="https://naukri.com"))
    assert page.url == "https://naukri.com"


def test_mock_page_viewport():
    page = MockPage(make_bundle())
    vp = page.viewport_size
    assert vp["width"] == 1280
    assert vp["height"] == 720


# ── MockPage.evaluate ─────────────────────────────────────────────────────────

def test_evaluate_outer_html():
    html = "<html><body>test</body></html>"
    page = MockPage(make_bundle(dom_html=html))
    result = run(page.evaluate("() => document.documentElement.outerHTML"))
    assert result == html


def test_evaluate_element_count():
    page = MockPage(make_bundle(element_count=42))
    result = run(page.evaluate("() => document.querySelectorAll('*').length"))
    assert result == 42


def test_evaluate_local_storage():
    page = MockPage(make_bundle(local_storage={"key1": "value1"}))
    result = run(page.evaluate("() => Object.keys(localStorage)"))
    assert result == {"key1": "value1"}


def test_evaluate_console_logs():
    page = MockPage(make_bundle(console_logs=["log1", "log2"]))
    result = run(page.evaluate("() => window.__consoleLogs || []"))
    assert result == ["log1", "log2"]


def test_evaluate_unknown_expression_returns_none():
    page = MockPage(make_bundle())
    result = run(page.evaluate("() => somethingRandom()"))
    assert result is None


# ── MockPage.content ──────────────────────────────────────────────────────────

def test_content_returns_dom_html():
    html = "<html><body>content</body></html>"
    page = MockPage(make_bundle(dom_html=html))
    result = run(page.content())
    assert result == html


# ── MockPage.accessibility ────────────────────────────────────────────────────

def test_accessibility_snapshot():
    tree = {"role": "WebArea", "name": "My Page", "children": []}
    page = MockPage(make_bundle(accessibility_tree=tree))
    result = run(page.accessibility.snapshot())
    assert result == tree


# ── MockPage.context (cookies) ────────────────────────────────────────────────

def test_context_cookies():
    cookies = [{"name": "session", "domain": "example.com", "path": "/", "secure": True}]
    page = MockPage(make_bundle(cookies=cookies))
    result = run(page.context.cookies())
    assert result == cookies


def test_context_empty_cookies():
    page = MockPage(make_bundle(cookies=[]))
    result = run(page.context.cookies())
    assert result == []


# ── MockLocator ───────────────────────────────────────────────────────────────

def test_mock_locator_count_empty():
    loc = MockLocator("button", elements=[])
    assert run(loc.count()) == 0


def test_mock_locator_count_with_elements():
    loc = MockLocator("button", elements=[{"text": "Submit"}, {"text": "Cancel"}])
    assert run(loc.count()) == 2


def test_mock_locator_first_on_empty():
    loc = MockLocator("button", elements=[])
    result = run(loc.first())
    assert result is None


def test_mock_locator_is_visible_empty():
    loc = MockLocator("button", elements=[])
    assert run(loc.is_visible()) is False


def test_mock_locator_is_visible_with_elements():
    loc = MockLocator("button", elements=[{"text": "Click"}])
    assert run(loc.is_visible()) is True


def test_mock_locator_inner_text():
    loc = MockLocator("button", elements=[{"text": "Apply Now"}])
    assert run(loc.inner_text()) == "Apply Now"


# ── FixtureReplayer ───────────────────────────────────────────────────────────

def test_create_mock_page_from_bundle():
    replayer = FixtureReplayer()
    bundle = make_bundle(url="https://linkedin.com")
    page = replayer.create_mock_page(bundle)
    assert isinstance(page, MockPage)
    assert page.url == "https://linkedin.com"


def test_create_mock_page_from_html():
    replayer = FixtureReplayer()
    html = "<html><body>Hello World</body></html>"
    page = replayer.create_mock_page_from_html(html, url="https://test.com")
    assert page.url == "https://test.com"
    result = run(page.content())
    assert result == html


def test_create_mock_page_from_html_with_storage():
    replayer = FixtureReplayer()
    storage = {"cookies": [{"name": "auth", "domain": "test.com", "path": "/", "secure": True}], "local_storage": {}, "session_storage": {}}
    page = replayer.create_mock_page_from_html("<html></html>", storage=storage)
    cookies = run(page.context.cookies())
    assert len(cookies) == 1
    assert cookies[0]["name"] == "auth"


# ── wait_for_load_state (no-op) ───────────────────────────────────────────────

def test_wait_for_load_state_does_not_raise():
    page = MockPage(make_bundle())
    run(page.wait_for_load_state("networkidle", timeout=5000))


def test_screenshot_returns_empty_bytes_when_no_screenshot():
    page = MockPage(make_bundle())
    result = run(page.screenshot())
    assert result == b""
