"""Selector memory — the local "wisdom cache" of known-good controls per site.

When the agent successfully acts on an element, we remember that element's stable
selector under (domain, intent) — where `intent` is a normalized phrase derived
from the element's label/action (e.g. "easy apply", "submit application"). On a
later visit to the same domain, those known-good selectors are surfaced back to
the reasoning model (marked ✓) so it prefers a proven control over guessing or
spending a vision call.

This is the loop-appropriate form of a selector cache: the loop still acts by
`data-cog-ref` (refs are per-observation), but the model is biased toward
elements that worked before. Pure local JSON on disk — no Redis, no service —
mirroring LongMemory. A backend-side equivalent (SiteMemoryService, Postgres)
already exists for the Node path; this is the in-engine counterpart.
"""

from __future__ import annotations

import json
import logging
import os
import re
import threading
import time
from pathlib import Path
from typing import Dict, List, Optional, Set

log = logging.getLogger("browser-py.job_agent.cognition")

_DEFAULT_PATH = Path("data") / "memory" / "selector_memory.json"
_MAX_PER_DOMAIN = 60
_STOPWORDS = {"the", "a", "an", "to", "of", "for", "your", "this", "that", "and"}

# Redis hash key for the GLOBAL (cross-session, cross-user) selector cache.
# One hash per domain; field = normalized intent; value = JSON entry. This is the
# shared "wisdom" layer: a selector one run proves becomes instantly available to
# every later run, so the fleet stops re-deriving the same controls.
_REDIS_KEY = "omnitask:selector:cache:{domain}"
# Global cache on by default; set COG_SELECTOR_GLOBAL=false for local-only.
_GLOBAL_ENABLED = os.environ.get("COG_SELECTOR_GLOBAL", "true").strip().lower() not in (
    "0", "false", "no", "off",
)


def normalize_intent(text: str) -> str:
    """Reduce a label/action phrase to a compact, comparable intent key."""
    words = re.findall(r"[a-z0-9]+", (text or "").lower())
    words = [w for w in words if w not in _STOPWORDS]
    return " ".join(words[:6])


