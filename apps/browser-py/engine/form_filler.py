"""Smart form filler — AI-powered detection and filling of every form field type.

Handles text, email, tel, date pickers, dropdowns, radio, checkbox, file uploads,
rich text editors, autocomplete/combobox fields, and multi-step forms.
HARD BLOCKS: credit_card, cvv, ssn, national_id, otp, 2fa_code — always pause.
"""

import asyncio
import logging
import random
import re
from dataclasses import dataclass
from typing import Optional

log = logging.getLogger("browser-py.engine.form_filler")

_HARD_BLOCKED_PATTERNS = [
    r"credit.?card", r"card.?number", r"cvv", r"cvc", r"security.?code",
    r"ssn", r"social.?security", r"national.?id", r"aadhaar", r"aadhar",
    r"\botp\b", r"one.?time.?pass", r"2fa", r"two.?factor", r"auth.?code",
    r"\bpin\b", r"card.?expir",
]

_SENSITIVE_INPUT_TYPES = {"password", "credit-card-number", "cc-number"}


@dataclass
class FieldAnalysis:
    field_id: str           # unique within form
    field_type: str         # text|email|tel|date|select|radio|checkbox|textarea|file|rich_text|autocomplete|password|otp
    label: str
    required: bool
    current_value: str
    is_blocked: bool
    block_reason: str
    locator_string: str     # Playwright locator for this field
    placeholder: str = ""
    options: list = None    # for select fields


@dataclass
class FillResult:
    field_id: str
    success: bool
    value_used: str
    error: Optional[str]


