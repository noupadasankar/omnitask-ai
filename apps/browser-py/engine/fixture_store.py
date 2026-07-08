"""Fixture store — persists FixtureBundles to disk and retrieves them by ID or filter.

Bundle layout on disk:
  fixtures/{fixture_id}/
    metadata.json       — scannable metadata (no DOM/screenshot)
    dom.html            — full hydrated DOM (outerHTML after networkidle)
    accessibility.json  — accessibility tree snapshot
    storage.json        — cookies, localStorage, sessionStorage
    console.json        — captured console messages
    screenshot.jpeg     — viewport screenshot (binary)
"""

import base64
import json
import logging
import shutil
import time
from pathlib import Path
from typing import Optional

from .fixture_capture import FixtureBundle

log = logging.getLogger("browser-py.engine.fixture_store")


class FixtureStore:
    """Saves and loads FixtureBundles to a local directory tree."""

    def __init__(self, base_dir: str = "./fixtures"):
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def save(self, bundle: FixtureBundle) -> Path:
        """Persist a FixtureBundle to disk. Returns the fixture directory."""
        fixture_dir = self.base_dir / bundle.fixture_id
        fixture_dir.mkdir(parents=True, exist_ok=True)

        meta = {
            "fixture_id": bundle.fixture_id,
            "workflow_id": bundle.workflow_id,
            "label": bundle.label,
            "url": bundle.url,
            "captured_at": bundle.captured_at,
            "dom_hash": bundle.dom_hash,
            "screenshot_hash": bundle.screenshot_hash,
            "element_count": bundle.element_count,
            "viewport": bundle.viewport,
            "metadata": bundle.metadata,
        }
        (fixture_dir / "metadata.json").write_text(json.dumps(meta, indent=2))
        (fixture_dir / "dom.html").write_text(bundle.dom_html, encoding="utf-8")
        (fixture_dir / "accessibility.json").write_text(
            json.dumps(bundle.accessibility_tree, indent=2)
        )
        (fixture_dir / "storage.json").write_text(json.dumps(bundle.storage, indent=2))
        (fixture_dir / "console.json").write_text(json.dumps(bundle.console_logs, indent=2))

        if bundle.screenshot_b64:
            (fixture_dir / "screenshot.jpeg").write_bytes(
                base64.b64decode(bundle.screenshot_b64)
            )

        log.info("Fixture saved: %s label=%s url=%s", bundle.fixture_id, bundle.label, bundle.url)
        return fixture_dir

    def load(self, fixture_id: str) -> Optional[FixtureBundle]:
        """Load a FixtureBundle from disk. Returns None if not found."""
        fixture_dir = self.base_dir / fixture_id
        if not fixture_dir.exists():
            log.warning("Fixture not found: %s", fixture_id)
            return None
        try:
            meta = json.loads((fixture_dir / "metadata.json").read_text())
            dom_html = (fixture_dir / "dom.html").read_text(encoding="utf-8")
            accessibility_tree = json.loads((fixture_dir / "accessibility.json").read_text())
            storage = json.loads((fixture_dir / "storage.json").read_text())
            console_logs = json.loads((fixture_dir / "console.json").read_text())

            screenshot_b64 = None
            screenshot_path = fixture_dir / "screenshot.jpeg"
            if screenshot_path.exists():
                screenshot_b64 = base64.b64encode(screenshot_path.read_bytes()).decode()

            return FixtureBundle(
                fixture_id=meta["fixture_id"],
                workflow_id=meta.get("workflow_id", ""),
                label=meta.get("label", ""),
                url=meta.get("url", ""),
                captured_at=meta.get("captured_at", 0.0),
                dom_html=dom_html,
                dom_hash=meta.get("dom_hash", ""),
                accessibility_tree=accessibility_tree,
                screenshot_b64=screenshot_b64,
                screenshot_hash=meta.get("screenshot_hash"),
                storage=storage,
                network_summary=[],
                console_logs=console_logs,
                element_count=meta.get("element_count", 0),
                viewport=meta.get("viewport", {"width": 1280, "height": 720}),
                metadata=meta.get("metadata", {}),
            )
        except Exception as exc:
            log.error("Failed to load fixture %s: %s", fixture_id, exc)
            return None

    def list_fixtures(self, workflow_id: str = "", label: str = "") -> list:
        """Return metadata dicts for all stored fixtures, optionally filtered."""
        results = []
        for fixture_dir in sorted(self.base_dir.iterdir()):
            meta_path = fixture_dir / "metadata.json"
            if not meta_path.exists():
                continue
            try:
                meta = json.loads(meta_path.read_text())
                if workflow_id and meta.get("workflow_id") != workflow_id:
                    continue
                if label and meta.get("label") != label:
                    continue
                results.append(meta)
            except Exception:
                continue
        return results

    def prune(self, older_than_days: int = 30) -> int:
        """Delete fixtures older than N days. Returns count deleted."""
        cutoff = time.time() - (older_than_days * 86400)
        deleted = 0
        for fixture_dir in list(self.base_dir.iterdir()):
            meta_path = fixture_dir / "metadata.json"
            if not meta_path.exists():
                continue
            try:
                meta = json.loads(meta_path.read_text())
                if meta.get("captured_at", 0) < cutoff:
                    shutil.rmtree(fixture_dir)
                    deleted += 1
            except Exception:
                continue
        log.info("Pruned %d fixtures older than %d days", deleted, older_than_days)
        return deleted

    def delete(self, fixture_id: str) -> bool:
        """Delete a specific fixture. Returns True if it existed."""
        fixture_dir = self.base_dir / fixture_id
        if fixture_dir.exists():
            shutil.rmtree(fixture_dir)
            log.info("Deleted fixture: %s", fixture_id)
            return True
        return False

    def size_bytes(self) -> int:
        """Total disk usage of all stored fixtures."""
        total = 0
        for p in self.base_dir.rglob("*"):
            if p.is_file():
                total += p.stat().st_size
        return total

    def save_versioned(self, bundle: "FixtureBundle", domain: str, label: str) -> Path:
        """Save with a version number under a stable domain/label path.

        Layout:
          {base_dir}/{domain}/{label}/v1/
          {base_dir}/{domain}/{label}/v2/
          ...

        Allows regression comparison: did the page change between v2 and v3?
        Does not modify bundle.fixture_id — version is tracked by directory only.
        """
        label_dir = self.base_dir / domain / label
        label_dir.mkdir(parents=True, exist_ok=True)

        existing = sorted(
            [d for d in label_dir.iterdir() if d.is_dir() and d.name.startswith("v")],
            key=lambda d: int(d.name[1:]) if d.name[1:].isdigit() else 0,
        )
        next_version = len(existing) + 1
        version_dir = label_dir / f"v{next_version}"
        version_dir.mkdir()

        # Save all bundle files into the versioned directory
        meta = {
            "fixture_id": bundle.fixture_id,
            "workflow_id": bundle.workflow_id,
            "label": label,
            "domain": domain,
            "version": next_version,
            "url": bundle.url,
            "captured_at": bundle.captured_at,
            "dom_hash": bundle.dom_hash,
            "screenshot_hash": bundle.screenshot_hash,
            "element_count": bundle.element_count,
            "viewport": bundle.viewport,
            "metadata": bundle.metadata,
        }
        (version_dir / "metadata.json").write_text(json.dumps(meta, indent=2))
        (version_dir / "dom.html").write_text(bundle.dom_html, encoding="utf-8")
        (version_dir / "accessibility.json").write_text(
            json.dumps(bundle.accessibility_tree, indent=2)
        )
        (version_dir / "storage.json").write_text(json.dumps(bundle.storage, indent=2))
        (version_dir / "console.json").write_text(json.dumps(bundle.console_logs, indent=2))
        if bundle.screenshot_b64:
            (version_dir / "screenshot.jpeg").write_bytes(
                base64.b64decode(bundle.screenshot_b64)
            )

        log.info(
            "Versioned fixture saved: %s/%s/v%d (fixture=%s)",
            domain, label, next_version, bundle.fixture_id,
        )
        return version_dir

    def list_versions(self, domain: str, label: str) -> list:
        """Return metadata for all versions of a domain/label fixture."""
        label_dir = self.base_dir / domain / label
        if not label_dir.exists():
            return []
        results = []
        for version_dir in sorted(
            [d for d in label_dir.iterdir() if d.is_dir()],
            key=lambda d: int(d.name[1:]) if d.name[1:].isdigit() else 0,
        ):
            meta_path = version_dir / "metadata.json"
            if meta_path.exists():
                try:
                    results.append(json.loads(meta_path.read_text()))
                except Exception:
                    continue
        return results
