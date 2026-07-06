"""Per-user persistent browser profiles + a small manager that owns them.

Why this exists
---------------
The engine used to launch a throwaway `browser.new_context()` per run, so every
run started logged-out and the session died with the run. This manager instead
gives each user a **persistent Chromium profile** on disk
(`profiles/<user_id>/`) via `launch_persistent_context`, so:

  • cookies / localStorage / MFA sessions survive restarts (stay logged in),
  • a warm browser is reused across runs (faster startup, no duplicates),
  • one browser per user — no orphan Chromium processes.

Security: profiles are **strictly per-user**. A shared `user_data_dir` would leak
one user's logged-in sessions to everyone, so user ids are sanitised into
isolated folders and never share a directory.

Concurrency: the engine runs jobs concurrently. A Chromium `user_data_dir` can be
opened by only one process, so we keep exactly one context per user and guard
creation with a per-user asyncio lock (single-threaded event loop → a plain dict
registry is safe between awaits).
"""

from __future__ import annotations

import asyncio
import logging
import os
import shutil
import time
from pathlib import Path
from typing import Optional

log = logging.getLogger("browser-py.browsers")

# Root for per-user profiles. Override with BROWSER_PROFILES_DIR; defaults to
# apps/browser-py/profiles/. Each user gets an isolated subfolder.
_PROFILES_ROOT = Path(
    os.environ.get("BROWSER_PROFILES_DIR")
    or (Path(__file__).resolve().parent / "profiles")
)


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, str(default)))
    except (TypeError, ValueError):
        return default


# ── Garbage-collection / quota config (all opt-out via 0) ────────────────────
# Per-user disk cap in MB. When a (closed) profile exceeds this, its regenerable
# CACHES are trimmed — cookies/sessions are kept, so the user stays logged in.
_PROFILE_MAX_MB = _int_env("BROWSER_PROFILE_MAX_MB", 750)
# Delete whole profiles untouched for this many days. This DOES log them out, so
# it's off (0) by default — enable only if you want hard idle eviction.
_PROFILE_TTL_DAYS = _int_env("BROWSER_PROFILE_TTL_DAYS", 0)
# Close in-memory contexts idle this long (seconds). Frees the Chromium process;
# the on-disk profile keeps the session so the next run relaunches logged-in.
_CONTEXT_IDLE_S = _int_env("BROWSER_CONTEXT_IDLE_S", 1800)
# Background GC cadence (seconds). 0 disables the periodic loop entirely.
_GC_INTERVAL_S = _int_env("BROWSER_GC_INTERVAL_S", 1800)

# Regenerable Chromium cache dirs (relative to a profile). Safe to delete — these
# never hold the logged-in session (cookies live in Default/Cookies & Network/,
# logins in Local Storage / IndexedDB / Login Data, none of which are listed here).
_CACHE_SUBDIRS = (
    "Default/Cache",
    "Default/Code Cache",
    "Default/GPUCache",
    "Default/DawnCache",
    "Default/DawnWebGPUCache",
    "Default/GraphiteDawnCache",
    "Default/Service Worker/CacheStorage",
    "Default/Service Worker/ScriptCache",
    "GrShaderCache",
    "ShaderCache",
    "GraphiteDawnCache",
    "component_crx_cache",
)


def _safe_user_dir(user_id: Optional[str]) -> Path:
    """Map a user id to an isolated, filesystem-safe profile directory.

    Sanitises to ``[A-Za-z0-9-_]`` so a hostile id can't escape the profiles root
    (path traversal) or collide with another user.
    """
    raw = str(user_id or "anon")
    safe = "".join(c if (c.isalnum() or c in "-_") else "_" for c in raw)
    return _PROFILES_ROOT / (safe or "anon")


