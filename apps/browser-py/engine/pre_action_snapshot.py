"""Pre-action snapshots — serialize interactive browser state before risky actions.

Captures form values and storage state immediately before any MEDIUM/HIGH/CRITICAL
action executes. On failure or browser restart, the snapshot enables partial
reconstruction ("resume from last checkpoint" with pre-filled form values).

Serialization limits (documented, not bugs):
  - Rich text editors (Quill, ProseMirror, Slate) cannot be serialized
  - File inputs store filename only — the file object cannot be reconstructed
  - Custom React/Vue components with internal state are not captured
  - These gaps are reported in reconstruction_gaps so callers know what's missing
"""

import logging
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

log = logging.getLogger("browser-py.engine.pre_action_snapshot")


class SnapshotRisk(str, Enum):
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


_SNAPSHOT_RISKS = {SnapshotRisk.MEDIUM, SnapshotRisk.HIGH, SnapshotRisk.CRITICAL}


@dataclass
class PreActionSnapshot:
    snapshot_id: str
    workflow_id: str
    step_id: str
    risk_level: str             # SnapshotRisk value
    url: str
    captured_at: float
    form_fields: list           # list of field-state dicts
    storage_summary: dict       # {local_storage_keys, session_storage_keys, cookies_count}
    scroll_position: dict       # {x, y}
    active_element: Optional[str]
    can_reconstruct: bool       # True if all fields are serializable
    reconstruction_gaps: list   # descriptions of what cannot be reconstructed

    def to_dict(self) -> dict:
        return {
            "snapshot_id": self.snapshot_id,
            "workflow_id": self.workflow_id,
            "step_id": self.step_id,
            "risk_level": self.risk_level,
            "url": self.url,
            "captured_at": self.captured_at,
            "form_field_count": len(self.form_fields),
            "scroll_position": self.scroll_position,
            "active_element": self.active_element,
            "can_reconstruct": self.can_reconstruct,
            "reconstruction_gaps": self.reconstruction_gaps,
            "storage_summary": self.storage_summary,
        }


class PreActionSnapshotter:
    """Captures browser interactive state before risky actions execute."""

    def should_snapshot(self, risk_level: str) -> bool:
        try:
            return SnapshotRisk(risk_level) in _SNAPSHOT_RISKS
        except ValueError:
            return False

    async def capture(
        self,
        page,
        step_id: str,
        risk_level: str,
        workflow_id: str = "",
    ) -> Optional[PreActionSnapshot]:
        """Capture state. Returns None if risk_level is below MEDIUM."""
        if not self.should_snapshot(risk_level):
            return None

        url = ""
        try:
            url = page.url
        except Exception:
            pass

        form_fields, gaps = await self._capture_form_state(page)
        storage_summary = await self._capture_storage_summary(page)
        scroll_position = await self._capture_scroll(page)
        active_element = await self._capture_active_element(page)

        log.debug(
            "PreActionSnapshot: step=%s risk=%s fields=%d gaps=%d",
            step_id, risk_level, len(form_fields), len(gaps),
        )

        return PreActionSnapshot(
            snapshot_id=str(uuid.uuid4()),
            workflow_id=workflow_id,
            step_id=step_id,
            risk_level=risk_level,
            url=url,
            captured_at=time.time(),
            form_fields=form_fields,
            storage_summary=storage_summary,
            scroll_position=scroll_position,
            active_element=active_element,
            can_reconstruct=len(gaps) == 0,
            reconstruction_gaps=gaps,
        )

    async def _capture_form_state(self, page) -> tuple:
        try:
            result = await page.evaluate("""() => {
                const fields = [];
                const gaps = [];
                document.querySelectorAll('input, select, textarea').forEach(el => {
                    const rect = el.getBoundingClientRect();
                    const visible = rect.width > 0 && rect.height > 0;
                    const type = (el.type || el.tagName).toLowerCase();
                    const isRichText = !!el.closest('[contenteditable="true"], .ql-editor, .ProseMirror');
                    const sel = el.id ? '#' + el.id
                               : el.name ? '[name="' + el.name + '"]'
                               : null;
                    if (!sel) return;

                    let value = null;
                    if (isRichText) {
                        gaps.push(sel + ' (rich text editor — not serializable)');
                    } else if (type === 'file') {
                        value = el.files.length > 0 ? el.files[0].name : null;
                        if (el.files.length > 0) gaps.push(sel + ' (file input — filename only)');
                    } else if (type === 'checkbox' || type === 'radio') {
                        value = el.checked ? 'checked' : 'unchecked';
                    } else {
                        value = el.value || null;
                    }

                    const labelEl = document.querySelector('label[for="' + el.id + '"]');
                    fields.push({
                        selector: sel,
                        field_type: type,
                        value: value,
                        name: el.name || null,
                        label: labelEl ? labelEl.innerText.trim() : null,
                        is_required: el.required || false,
                        is_visible: visible,
                    });
                });
                return { fields, gaps };
            }""")
            return result.get("fields", []), result.get("gaps", [])
        except Exception as exc:
            log.warning("Form state capture failed: %s", exc)
            return [], []

    async def _capture_storage_summary(self, page) -> dict:
        summary = {"local_storage_keys": [], "session_storage_keys": [], "cookies_count": 0}
        try:
            summary["local_storage_keys"] = await page.evaluate("() => Object.keys(localStorage)")
        except Exception:
            pass
        try:
            summary["session_storage_keys"] = await page.evaluate("() => Object.keys(sessionStorage)")
        except Exception:
            pass
        try:
            cookies = await page.context.cookies()
            summary["cookies_count"] = len(cookies)
        except Exception:
            pass
        return summary

    async def _capture_scroll(self, page) -> dict:
        try:
            return await page.evaluate("() => ({x: window.scrollX, y: window.scrollY})")
        except Exception:
            return {"x": 0, "y": 0}

    async def _capture_active_element(self, page) -> Optional[str]:
        try:
            return await page.evaluate("""() => {
                const el = document.activeElement;
                if (!el || el === document.body) return null;
                return el.id ? '#' + el.id : (el.name ? '[name="' + el.name + '"]' : null);
            }""")
        except Exception:
            return None

    async def reconstruct(self, page, snapshot: PreActionSnapshot) -> dict:
        """Attempt to restore form state from a snapshot after a failure.

        Returns a reconstruction report with fields_restored and fields_failed.
        Skips file inputs (cannot reconstruct) and rich text editors.
        """
        try:
            current_url = page.url
        except Exception:
            current_url = ""

        if current_url != snapshot.url:
            return {
                "success": False,
                "reason": f"URL mismatch: snapshot={snapshot.url!r}, current={current_url!r}",
                "fields_restored": 0,
                "fields_failed": [],
            }

        restored = 0
        failed = []

        for fd in snapshot.form_fields:
            if fd.get("value") is None:
                continue
            sel = fd.get("selector")
            ftype = fd.get("field_type", "text")
            value = fd["value"]

            if ftype == "file":
                continue   # cannot reconstruct file inputs

            try:
                loc = page.locator(sel)
                if ftype == "checkbox":
                    should_check = value == "checked"
                    is_checked = await loc.is_checked()
                    if is_checked != should_check:
                        await loc.set_checked(should_check)
                elif ftype == "select":
                    await loc.select_option(value)
                else:
                    await loc.fill(value)
                restored += 1
            except Exception as exc:
                failed.append({"selector": sel, "reason": str(exc)})

        return {
            "success": len(failed) == 0,
            "fields_restored": restored,
            "fields_failed": failed,
            "reconstruction_gaps": snapshot.reconstruction_gaps,
        }
