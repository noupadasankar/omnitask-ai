"""Browser context memory — continuous tracking of all browser state.

Tracks URL history, tabs, popups, downloads, cookies, storage, auth state,
and user profile across the lifetime of a browser session.
"""

import asyncio
import logging
from collections import deque
from dataclasses import dataclass, field
from typing import Optional

log = logging.getLogger("browser-py.engine.context_memory")


@dataclass
class BrowserSnapshot:
    current_url: str
    previous_url: str
    navigation_history: list
    open_tabs: list
    active_tab_id: Optional[str]
    frames: list
    popups: list
    downloads: list
    cookies: dict
    local_storage: dict
    session_storage: dict
    auth_status: str        # authenticated | anonymous | unknown
    user_profile: dict      # {name, email, avatar}
    current_workflow_step: Optional[str]


class BrowserContextMemory:
    """Continuously tracks all browser context state across the session."""

    def __init__(self):
        self._current_url: str = ""
        self._previous_url: str = ""
        self._history: deque = deque(maxlen=100)
        self._tabs: dict[str, dict] = {}        # tab_id -> {url, title}
        self._active_tab_id: Optional[str] = None
        self._frames: list[dict] = []
        self._popups: list[dict] = []           # {popup_id, url}
        self._downloads: list[dict] = []        # {filename, url, status}
        self._cookies: dict = {}
        self._local_storage: dict = {}
        self._session_storage: dict = {}
        self._auth_status: str = "unknown"
        self._user_profile: dict = {}
        self._current_workflow_step: Optional[str] = None

    # ── Navigation ──────────────────────────────────────────────────────────

    def update_navigation(self, url: str) -> None:
        """Record a navigation to a new URL."""
        if url and url != self._current_url:
            self._previous_url = self._current_url
            self._current_url = url
            self._history.append(url)

    def get_history(self) -> list[str]:
        return list(self._history)

    # ── Tabs ────────────────────────────────────────────────────────────────

    def add_tab(self, tab_id: str, url: str, title: str = "") -> None:
        self._tabs[tab_id] = {"url": url, "title": title}

    def remove_tab(self, tab_id: str) -> None:
        self._tabs.pop(tab_id, None)
        if self._active_tab_id == tab_id:
            self._active_tab_id = next(iter(self._tabs), None)

    def set_active_tab(self, tab_id: str) -> None:
        self._active_tab_id = tab_id

    def get_open_tabs(self) -> list[dict]:
        return [{"tab_id": k, **v} for k, v in self._tabs.items()]

    # ── Popups ──────────────────────────────────────────────────────────────

    def add_popup(self, popup_id: str, url: str) -> None:
        self._popups.append({"popup_id": popup_id, "url": url})

    def remove_popup(self, popup_id: str) -> None:
        self._popups = [p for p in self._popups if p.get("popup_id") != popup_id]

    # ── Downloads ───────────────────────────────────────────────────────────

    def add_download(self, filename: str, url: str, status: str = "started") -> None:
        self._downloads.append({"filename": filename, "url": url, "status": status})

    def update_download(self, filename: str, status: str) -> None:
        for d in self._downloads:
            if d.get("filename") == filename:
                d["status"] = status

    # ── Storage and cookies ─────────────────────────────────────────────────

    async def update_cookies(self, page) -> None:
        """Read current cookies from browser context."""
        try:
            cookies_list = await page.context.cookies()
            self._cookies = {c["name"]: c["value"] for c in cookies_list}
        except Exception as exc:
            log.warning("update_cookies failed: %s", exc)

    async def update_storage(self, page) -> None:
        """Read localStorage and sessionStorage."""
        try:
            self._local_storage = await page.evaluate("""() => {
                const r = {};
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    r[k] = localStorage.getItem(k);
                }
                return r;
            }""") or {}
        except Exception as exc:
            log.warning("update_local_storage failed: %s", exc)

        try:
            self._session_storage = await page.evaluate("""() => {
                const r = {};
                for (let i = 0; i < sessionStorage.length; i++) {
                    const k = sessionStorage.key(i);
                    r[k] = sessionStorage.getItem(k);
                }
                return r;
            }""") or {}
        except Exception as exc:
            log.warning("update_session_storage failed: %s", exc)

    async def update_auth(self, page) -> None:
        """Detect authentication state from DOM signals."""
        try:
            result = await page.evaluate("""() => {
                const signals_in = [
                    '[class*="user-menu"]', '[class*="avatar"]', '[class*="account-menu"]',
                    '[aria-label*="account"]', '[data-testid*="user"]', '.user-profile',
                ];
                const signals_out = ['a[href*="/login"]', 'a[href*="/signin"]', 'input[type="password"]'];
                const loggedIn = signals_in.some(s => !!document.querySelector(s));
                const loggedOut = signals_out.some(s => !!document.querySelector(s));

                // Try to get username
                const nameEl = document.querySelector('[class*="user-name"], [class*="display-name"], .username');
                const name = nameEl ? (nameEl.textContent || '').trim() : null;
                const emailEl = document.querySelector('[class*="user-email"], [data-testid*="email"]');
                const email = emailEl ? (emailEl.textContent || '').trim() : null;

                return {loggedIn, loggedOut, name, email};
            }""")

            if result.get("loggedIn") and not result.get("loggedOut"):
                self._auth_status = "authenticated"
                if result.get("name"):
                    self._user_profile["name"] = result["name"]
                if result.get("email"):
                    self._user_profile["email"] = result["email"]
            elif result.get("loggedOut"):
                self._auth_status = "anonymous"
            else:
                self._auth_status = "unknown"
        except Exception as exc:
            log.warning("update_auth failed: %s", exc)

    async def update_frames(self, page) -> None:
        """Track iframes in the current page."""
        try:
            self._frames = await page.evaluate("""() => {
                return Array.from(document.querySelectorAll('iframe')).map((f, i) => ({
                    index: i,
                    src: f.src || '',
                    name: f.name || '',
                    id: f.id || '',
                }));
            }""") or []
        except Exception as exc:
            log.warning("update_frames failed: %s", exc)

    async def full_update(self, page) -> None:
        """Run all update methods at once."""
        url = ""
        try:
            url = page.url
        except Exception:
            pass
        if url:
            self.update_navigation(url)

        await asyncio.gather(
            self.update_cookies(page),
            self.update_storage(page),
            self.update_auth(page),
            self.update_frames(page),
            return_exceptions=True,
        )

    # ── Workflow step tracking ───────────────────────────────────────────────

    def set_workflow_step(self, step: Optional[str]) -> None:
        self._current_workflow_step = step

    # ── Snapshot ────────────────────────────────────────────────────────────

    def snapshot(self) -> dict:
        """Return a plain dict of the full current state."""
        return {
            "current_url": self._current_url,
            "previous_url": self._previous_url,
            "navigation_history": list(self._history),
            "open_tabs": self.get_open_tabs(),
            "active_tab_id": self._active_tab_id,
            "frames": self._frames,
            "popups": list(self._popups),
            "downloads": list(self._downloads),
            "cookies": dict(self._cookies),
            "local_storage": dict(self._local_storage),
            "session_storage": dict(self._session_storage),
            "auth_status": self._auth_status,
            "user_profile": dict(self._user_profile),
            "current_workflow_step": self._current_workflow_step,
        }

    def as_dataclass(self) -> BrowserSnapshot:
        return BrowserSnapshot(
            current_url=self._current_url,
            previous_url=self._previous_url,
            navigation_history=list(self._history),
            open_tabs=self.get_open_tabs(),
            active_tab_id=self._active_tab_id,
            frames=self._frames,
            popups=list(self._popups),
            downloads=list(self._downloads),
            cookies=dict(self._cookies),
            local_storage=dict(self._local_storage),
            session_storage=dict(self._session_storage),
            auth_status=self._auth_status,
            user_profile=dict(self._user_profile),
            current_workflow_step=self._current_workflow_step,
        )