class BrowserManager:
    """Owns one persistent Chromium context per user id and hands out pages."""

    def __init__(self, pw, *, launch_args, user_agent, stealth_js=None,
                 default_viewport=None):
        self._pw = pw
        self._launch_args = launch_args
        self._user_agent = user_agent
        self._stealth_js = stealth_js
        self._default_viewport = default_viewport or {"width": 1280, "height": 800}
        self._contexts: dict[str, object] = {}
        self._locks: dict[str, asyncio.Lock] = {}
        # Last time each user's context was handed out — drives idle eviction.
        self._last_used: dict[str, float] = {}

    def _lock_for(self, key: str) -> asyncio.Lock:
        # Safe without a guarding lock: dict access has no await, so the event
        # loop can't interleave between the check and the insert.
        lock = self._locks.get(key)
        if lock is None:
            lock = asyncio.Lock()
            self._locks[key] = lock
        return lock

    async def get_context(self, user_id: Optional[str], *, headless: bool):
        """Return the user's persistent context, launching it on first use."""
        key = str(user_id or "anon")
        async with self._lock_for(key):
            self._last_used[key] = time.time()
            ctx = self._contexts.get(key)
            if ctx is not None:
                return ctx
            ctx = await self._launch(key, headless=headless)
            self._contexts[key] = ctx
            return ctx

    async def new_page(self, user_id: Optional[str], *, headless: bool):
        """Open a fresh page in the user's persistent context.

        Returns ``(context, page)``. If the cached context died (browser crashed
        or was closed), it's dropped and relaunched once.
        """
        ctx = await self.get_context(user_id, headless=headless)
        try:
            return ctx, await ctx.new_page()
        except Exception as exc:  # noqa: BLE001 — context was dead; relaunch once
            log.warning("Persistent context for %s was unusable (%s) — relaunching",
                        user_id, exc)
            await self.close_user(user_id)
            ctx = await self.get_context(user_id, headless=headless)
            return ctx, await ctx.new_page()

    async def _launch(self, key: str, *, headless: bool):
        user_dir = _safe_user_dir(key)
        user_dir.mkdir(parents=True, exist_ok=True)
        log.info("Persistent profile for user=%s at %s (headless=%s)",
                 key, user_dir, headless)
        ctx = await self._pw.chromium.launch_persistent_context(
            str(user_dir),
            headless=headless,
            args=self._launch_args,
            viewport=self._default_viewport,
            user_agent=self._user_agent,
        )
        if self._stealth_js:
            try:
                await ctx.add_init_script(self._stealth_js)
            except Exception:  # noqa: BLE001 — stealth is best-effort
                pass
        # Drop our registry entry if Chromium closes/crashes so we relaunch next time.
        try:
            ctx.on("close", lambda *_: self._contexts.pop(key, None))
        except Exception:  # noqa: BLE001
            pass
        return ctx

    async def close_user(self, user_id: Optional[str]) -> None:
        """Close and forget one user's context (profile stays on disk)."""
        key = str(user_id or "anon")
        self._last_used.pop(key, None)
        ctx = self._contexts.pop(key, None)
        if ctx is not None:
            try:
                await ctx.close()
            except Exception:  # noqa: BLE001
                pass

    async def close_all(self) -> None:
        """Close every context (engine shutdown). Profiles persist on disk."""
        for ctx in list(self._contexts.values()):
            try:
                await ctx.close()
            except Exception:  # noqa: BLE001
                pass
        self._contexts.clear()
        self._last_used.clear()

    # ── Garbage collection / quota ───────────────────────────────────────────

    @staticmethod
    def _dir_size(path: Path) -> int:
        """Total bytes under `path` (best-effort; skips files we can't stat)."""
        total = 0
        for root, _dirs, files in os.walk(path):
            for name in files:
                try:
                    total += os.path.getsize(os.path.join(root, name))
                except OSError:
                    pass
        return total

    def _trim_caches(self, profile: Path) -> int:
        """Delete regenerable cache dirs inside a (closed) profile. Returns bytes
        freed. Cookies / localStorage / IndexedDB are never touched."""
        freed = 0
        for rel in _CACHE_SUBDIRS:
            target = profile / rel
            if target.exists():
                try:
                    freed += self._dir_size(target)
                    shutil.rmtree(target, ignore_errors=True)
                except Exception:  # noqa: BLE001
                    pass
        return freed

    async def gc(self) -> None:
        """Reclaim disk/processes. Never touches a context that's in use, and
        never deletes session data except optional TTL eviction. Best-effort —
        a GC error must never disrupt a run."""
        now = time.time()

        # 1) Close idle in-memory contexts → frees the Chromium process and lets
        #    on-disk GC reclaim the profile. Skip any with an active run (a run
        #    holds an extra page beyond the context's default blank page).
        if _CONTEXT_IDLE_S > 0:
            for key in list(self._contexts.keys()):
                if now - self._last_used.get(key, now) <= _CONTEXT_IDLE_S:
                    continue
                async with self._lock_for(key):
                    ctx = self._contexts.get(key)
                    if ctx is None:
                        continue
                    try:
                        active = sum(1 for p in ctx.pages if not p.is_closed())
                    except Exception:  # noqa: BLE001
                        active = 0
                    if active > 1:
                        continue  # a run is using it — leave it warm
                    log.info("Closing idle browser for user=%s (idle >%ds)", key, _CONTEXT_IDLE_S)
                    await self.close_user(key)

        # 2) On-disk GC over profiles that are NOT currently open.
        if not _PROFILES_ROOT.exists():
            return
        open_dirs = {_safe_user_dir(k).name for k in self._contexts}
        for profile in list(_PROFILES_ROOT.iterdir()):
            try:
                if not profile.is_dir() or profile.name in open_dirs:
                    continue

                # Hard idle eviction (opt-in) — deletes the session.
                if _PROFILE_TTL_DAYS > 0:
                    age_days = (now - profile.stat().st_mtime) / 86_400
                    if age_days > _PROFILE_TTL_DAYS:
                        log.info("Evicting idle profile %s (%.1f days old)", profile.name, age_days)
                        shutil.rmtree(profile, ignore_errors=True)
                        continue

                # Quota — trim caches, keep the session.
                if _PROFILE_MAX_MB > 0:
                    size_mb = self._dir_size(profile) / (1024 * 1024)
                    if size_mb > _PROFILE_MAX_MB:
                        freed_mb = self._trim_caches(profile) / (1024 * 1024)
                        log.info("Trimmed %.0f MB cache from profile %s (was %.0f MB)",
                                 freed_mb, profile.name, size_mb)
            except Exception as exc:  # noqa: BLE001 — GC must never crash the engine
                log.debug("GC skipped %s: %s", profile, exc)



