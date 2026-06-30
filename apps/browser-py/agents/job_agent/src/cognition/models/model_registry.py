"""ModelRegistry — local model-version registry + production pointer.

Tracks fine-tuned GGUF versions on disk and which one is "production", persisted
to data/models/registry.json (pure local JSON, like LongMemory / SelectorMemory —
no DB, no cloud). Promotion records history, so a regressed model can be rolled
back by re-promoting a known-good predecessor.

Separation of concerns: promotion here only updates the POINTER on disk. It does
NOT touch the running engine. To apply a promotion to a live process, pair it with
`LocalLLMClient.reload(path)` (or `reload_from_registry(registry)`), which performs
the lock-coordinated hot-swap. Keeping the registry free of any async/engine
dependency makes it trivially testable and safe to call from a trainer subprocess.

Typical flow:
    reg = ModelRegistry()
    reg.promote("/models/adapters/v20260617.gguf", notes="nightly QLoRA")
    await engine.llm.reload_from_registry(reg)     # live, in-flight-safe swap
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Dict, List, Optional

log = logging.getLogger("browser-py.job_agent.cognition")

_DEFAULT_PATH = Path("data") / "models" / "registry.json"
_MAX_HISTORY = 50


def sha256_of(path: str) -> str:
    """Streamed SHA-256 of a (possibly multi-GB) file, or '' on error. Used to
    fingerprint a model at promotion and verify it hasn't changed before loading."""
    try:
        h = hashlib.sha256()
        with open(path, "rb") as fh:
            for chunk in iter(lambda: fh.read(1 << 20), b""):
                h.update(chunk)
        return h.hexdigest()
    except Exception as exc:  # noqa: BLE001
        log.debug("sha256_of(%s) failed: %s", path, exc)
        return ""


