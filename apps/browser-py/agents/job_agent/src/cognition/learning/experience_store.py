"""Experience store — append-only episodic log of application attempts."""

from __future__ import annotations

import json
import logging
import threading
import time
from pathlib import Path
from typing import Any, Dict, List

log = logging.getLogger("browser-py.job_agent.cognition")

_DEFAULT_PATH = Path("data") / "memory" / "experiences.jsonl"


class ExperienceStore:
    def __init__(self, path: Path = _DEFAULT_PATH):
        self.path = Path(path)
        self._lock = threading.Lock()

    def record(self, episode: Dict[str, Any]) -> None:
        """Append one episode (domain, role, company, outcome, steps, lessons …)."""
        row = {**episode, "ts": time.time()}
        with self._lock:
            try:
                self.path.parent.mkdir(parents=True, exist_ok=True)
                with self.path.open("a", encoding="utf-8") as f:
                    f.write(json.dumps(row, ensure_ascii=False, default=str) + "\n")
            except Exception as exc:  # noqa: BLE001
                log.debug("ExperienceStore record failed: %s", exc)

    def all(self) -> List[Dict[str, Any]]:
        try:
            if not self.path.exists():
                return []
            with self.path.open("r", encoding="utf-8") as f:
                return [json.loads(line) for line in f if line.strip()]
        except Exception as exc:  # noqa: BLE001
            log.debug("ExperienceStore read failed: %s", exc)
            return []