class SelectorMemory:
    def __init__(self, path: Path = _DEFAULT_PATH):
        self.path = Path(path)
        self._lock = threading.Lock()
        # { domain: { "<intent>": {selector, tool, hits, ts} } }
        self._data: Dict[str, Dict[str, dict]] = {}
        self._load()
        # Lazy global (Redis) layer — None until first use; False once disabled.
        self._redis = None
        self._redis_disabled = not _GLOBAL_ENABLED
        self._primed: Set[str] = set()  # domains already pulled from global

    def _load(self) -> None:
        try:
            if self.path.exists():
                self._data = json.loads(self.path.read_text(encoding="utf-8"))
        except Exception as exc:  # noqa: BLE001
            log.debug("SelectorMemory load failed (%s); starting fresh.", exc)
            self._data = {}

    def _save(self) -> None:
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self.path.write_text(
                json.dumps(self._data, ensure_ascii=False, indent=2, default=str),
                encoding="utf-8",
            )
        except Exception as exc:  # noqa: BLE001
            log.debug("SelectorMemory save failed: %s", exc)

    def remember(self, domain: str, intent: str, selector: str, tool: str) -> None:
        """Record a selector that just worked for (domain, intent)."""
        if not domain or not selector:
            return
        key = normalize_intent(intent)
        if not key:
            return
        with self._lock:
            site = self._data.setdefault(domain, {})
            entry = site.get(key)
            if entry and entry.get("selector") == selector:
                entry["hits"] = int(entry.get("hits", 0)) + 1
                entry["ts"] = time.time()
            else:
                site[key] = {"selector": selector, "tool": tool, "hits": 1, "ts": time.time()}
            # Trim the least-recently-used entries if a domain grows too large.
            if len(site) > _MAX_PER_DOMAIN:
                ranked = sorted(site.items(), key=lambda kv: kv[1].get("ts", 0), reverse=True)
                self._data[domain] = dict(ranked[:_MAX_PER_DOMAIN])
            self._save()

    def known_selectors(self, domain: str) -> Set[str]:
        """All proven selectors for a domain (for ✓-marking in the observation)."""
        return {e.get("selector") for e in self._data.get(domain, {}).values() if e.get("selector")}

    def lookup(self, domain: str, intent: str) -> Optional[dict]:
        """Direct read of the proven entry for (domain, intent), or None.

        Used by the cache-first fast-path to try a known selector before waking
        the model. Returns the merged local+primed entry {selector, tool, hits, ts}.
        """
        key = normalize_intent(intent)
        if not key:
            return None
        return self._data.get(domain, {}).get(key)

    def forget(self, domain: str, intent: str) -> None:
        """Drop a (domain, intent) entry — called when a cached selector turns
        out to be stale, so the fast-path stops trusting it."""
        key = normalize_intent(intent)
        if not key:
            return
        with self._lock:
            site = self._data.get(domain)
            if site and key in site:
                del site[key]
                self._save()

    def hint_block(self, domain: str, *, limit: int = 8) -> str:
        """A short prompt block listing proven controls, most-used first."""
        site = self._data.get(domain, {})
        if not site:
            return ""
        ranked = sorted(site.items(), key=lambda kv: kv[1].get("hits", 0), reverse=True)
        lines: List[str] = [f"KNOWN-GOOD CONTROLS for {domain} (worked before — prefer these):"]
        for intent, e in ranked[:limit]:
            lines.append(f"  - \"{intent}\" → {e.get('selector')}")
        return "\n".join(lines)

    # ── Global (Redis) layer — cross-session/user "wisdom" cache ──────────────
    #
    # Best-effort and fully optional: every method degrades silently to the local
    # JSON store when Redis is absent or COG_SELECTOR_GLOBAL=false, so the agent
    # never blocks or fails on a cache miss/outage.

    async def _get_redis(self):
        if self._redis_disabled:
            return None
        if self._redis is not None:
            return self._redis
        try:
            import redis.asyncio as redis  # optional; present in the engine runtime
            self._redis = redis.Redis(
                host=os.environ.get("REDIS_HOST", "localhost"),
                port=int(os.environ.get("REDIS_PORT", "6379")),
                password=os.environ.get("REDIS_PASSWORD") or None,
                decode_responses=True,
                socket_connect_timeout=2,
                socket_timeout=2,
            )
            return self._redis
        except Exception as exc:  # noqa: BLE001 — no redis lib / bad config → local-only
            log.debug("SelectorMemory global layer disabled (%s).", exc)
            self._redis_disabled = True
            return None

    def _merge_entry(self, domain: str, intent: str, entry: dict) -> None:
        """Merge a global entry into the local store (keep the higher hit count)."""
        if not intent or not isinstance(entry, dict) or not entry.get("selector"):
            return
        with self._lock:
            site = self._data.setdefault(domain, {})
            cur = site.get(intent)
            if not cur or int(entry.get("hits", 0)) >= int(cur.get("hits", 0)):
                site[intent] = {
                    "selector": entry.get("selector"),
                    "tool": entry.get("tool", ""),
                    "hits": int(entry.get("hits", 1)),
                    "ts": entry.get("ts", time.time()),
                }

    async def prime(self, domain: str) -> None:
        """Pull the global cache for a domain into the local store (once/domain).
        Call at the start of a run so the model sees fleet-wide proven controls."""
        if not domain or domain in self._primed:
            return
        self._primed.add(domain)
        client = await self._get_redis()
        if client is None:
            return
        try:
            raw = await client.hgetall(_REDIS_KEY.format(domain=domain))
            for intent, val in (raw or {}).items():
                try:
                    self._merge_entry(domain, intent, json.loads(val))
                except Exception:  # noqa: BLE001 — skip a single bad field
                    continue
            if raw:
                self._save()
        except Exception as exc:  # noqa: BLE001 — cache miss/outage → local-only
            log.debug("SelectorMemory.prime(%s) failed: %s", domain, exc)

    async def push_global(self, domain: str, intent: str, selector: str, tool: str) -> None:
        """Publish a proven selector to the global cache (fire-and-forget)."""
        if not domain or not selector:
            return
        key = normalize_intent(intent)
        if not key:
            return
        client = await self._get_redis()
        if client is None:
            return
        try:
            field_key = _REDIS_KEY.format(domain=domain)
            existing = await client.hget(field_key, key)
            hits = 1
            if existing:
                try:
                    hits = int(json.loads(existing).get("hits", 0)) + 1
                except Exception:  # noqa: BLE001
                    hits = 1
            await client.hset(field_key, key, json.dumps({
                "selector": selector, "tool": tool, "hits": hits, "ts": time.time(),
            }))
        except Exception as exc:  # noqa: BLE001 — never let cache writes break a run
            log.debug("SelectorMemory.push_global failed: %s", exc)
