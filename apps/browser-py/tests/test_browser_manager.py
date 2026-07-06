"""Tests for browser_manager.py — profile isolation, lifecycle, concurrency guards."""

import os
import asyncio
from pathlib import Path
from unittest.mock import AsyncMock, patch, MagicMock

import pytest


class TestProfilePaths:
    def test_default_profiles_root(self):
        os.environ.pop("BROWSER_PROFILES_DIR", None)
        from browser_manager import _PROFILES_ROOT
        assert str(_PROFILES_ROOT).endswith("profiles")

    def test_custom_profiles_root(self):
        from browser_manager import _PROFILES_ROOT
        os.environ["BROWSER_PROFILES_DIR"] = "C:\\tmp\\test-profiles"
        import importlib
        import browser_manager
        importlib.reload(browser_manager)
        assert str(browser_manager._PROFILES_ROOT) == "C:\\tmp\\test-profiles"

    def test_safe_user_dir_is_isolated(self):
        from browser_manager import _safe_user_dir
        p1 = _safe_user_dir("user-abc")
        p2 = _safe_user_dir("user-xyz")
        assert "user-abc" in str(p1)
        assert "user-xyz" in str(p2)
        assert p1 != p2

    def test_safe_user_dir_sanitises_path_traversal(self):
        from browser_manager import _safe_user_dir
        p = _safe_user_dir("../etc")
        assert ".." not in str(p.name)

    def test_safe_user_dir_defaults_to_anon(self):
        from browser_manager import _safe_user_dir
        p = _safe_user_dir(None)
        assert "anon" == p.name


class TestBrowserManager:
    @pytest.mark.asyncio
    async def test_get_browser_manager_returns_singleton(self, mock_playwright):
        import browser_manager
        browser_manager._MANAGER = None
        bm1 = browser_manager.get_browser_manager(mock_playwright["pw"], launch_args=[], user_agent="test")
        bm2 = browser_manager.get_browser_manager(mock_playwright["pw"], launch_args=[], user_agent="test")
        assert bm1 is bm2
        browser_manager._MANAGER = None

    @pytest.mark.asyncio
    async def test_get_context_launches_persistent_profile(self, mock_playwright):
        with patch("browser_manager.Path.mkdir"):
            from browser_manager import BrowserManager
            bm = BrowserManager(mock_playwright["pw"], launch_args=[], user_agent="test")
            ctx = await bm.get_context("user-1", headless=True)
            assert ctx is not None

    @pytest.mark.asyncio
    async def test_get_context_returns_cached(self, mock_playwright):
        with patch("browser_manager.Path.mkdir"):
            from browser_manager import BrowserManager
            bm = BrowserManager(mock_playwright["pw"], launch_args=[], user_agent="test")
            ctx1 = await bm.get_context("user-cached", headless=True)
            ctx2 = await bm.get_context("user-cached", headless=True)
            assert ctx1 is ctx2

    @pytest.mark.asyncio
    async def test_context_isolation_per_user(self, mock_playwright):
        with patch("browser_manager.Path.mkdir"):
            from browser_manager import BrowserManager
            ctx_a_mock = AsyncMock()
            ctx_b_mock = AsyncMock()
            bm = BrowserManager(mock_playwright["pw"], launch_args=[], user_agent="test")
            bm._launch = AsyncMock(side_effect=[ctx_a_mock, ctx_b_mock])
            ctx_a = await bm.get_context("user-a", headless=True)
            ctx_b = await bm.get_context("user-b", headless=True)
            assert ctx_a is ctx_a_mock
            assert ctx_b is ctx_b_mock
            assert ctx_a is not ctx_b

    @pytest.mark.asyncio
    async def test_close_user_removes_from_registry(self, mock_playwright):
        with patch("browser_manager.Path.mkdir"):
            from browser_manager import BrowserManager
            bm = BrowserManager(mock_playwright["pw"], launch_args=[], user_agent="test")
            await bm.get_context("user-x", headless=True)
            await bm.close_user("user-x")
            assert "user-x" not in bm._contexts

    @pytest.mark.asyncio
    async def test_close_nonexistent_user_does_not_error(self, mock_playwright):
        from browser_manager import BrowserManager
        bm = BrowserManager(mock_playwright["pw"], launch_args=[], user_agent="test")
        await bm.close_user("ghost-user")

    def test_new_page_requires_headless(self, mock_playwright):
        with patch("browser_manager.Path.mkdir"):
            from browser_manager import BrowserManager
            bm = BrowserManager(mock_playwright["pw"], launch_args=[], user_agent="test")

    @pytest.mark.asyncio
    async def test_close_all_clears_contexts(self, mock_playwright):
        with patch("browser_manager.Path.mkdir"):
            from browser_manager import BrowserManager
            bm = BrowserManager(mock_playwright["pw"], launch_args=[], user_agent="test")
            await bm.get_context("u1", headless=True)
            await bm.get_context("u2", headless=True)
            assert len(bm._contexts) == 2
            await bm.close_all()
            assert len(bm._contexts) == 0

    @pytest.mark.asyncio
    async def test_shutdown_browser_manager(self, mock_playwright):
        import browser_manager
        browser_manager._MANAGER = None
        bm = browser_manager.get_browser_manager(mock_playwright["pw"], launch_args=[], user_agent="test")
        await browser_manager.shutdown_browser_manager()
        assert browser_manager._MANAGER is None