# ── Process-wide singleton ───────────────────────────────────────────────────
# Exactly one Playwright instance lives for the engine's lifetime, so one manager
# is correct. Creation has no awaits → no race under the single-threaded loop.
_MANAGER: Optional[BrowserManager] = None


def get_browser_manager(pw, **kwargs) -> BrowserManager:
    """Get (or lazily create) the singleton manager bound to this Playwright."""
    global _MANAGER
    if _MANAGER is None:
        _MANAGER = BrowserManager(pw, **kwargs)
    return _MANAGER


async def shutdown_browser_manager() -> None:
    """Close all persistent contexts on engine shutdown (best effort)."""
    global _MANAGER
    if _MANAGER is not None:
        await _MANAGER.close_all()
        _MANAGER = None


async def run_profile_gc_loop() -> None:
    """Background loop: periodically trim caches / close idle browsers / evict
    stale profiles. No-op until the manager exists (first job) and self-disables
    when BROWSER_GC_INTERVAL_S=0."""
    if _GC_INTERVAL_S <= 0:
        log.info("Profile GC disabled (BROWSER_GC_INTERVAL_S=0)")
        return
    while True:
        await asyncio.sleep(_GC_INTERVAL_S)
        mgr = _MANAGER
        if mgr is None:
            continue
        try:
            await mgr.gc()
        except Exception as exc:  # noqa: BLE001 — the loop must outlive any GC error
            log.debug("Profile GC loop error: %s", exc)