class ModelRegistry:
    def __init__(self, path: Path = _DEFAULT_PATH):
        self.path = Path(path)
        self._lock = threading.Lock()
        # { "production": {...} | None, "versions": [...], "history": [...] }
        self._data: Dict[str, object] = {"production": None, "versions": [], "history": []}
        self._load()

    def _load(self) -> None:
        try:
            if self.path.exists():
                loaded = json.loads(self.path.read_text(encoding="utf-8"))
                if isinstance(loaded, dict):
                    self._data = {
                        "production": loaded.get("production"),
                        "versions": loaded.get("versions") or [],
                        "history": loaded.get("history") or [],
                    }
        except Exception as exc:  # noqa: BLE001 — a corrupt file must NOT crash startup
            log.warning(
                "ModelRegistry: %s is unreadable (%s); ignoring it and falling back "
                "to the configured base model.", self.path, exc,
            )
            self._data = {"production": None, "versions": [], "history": []}

    def _save(self) -> None:
        # Atomic write: serialize to a sibling temp file, then os.replace() — a
        # rename is atomic on POSIX and Windows, so a concurrent reader (or a power
        # loss mid-write) never sees a half-written registry, only the old or the
        # new complete file. Callers hold self._lock around writes.
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            payload = json.dumps(self._data, ensure_ascii=False, indent=2, default=str)
            tmp = self.path.parent / (self.path.name + ".tmp")
            tmp.write_text(payload, encoding="utf-8")
            os.replace(tmp, self.path)
        except Exception as exc:  # noqa: BLE001
            log.warning("ModelRegistry save failed: %s", exc)

    @contextmanager
    def _file_lock(self):
        """Best-effort cross-process promotion lock (advisory).

        An atomic O_EXCL lock file beside the registry serializes writers across
        PROCESSES — which the in-process self._lock cannot — so a CI run and a
        nightly trainer can't last-writer-win each other. A lock older than the
        stale window is treated as orphaned (holder crashed) and stolen. On a
        filesystem that can't host the lock we degrade to no cross-process lock
        rather than block writes (the atomic write still prevents corruption).

        Tunables: COG_PROMOTE_LOCK_TIMEOUT (s, default 30),
                  COG_PROMOTE_LOCK_STALE   (s, default 120).
        """
        lock_path = self.path.parent / (self.path.name + ".lock")
        try:
            timeout = float(os.environ.get("COG_PROMOTE_LOCK_TIMEOUT", "30"))
        except ValueError:
            timeout = 30.0
        try:
            stale = float(os.environ.get("COG_PROMOTE_LOCK_STALE", "120"))
        except ValueError:
            stale = 120.0
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
        except Exception:  # noqa: BLE001
            pass
        fd = None
        start = time.monotonic()
        while True:
            try:
                fd = os.open(str(lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                break
            except FileExistsError:
                try:
                    age = time.time() - os.path.getmtime(lock_path)
                except OSError:
                    age = 0.0
                if age > stale:
                    log.warning("ModelRegistry: stealing stale promotion lock (age %.0fs).", age)
                    try:
                        os.unlink(lock_path)
                    except OSError:
                        pass
                    continue
                if time.monotonic() - start > timeout:
                    raise TimeoutError(f"promotion lock busy: {lock_path}")
                time.sleep(0.2)
            except OSError as exc:  # noqa: BLE001 — FS can't host the lock; degrade
                log.debug("ModelRegistry: file lock unavailable (%s); proceeding unlocked.", exc)
                fd = None
                break
        try:
            if fd is not None:
                try:
                    os.write(fd, str(os.getpid()).encode("ascii"))
                except OSError:
                    pass
            yield
        finally:
            if fd is not None:
                try:
                    os.close(fd)
                except OSError:
                    pass
                try:
                    os.unlink(lock_path)
                except OSError:
                    pass

    def _build_entry(self, path: str, version: Optional[str], notes: str,
                     source: str) -> Optional[dict]:
        """Build a version entry (incl. the streamed sha256) with NO lock held, so
        a multi-GB hash never blocks other writers. None if the file is missing."""
        p = Path(path)
        if not p.exists():
            log.warning("ModelRegistry: file not found: %s", path)
            return None
        return {
            "path": str(p),
            "version": version or p.stem,
            "notes": notes,
            "source": source,
            "sha256": sha256_of(str(p)),
            "registered_at": time.time(),
        }

    def _store_version_locked(self, entry: dict) -> None:
        """Append/replace a version (de-dupe by path). Assumes self._lock is held."""
        versions: List[dict] = list(self._data.get("versions", []))  # type: ignore[arg-type]
        versions = [v for v in versions if v.get("path") != entry["path"]]
        versions.append(entry)
        self._data["versions"] = versions

    def register(self, path: str, *, version: Optional[str] = None,
                 notes: str = "", source: str = "") -> Optional[dict]:
        """Record a model version (validates the GGUF exists). Returns the entry,
        or None if the file is missing / the promotion lock is busy. De-dupes by
        path. `source` is free-text provenance (the base model it came from)."""
        entry = self._build_entry(path, version, notes, source)
        if entry is None:
            return None
        try:
            with self._file_lock():
                with self._lock:
                    self._store_version_locked(entry)
                    self._save()
        except TimeoutError:
            log.error("ModelRegistry.register: lock busy; %s not registered.", path)
            return None
        return entry

    def promote(self, path: str, *, version: Optional[str] = None, notes: str = "",
                source: str = "", promoted_by: str = "", reason: str = "",
                validation: Optional[dict] = None) -> Optional[dict]:
        """Make `path` the production model (registering it in the same locked
        critical section). Returns the production record — an audit trail of
        {path, version, source, notes, sha256, promoted_by, reason, validation,
        promoted_at} — or None if the file is missing / the lock is busy. The
        previous production model stays in `versions`+`history` for rollback."""
        entry = self._build_entry(path, version, notes, source)
        if entry is None:
            return None
        try:
            with self._file_lock():
                with self._lock:
                    self._store_version_locked(entry)
                    record = {
                        "path": entry["path"],
                        "version": entry["version"],
                        "source": entry.get("source", ""),
                        "notes": entry.get("notes", ""),
                        "sha256": entry.get("sha256", ""),
                        "promoted_by": promoted_by,
                        "reason": reason,
                        "validation": validation or {},
                        "promoted_at": time.time(),
                    }
                    self._data["production"] = record
                    history: List[dict] = list(self._data.get("history", []))  # type: ignore[arg-type]
                    history.append(dict(record))
                    self._data["history"] = history[-_MAX_HISTORY:]
                    self._save()
                    return dict(record)
        except TimeoutError:
            log.error("ModelRegistry.promote: lock busy; %s not promoted.", path)
            return None

    def history(self) -> List[dict]:
        """Chronological promotion log (oldest → newest), capped at the last 50."""
        return list(self._data.get("history", []))  # type: ignore[arg-type]

    def previous(self) -> Optional[dict]:
        """The most recently promoted model whose path differs from the current
        production model — i.e. the one a rollback would restore (or None)."""
        cur = self.production_path()
        for record in reversed(self.history()):
            if record.get("path") and record.get("path") != cur:
                return dict(record)
        return None

    def rollback(self, *, promoted_by: str = "", verify: bool = True) -> Optional[dict]:
        """Re-promote the previous production model. Returns the new production
        record, or None if there is no prior model, its file is gone, or (when
        `verify`) its on-disk sha256 no longer matches what was recorded — so a
        rollback never restores a model that was tampered with or corrupted since
        it last ran. Set verify=False to force a rollback past a hash mismatch."""
        prev = self.previous()
        if not prev:
            log.warning("ModelRegistry.rollback: no previous model to roll back to.")
            return None
        if not os.path.exists(prev["path"]):
            log.warning("ModelRegistry.rollback: previous model file is missing: %s", prev["path"])
            return None
        recorded = prev.get("sha256")
        if verify and recorded and sha256_of(prev["path"]) != recorded:
            log.error(
                "ModelRegistry.rollback: %s failed integrity check (sha256 mismatch); "
                "refusing to restore it. Pass verify=False to override.", prev["path"],
            )
            return None
        return self.promote(
            prev["path"], version=prev.get("version"), source=prev.get("source", ""),
            notes="rollback", promoted_by=promoted_by, reason="rollback",
        )

    def production(self) -> Optional[dict]:
        prod = self._data.get("production")
        return dict(prod) if isinstance(prod, dict) else None

    def production_path(self) -> Optional[str]:
        prod = self._data.get("production")
        return prod.get("path") if isinstance(prod, dict) else None

    def versions(self) -> List[dict]:
        return list(self._data.get("versions", []))  # type: ignore[arg-type]
