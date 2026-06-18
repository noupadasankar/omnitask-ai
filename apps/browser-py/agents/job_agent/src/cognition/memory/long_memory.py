"""Long-term memory — a durable local JSON store.

Holds the user's profile, distilled lessons, and an application history the agent
accumulates across runs. Plain JSON on disk (data/memory/long_memory.json) so it's
inspectable and needs no database/service.
"""

from __future__ import annotations

import json
import logging
import threading
import time
from pathlib import Path
from typing import Any, Dict, List

log = logging.getLogger("browser-py.job_agent.cognition")

_DEFAULT_PATH = Path("data") / "memory" / "long_memory.json"


class LongMemory:
    def __init__(self, path: Path = _DEFAULT_PATH):
        self.path = Path(path)
        self._lock = threading.Lock()
        self._data: Dict[str, Any] = {"profile": {}, "lessons": [], "applications": []}
        self._load()

    def _load(self) -> None:
        try:
            if self.path.exists():
                self._data = json.loads(self.path.read_text(encoding="utf-8"))
                self._data.setdefault("profile", {})
                self._data.setdefault("lessons", [])
                self._data.setdefault("applications", [])
        except Exception as exc:  # noqa: BLE001
            log.debug("LongMemory load failed (%s); starting fresh.", exc)

    def _save(self) -> None:
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self.path.write_text(
                json.dumps(self._data, ensure_ascii=False, indent=2, default=str),
                encoding="utf-8",
            )
        except Exception as exc:  # noqa: BLE001
            log.debug("LongMemory save failed: %s", exc)

    # ── profile ───────────────────────────────────────────────────────────────

    def get_profile(self) -> Dict[str, Any]:
        return dict(self._data.get("profile", {}))

    def update_profile(self, profile: Dict[str, Any]) -> None:
        with self._lock:
            self._data["profile"].update({k: v for k, v in profile.items() if v not in (None, "")})
            self._save()

    # ── lessons ───────────────────────────────────────────────────────────────

    def add_lesson(self, lesson: str, *, domain: str = "", tags: List[str] | None = None) -> None:
        if not lesson:
            return
        with self._lock:
            self._data["lessons"].append({
                "lesson": lesson[:500], "domain": domain, "tags": tags or [], "ts": time.time(),
            })
            self._data["lessons"] = self._data["lessons"][-500:]
            self._save()

    def recent_lessons(self, domain: str = "", limit: int = 8) -> List[str]:
        items = self._data.get("lessons", [])
        if domain:
            scoped = [l for l in items if l.get("domain") == domain]
            items = scoped or items
        return [l["lesson"] for l in items[-limit:]]

    # ── applications ──────────────────────────────────────────────────────────

    def add_application(self, record: Dict[str, Any]) -> None:
        with self._lock:
            record = {**record, "ts": time.time()}
            self._data["applications"].append(record)
            self._data["applications"] = self._data["applications"][-2000:]
            self._save()