class FormFiller:
    """Detects and fills web form fields with AI-powered autofill."""

    async def analyze_form(self, page, form_selector: str = "form") -> list[FieldAnalysis]:
        """Return structured analysis of all fields in the form."""
        fields: list[FieldAnalysis] = []

        try:
            form = page.locator(form_selector).first
            raw = await page.evaluate(
                """(formSel) => {
                const form = document.querySelector(formSel) || document.body;
                const inputs = form.querySelectorAll(
                  'input, select, textarea, [contenteditable="true"], [role="combobox"], [role="listbox"]'
                );
                return Array.from(inputs).map((el, idx) => {
                  const id = el.id || el.name || 'field_' + idx;
                  const type = el.type || el.tagName.toLowerCase() || 'text';
                  const label = (() => {
                    if (el.labels && el.labels.length) return el.labels[0].textContent.trim();
                    const ariaLbl = el.getAttribute('aria-label') || '';
                    if (ariaLbl) return ariaLbl;
                    const placeholder = el.placeholder || '';
                    if (placeholder) return placeholder;
                    const prev = el.previousElementSibling;
                    if (prev && prev.tagName === 'LABEL') return prev.textContent.trim();
                    return id;
                  })();
                  const required = el.required || el.getAttribute('aria-required') === 'true';
                  const value = el.value || el.textContent || '';
                  const options = el.tagName === 'SELECT'
                    ? Array.from(el.options).map(o => ({value: o.value, text: o.text}))
                    : null;
                  return {id, type, label, required, value, placeholder: el.placeholder || '', options};
                });
              }""",
                form_selector,
            )

            for idx, f in enumerate(raw or []):
                field_type = self._detect_field_type(f)
                is_blocked, block_reason = self._is_hard_blocked(f)
                locator = (
                    f'#{f["id"]}' if f["id"] and not f["id"].startswith("field_")
                    else f'[name="{f["id"]}"]' if f["id"]
                    else f'form input:nth-of-type({idx+1})'
                )
                fields.append(FieldAnalysis(
                    field_id=f["id"],
                    field_type=field_type,
                    label=f["label"] or f["id"],
                    required=f.get("required", False),
                    current_value=str(f.get("value", "") or ""),
                    is_blocked=is_blocked,
                    block_reason=block_reason,
                    locator_string=locator,
                    placeholder=f.get("placeholder", ""),
                    options=f.get("options"),
                ))
        except Exception as exc:
            log.warning("analyze_form failed: %s", exc)

        return fields

    async def fill_form(
        self, page, data: dict, *, form_selector: str = "form"
    ) -> list[FillResult]:
        """Fill a form with the provided data dict (label/name → value)."""
        fields = await self.analyze_form(page, form_selector)
        results: list[FillResult] = []

        for field in fields:
            # Match data key by label or field_id
            value = None
            for key in data:
                if (
                    key.lower() in field.label.lower()
                    or field.label.lower() in key.lower()
                    or key.lower() == field.field_id.lower()
                ):
                    value = data[key]
                    break

            if value is None:
                continue  # No data provided for this field

            result = await self.fill_field(page, field, str(value))
            results.append(result)
            await asyncio.sleep(random.uniform(0.1, 0.3))

        return results

    async def fill_field(self, page, field: FieldAnalysis, value: str) -> FillResult:
        """Fill a single analyzed field."""
        if field.is_blocked:
            return FillResult(
                field_id=field.field_id,
                success=False,
                value_used="",
                error=f"BLOCKED: {field.block_reason}",
            )

        try:
            if field.field_type in ("text", "email", "tel", "url", "search", "number"):
                success = await self.fill_text_input(page, field.locator_string, value)
            elif field.field_type == "textarea":
                success = await self.fill_text_input(page, field.locator_string, value)
            elif field.field_type == "select":
                success = await self.fill_select(page, field.locator_string, value)
            elif field.field_type == "date":
                success = await self.fill_date(page, field.locator_string, value)
            elif field.field_type == "checkbox":
                success = await self._fill_checkbox(page, field.locator_string, value)
            elif field.field_type == "radio":
                success = await self._fill_radio(page, field.locator_string, value)
            elif field.field_type == "file":
                success = await self.fill_file_upload(page, field.locator_string, value)
            elif field.field_type == "autocomplete":
                success = await self.fill_autocomplete(page, field.locator_string, value)
            elif field.field_type == "rich_text":
                success = await self._fill_rich_text(page, field.locator_string, value)
            else:
                success = await self.fill_text_input(page, field.locator_string, value)

            return FillResult(
                field_id=field.field_id,
                success=success,
                value_used=value if success else "",
                error=None if success else "fill operation returned False",
            )
        except Exception as exc:
            log.warning("fill_field %s failed: %s", field.field_id, exc)
            return FillResult(field_id=field.field_id, success=False, value_used="", error=str(exc))

    async def fill_text_input(
        self,
        page,
        locator: str,
        value: str,
        *,
        clear_first: bool = True,
        human_typing: bool = True,
    ) -> bool:
        """Fill a text input. human_typing adds per-char delays to avoid bot detection."""
        try:
            el = page.locator(locator).first
            await el.wait_for(state="visible", timeout=5000)
            await el.scroll_into_view_if_needed()

            if clear_first:
                await el.triple_click()
                await asyncio.sleep(0.1)

            if human_typing:
                await el.type(value, delay=random.randint(30, 80))
            else:
                await el.fill(value)

            return True
        except Exception as exc:
            log.debug("fill_text_input %s failed: %s", locator, exc)
            return False

    async def fill_select(self, page, locator: str, value: str) -> bool:
        """Fill a select dropdown — native first, custom component fallback."""
        try:
            el = page.locator(locator).first
            await el.wait_for(state="visible", timeout=3000)

            # Try native select
            try:
                await el.select_option(label=value, timeout=2000)
                return True
            except Exception:
                pass
            try:
                await el.select_option(value=value, timeout=2000)
                return True
            except Exception:
                pass

            # Custom dropdown: click to open, then click option
            await el.click()
            await asyncio.sleep(0.3)
            option = page.get_by_role("option", name=re.compile(re.escape(value), re.IGNORECASE)).first
            await option.click(timeout=3000)
            return True
        except Exception as exc:
            log.debug("fill_select %s failed: %s", locator, exc)
            return False

    async def fill_date(self, page, locator: str, date_str: str) -> bool:
        """Fill a date field. date_str: YYYY-MM-DD."""
        try:
            el = page.locator(locator).first
            await el.wait_for(state="visible", timeout=3000)

            # Native date input
            input_type = await el.get_attribute("type") or ""
            if input_type == "date":
                await el.fill(date_str)
                return True

            # Try filling as text
            parts = date_str.split("-")
            if len(parts) == 3:
                formatted = f"{parts[2]}/{parts[1]}/{parts[0]}"  # DD/MM/YYYY
                await el.fill(formatted)
                return True

            await el.fill(date_str)
            return True
        except Exception as exc:
            log.debug("fill_date %s failed: %s", locator, exc)
            return False

    async def fill_file_upload(self, page, locator: str, file_path: str) -> bool:
        """Upload a file to a file input."""
        try:
            el = page.locator(locator).first
            await el.set_input_files(file_path)
            return True
        except Exception as exc:
            log.debug("fill_file_upload %s failed: %s", locator, exc)
            return False

    async def fill_autocomplete(
        self, page, locator: str, value: str, *, wait_ms: int = 600
    ) -> bool:
        """Type into autocomplete, wait for suggestions, click match."""
        try:
            el = page.locator(locator).first
            await el.wait_for(state="visible", timeout=3000)
            await el.type(value[:3], delay=60)  # Type prefix to trigger suggestions
            await asyncio.sleep(wait_ms / 1000)

            # Click the best matching suggestion
            option = page.get_by_role(
                "option", name=re.compile(re.escape(value), re.IGNORECASE)
            ).first
            await option.click(timeout=3000)
            return True
        except Exception:
            # Fallback: just type the full value
            try:
                await page.locator(locator).first.fill(value)
                return True
            except Exception as exc:
                log.debug("fill_autocomplete %s failed: %s", locator, exc)
                return False

    async def detect_blocked_fields(self, page) -> list[FieldAnalysis]:
        """Return only the fields that are hard-blocked (password, CC, OTP, etc.)."""
        all_fields = await self.analyze_form(page)
        return [f for f in all_fields if f.is_blocked]

    # ── Private helpers ───────────────────────────────────────────────────────

    async def _fill_checkbox(self, page, locator: str, value: str) -> bool:
        should_check = value.lower() in ("true", "yes", "1", "checked", "on")
        try:
            el = page.locator(locator).first
            is_checked = await el.is_checked()
            if should_check and not is_checked:
                await el.check()
            elif not should_check and is_checked:
                await el.uncheck()
            return True
        except Exception:
            return False

    async def _fill_radio(self, page, locator: str, value: str) -> bool:
        try:
            # Find radio button with matching value or label
            radio = page.locator(f'{locator}[value="{value}"]').first
            await radio.check(timeout=2000)
            return True
        except Exception:
            try:
                # Try by label
                label = page.get_by_label(re.compile(re.escape(value), re.IGNORECASE)).first
                await label.check(timeout=2000)
                return True
            except Exception:
                return False

    async def _fill_rich_text(self, page, locator: str, value: str) -> bool:
        try:
            el = page.locator(locator).first
            await el.click()
            await asyncio.sleep(0.2)
            # Select all and replace
            await page.keyboard.press("Control+a")
            await page.keyboard.type(value)
            return True
        except Exception:
            return False

    def _detect_field_type(self, field_info: dict) -> str:
        ftype = (field_info.get("type") or "").lower()
        tag = (field_info.get("tag") or field_info.get("id") or "").lower()
        label = (field_info.get("label") or "").lower()

        if ftype == "password":
            return "password"
        if ftype in ("file", "upload"):
            return "file"
        if ftype == "checkbox":
            return "checkbox"
        if ftype == "radio":
            return "radio"
        if ftype == "date":
            return "date"
        if ftype in ("email",):
            return "email"
        if ftype in ("tel", "phone"):
            return "tel"
        if tag == "select" or field_info.get("options"):
            return "select"
        if tag == "textarea":
            return "textarea"
        if "contenteditable" in str(field_info) or "rich" in label:
            return "rich_text"
        if any(kw in label for kw in ["city", "country", "location", "address"]):
            return "autocomplete"
        return "text"

    def _is_hard_blocked(self, field_info: dict) -> tuple[bool, str]:
        label = (field_info.get("label") or field_info.get("id") or "").lower()
        ftype = (field_info.get("type") or "").lower()

        if ftype == "password":
            return True, "Password fields are never auto-filled — user must enter manually"

        for pattern in _HARD_BLOCKED_PATTERNS:
            if re.search(pattern, label, re.IGNORECASE):
                return True, f"Sensitive field matched pattern '{pattern}' — user must enter manually"

        if ftype in _SENSITIVE_INPUT_TYPES:
            return True, f"Input type '{ftype}' is hard-blocked for security"

        return False, ""
