"""The universal computer-use layer — semantic browser actions.

This is the action half of "computer.click / type / scroll …": a small set of
site-agnostic primitives that operate on elements by their `[ref]` from the latest
observation (resolved via the `data-cog-ref` attribute the DOM reader writes). No
per-site selectors — the same surface drives any recruitment site.

`ACTIONS_DOC` is the action catalogue the reasoning model is shown; `ToolExecutor`
runs the chosen action against the live Playwright page.

(In the requested cognition tree this module is the `browser/action_executor`.)
"""

from __future__ import annotations

import asyncio
from typing import Any, Dict, Tuple

from . import humanizer

# Shown to the reasoning model so it knows the action vocabulary. The model
# replies with a single JSON object: {thought, assessment, action:{tool, ...}}.
ACTIONS_DOC = """AVAILABLE ACTIONS (choose exactly one per turn, by its `tool` name):
- click            {"tool":"click","ref":<int>}                  Click a button/link/tab/checkbox-label.
- fill             {"tool":"fill","ref":<int>,"text":"<str>"}     Type into a text input/textarea (clears first).
- select           {"tool":"select","ref":<int>,"option":"<visible option text>"}  Choose a <select> option.
- set_checkbox     {"tool":"set_checkbox","ref":<int>,"checked":<bool>}  Check/uncheck a checkbox or radio.
- press_key        {"tool":"press_key","key":"Enter|Escape|Tab|..."}    Press a keyboard key (e.g. Space to play/pause media).
- scroll           {"tool":"scroll","direction":"down|up"}         Reveal more of the page/modal.
- navigate         {"tool":"navigate","url":"<absolute url>"}      Go to a URL.
- go_back          {"tool":"go_back"}                              Navigate back in history.
- wait             {"tool":"wait","ms":<int>}                      Pause (page to settle, media to play). Max 15000.
- upload           {"tool":"upload","ref":<int>,"path":"<server file path>"}  Set a file on a file input.
- extract          {"tool":"extract","data":{...}}                 Record structured info the task asked for (no page change). Call repeatedly to collect a list.
- get_screenshot   {"tool":"get_screenshot","question":"<what to look for>"}  Inspect the page visually (local vision model) when the DOM is ambiguous.
- request_human    {"tool":"request_human","question":"<what you need>"}  Escalate an unanswerable/consequential required field (never fabricate).
- finish           {"tool":"finish","status":"done|already_applied|blocked|abandoned","summary":"<one line>"}  End the task (use "done" when the goal is achieved)."""

# Tools the loop interprets itself rather than running against the page.
CONTROL_TOOLS = {"finish", "request_human"}
# Tool whose args the loop captures into the world model (no page operation).
EXTRACT_TOOL = "extract"
VISION_TOOL = "get_screenshot"


