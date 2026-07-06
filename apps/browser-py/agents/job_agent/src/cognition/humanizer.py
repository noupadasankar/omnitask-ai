"""Humanizer — make Playwright interactions look human, not scripted.

Pure-stdlib (random + math) helpers the ToolExecutor uses so typing and clicking
carry natural variance instead of instant/teleport automation: Gaussian per-key
delays with the occasional self-corrected typo, a curved (Bézier) mouse approach
to a target, and small idle viewport jitter.

This is an anti-detection convenience for driving the user's OWN logged-in
accounts; it is OFF-switchable via COG_HUMANIZE=false. It never changes WHAT is
typed/clicked — only the timing and trajectory.
"""

from __future__ import annotations

import asyncio
import math
import os
import random
import string

# Master switch. Default on, but conservative (small delays) so it never makes a
# run feel sluggish. Set COG_HUMANIZE=false to type/click instantly.
HUMANIZE = os.environ.get("COG_HUMANIZE", "true").strip().lower() not in (
    "0", "false", "no", "off",
)

# Per-character typing delay (ms): Gaussian, clamped to a sane band.
_TYPE_MEAN_MS = float(os.environ.get("COG_TYPE_MEAN_MS", "85"))
_TYPE_STD_MS = float(os.environ.get("COG_TYPE_STD_MS", "30"))
_TYPE_MIN_MS, _TYPE_MAX_MS = 25.0, 260.0
# Probability of a transient typo (wrong char → backspace → right char) per key.
_TYPO_PROB = float(os.environ.get("COG_TYPO_PROB", "0.0"))


def _gauss_delay_ms() -> float:
    return max(_TYPE_MIN_MS, min(_TYPE_MAX_MS, random.gauss(_TYPE_MEAN_MS, _TYPE_STD_MS)))


async def human_type(page, locator, text: str) -> None:
    """Type `text` into `locator` key-by-key with human-like timing.

    Falls back to a plain fill on any error so a humanizer hiccup never breaks an
    actual form submission.
    """
    if not HUMANIZE:
        await locator.fill(text)
        return
    try:
        await locator.click(timeout=8000)
        # Clear any existing value first (select-all + delete is layout-agnostic).
        await page.keyboard.press("Control+A")
        await page.keyboard.press("Delete")
        for ch in text:
            if _TYPO_PROB > 0 and ch not in string.whitespace and random.random() < _TYPO_PROB:
                wrong = random.choice(string.ascii_lowercase)
                await page.keyboard.type(wrong)
                await asyncio.sleep(_gauss_delay_ms() / 1000)
                await page.keyboard.press("Backspace")
                await asyncio.sleep(_gauss_delay_ms() / 1000)
            await page.keyboard.type(ch)
            await asyncio.sleep(_gauss_delay_ms() / 1000)
    except Exception:
        # Last-resort: ensure the field ends up with the intended value.
        try:
            await locator.fill(text)
        except Exception:
            pass


def _bezier_points(x0, y0, x1, y1, steps: int):
    """Quadratic Bézier from (x0,y0)→(x1,y1) with a random control point, so the
    cursor arcs toward the target instead of teleporting in a straight line."""
    # Control point offset perpendicular-ish to the path for a natural curve.
    cx = (x0 + x1) / 2 + random.uniform(-60, 60)
    cy = (y0 + y1) / 2 + random.uniform(-60, 60)
    pts = []
    for i in range(1, steps + 1):
        t = i / steps
        mt = 1 - t
        x = mt * mt * x0 + 2 * mt * t * cx + t * t * x1
        y = mt * mt * y0 + 2 * mt * t * cy + t * t * y1
        pts.append((x, y))
    return pts


async def human_move_to(page, x: float, y: float, *, start=None) -> None:
    """Move the mouse to (x, y) along a curved path with easing. No-op-safe."""
    if not HUMANIZE:
        try:
            await page.mouse.move(x, y)
        except Exception:
            pass
        return
    try:
        sx, sy = start or (random.uniform(0, 200), random.uniform(0, 200))
        dist = math.hypot(x - sx, y - sy)
        steps = max(8, min(40, int(dist / 18)))
        for px, py in _bezier_points(sx, sy, x, y, steps):
            await page.mouse.move(px, py)
            await asyncio.sleep(random.uniform(0.006, 0.018))
    except Exception:
        pass


async def human_click(page, locator) -> None:
    """Click `locator` after a curved mouse approach to its center. Falls back to
    a direct locator click if geometry isn't available."""
    if not HUMANIZE:
        await locator.click(timeout=8000)
        return
    try:
        await locator.scroll_into_view_if_needed(timeout=4000)
    except Exception:
        pass
    try:
        box = await locator.bounding_box()
    except Exception:
        box = None
    if not box:
        await locator.click(timeout=8000)
        return
    tx = box["x"] + box["width"] * random.uniform(0.35, 0.65)
    ty = box["y"] + box["height"] * random.uniform(0.35, 0.65)
    await human_move_to(page, tx, ty)
    await asyncio.sleep(random.uniform(0.04, 0.14))
    try:
        await page.mouse.click(tx, ty)
    except Exception:
        await locator.click(timeout=8000)


async def idle_jitter(page) -> None:
    """A tiny reading-pause scroll (3–5px) to mimic a human scanning a page."""
    if not HUMANIZE:
        return
    try:
        await page.mouse.wheel(0, random.randint(3, 5))
        await asyncio.sleep(random.uniform(0.05, 0.15))
    except Exception:
        pass