class ToolExecutor:
    """Executes page actions by element ref. Returns a human-readable result."""

    def __init__(self, page):
        self.page = page

    def _locator(self, ref: Any):
        return self.page.locator(f'[data-cog-ref="{int(ref)}"]').first

    async def execute(self, tool: str, args: Dict[str, Any]) -> str:
        try:
            if tool == "click":
                return await self._click(args["ref"])
            if tool == "fill":
                return await self._fill(args["ref"], str(args.get("text", "")))
            if tool == "select":
                return await self._select(args["ref"], str(args.get("option", "")))
            if tool == "set_checkbox":
                return await self._checkbox(args["ref"], bool(args.get("checked", True)))
            if tool == "press_key":
                return await self._press(str(args.get("key", "")))
            if tool == "scroll":
                return await self._scroll(str(args.get("direction", "down")))
            if tool == "navigate":
                return await self._navigate(str(args.get("url", "")))
            if tool == "go_back":
                return await self._go_back()
            if tool == "wait":
                return await self._wait(args.get("ms", 1000))
            if tool == "upload":
                return await self._upload(args["ref"], str(args.get("path", "")))
            return f"Unknown or non-page action: {tool}"
        except Exception as exc:  # noqa: BLE001 — report to the model, never crash the loop
            return f"ERROR running {tool}: {exc}"

    async def screenshot_b64(self) -> str:
        """JPEG screenshot as base64 (used by the vision reader)."""
        import base64
        png = await self.page.screenshot(type="jpeg", quality=60, full_page=False)
        return base64.b64encode(png).decode("ascii")

    async def _click(self, ref: Any) -> str:
        loc = self._locator(ref)
        await humanizer.human_click(self.page, loc)
        await asyncio.sleep(1.2)
        return f"Clicked element [{int(ref)}]."

    async def _fill(self, ref: Any, text: str) -> str:
        loc = self._locator(ref)
        try:
            await loc.scroll_into_view_if_needed(timeout=4000)
        except Exception:
            pass
        await humanizer.human_type(self.page, loc, text)
        await asyncio.sleep(0.4)
        return f'Filled element [{int(ref)}] with "{text}".'

    async def _select(self, ref: Any, option: str) -> str:
        loc = self._locator(ref)
        try:
            await loc.select_option(label=option, timeout=6000)
            return f'Selected "{option}" in [{int(ref)}].'
        except Exception:
            try:
                await loc.select_option(value=option, timeout=6000)
                return f'Selected "{option}" (by value) in [{int(ref)}].'
            except Exception as exc:
                return f'Could not select "{option}" in [{int(ref)}]: {exc}'

    async def _checkbox(self, ref: Any, checked: bool) -> str:
        loc = self._locator(ref)
        try:
            await loc.scroll_into_view_if_needed(timeout=4000)
        except Exception:
            pass
        if checked:
            await loc.check(timeout=6000)
        else:
            await loc.uncheck(timeout=6000)
        await asyncio.sleep(0.3)
        return f"Set [{int(ref)}] checked={checked}."

    async def _press(self, key: str) -> str:
        await self.page.keyboard.press(key)
        await asyncio.sleep(0.6)
        return f"Pressed {key}."

    async def _scroll(self, direction: str) -> str:
        dy = 700 if direction == "down" else -700
        try:
            await self.page.mouse.wheel(0, dy)
        except Exception:
            await self.page.evaluate(f"window.scrollBy(0, {dy})")
        await asyncio.sleep(0.5)
        return f"Scrolled {direction}."

    async def _navigate(self, url: str) -> str:
        if not url:
            return "ERROR running navigate: no url given."
        if not url.startswith(("http://", "https://")):
            url = "https://" + url
        await self.page.goto(url, wait_until="domcontentloaded", timeout=30000)
        await asyncio.sleep(1.0)
        return f"Navigated to {self.page.url}."

    async def _go_back(self) -> str:
        try:
            await self.page.go_back(wait_until="domcontentloaded", timeout=20000)
        except Exception as exc:  # noqa: BLE001
            return f"Could not go back: {exc}"
        await asyncio.sleep(0.8)
        return f"Went back to {self.page.url}."

    async def _wait(self, ms: Any) -> str:
        try:
            ms_int = max(0, min(15000, int(ms)))
        except (TypeError, ValueError):
            ms_int = 1000
        await asyncio.sleep(ms_int / 1000)
        return f"Waited {ms_int}ms."

    # ── cache-first direct execution (by raw selector, bypassing refs) ────────

    async def present(self, selector: str) -> bool:
        """True when `selector` resolves to a single visible, enabled element —
        the precondition for trusting a cached selector without re-reasoning."""
        if not selector:
            return False
        try:
            loc = self.page.locator(selector)
            if await loc.count() != 1:
                return False
            first = loc.first
            return bool(await first.is_visible() and await first.is_enabled())
        except Exception:
            return False

    async def exec_by_selector(self, tool: str, selector: str, text: str = "") -> str:
        """Run a click/fill against a raw cached selector (humanized). Returns a
        human-readable result; an 'ERROR…' prefix signals the caller to fall back
        to reasoning and invalidate the cache entry."""
        try:
            loc = self.page.locator(selector).first
            if tool == "fill":
                await humanizer.human_type(self.page, loc, text)
                await asyncio.sleep(0.4)
                return f'Filled cached selector {selector!r} with "{text}".'
            # default: click
            await humanizer.human_click(self.page, loc)
            await asyncio.sleep(1.0)
            return f"Clicked cached selector {selector!r}."
        except Exception as exc:  # noqa: BLE001
            return f"ERROR running cached {tool} on {selector!r}: {exc}"

    async def _upload(self, ref: Any, path: str) -> str:
        if not path:
            return "ERROR running upload: no path given."
        import os
        if not os.path.exists(path):
            return f"ERROR running upload: file not found at {path}."
        loc = self._locator(ref)
        await loc.set_input_files(path, timeout=10000)
        await asyncio.sleep(0.5)
        return f"Uploaded {os.path.basename(path)} to [{int(ref)}]."
