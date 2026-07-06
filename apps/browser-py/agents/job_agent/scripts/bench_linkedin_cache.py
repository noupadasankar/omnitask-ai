"""LinkedIn cold-vs-warm selector benchmark — proves the cache/brain latency win.

This is the "Week 1" deliverable D, written against the REAL cognition engine
(no duplicate parser/cache): it drives the actual `Perception`, `ReasoningEngine`
(`LocalLLMClient`), `SelectorMemory`, and `ToolExecutor` to measure how long it
takes to resolve and click LinkedIn's **Easy Apply** control two ways:

  • COLD  — observe the page, then ask the local reasoning model which element is
            "Easy Apply" (the LLM inference path). The proven selector is then
            written to `SelectorMemory` exactly as the live loop does.
  • WARM  — resolve the same control from `SelectorMemory` (the cache fast-path,
            no LLM) and click it via `ToolExecutor.exec_by_selector`.

It then prints a timing table (perception / cold-LLM / warm-cache / speedup).

SAFETY: this benchmark only *opens* the Easy Apply modal (clicking "Easy Apply"
sends nothing). It NEVER fills a field, and NEVER clicks Submit/Send/Apply-now —
every click target is guarded against consequential verbs. The modal is closed
(Escape) between phases. No application is submitted.

Run from the job_agent directory (first run: log in to LinkedIn in the window
that opens; the session persists in the profile dir for later runs):

    python scripts/bench_linkedin_cache.py

Useful env:
    PLAYWRIGHT_HEADLESS=true        run headless (default: headful, for login)
    BENCH_KEYWORDS="Software Engineer"   search query (default: Software Engineer)
    BENCH_PROFILE_DIR=profiles/linkedin_bench   persistent profile location
    BENCH_LOGIN_WAIT=180           seconds to wait for a manual login
"""

from __future__ import annotations

import asyncio
import os
import sys
import time
import urllib.parse
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Make `src...` importable when run as a script (mirrors scripts/smoke_local.py).
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from playwright.async_api import async_playwright  # noqa: E402

from src.cognition.engine import LocalEngine  # noqa: E402
from src.cognition.perception import Observation, Perception  # noqa: E402
from src.cognition.brain.reasoning_engine import ReasoningEngine  # noqa: E402
from src.cognition.browser_tools import ToolExecutor  # noqa: E402
from src.cognition.learning.pattern_learning import domain_of  # noqa: E402

# ── Config ────────────────────────────────────────────────────────────────────
KEYWORDS = os.environ.get("BENCH_KEYWORDS", "Software Engineer")
HEADLESS = os.environ.get("PLAYWRIGHT_HEADLESS", "false").strip().lower() in (
    "1", "true", "yes", "on",
)
PROFILE_DIR = os.environ.get("BENCH_PROFILE_DIR", "profiles/linkedin_bench")
LOGIN_WAIT_S = int(os.environ.get("BENCH_LOGIN_WAIT", "180"))

# The intent key under which the Easy Apply control is remembered/looked up.
# `SelectorMemory.normalize_intent` reduces both sides to "easy apply".
EASY_APPLY_INTENT = "easy apply"

# A click target is allowed only if it looks like the Easy Apply *entry* button.
_EASY_APPLY_HINTS = ("easy apply",)
# Hard guard: never click anything that could submit/advance an application.
_CONSEQUENTIAL_HINTS = (
    "submit", "send", "apply now", "review", "next", "continue", "pay", "post",
)


def _looks_like_easy_apply(label: str, text: str) -> bool:
    blob = f"{label} {text}".lower()
    if any(h in blob for h in _CONSEQUENTIAL_HINTS):
        return False
    return any(h in blob for h in _EASY_APPLY_HINTS)


def _search_url(keywords: str) -> str:
    q = urllib.parse.urlencode({"keywords": keywords})
    return f"https://www.linkedin.com/jobs/search/?{q}"


# ── Browser lifecycle ───────────────────────────────────────────────────────────
async def _launch(p):
    """Persistent context so the LinkedIn session survives across runs."""
    Path(PROFILE_DIR).mkdir(parents=True, exist_ok=True)
    context = await p.chromium.launch_persistent_context(
        user_data_dir=PROFILE_DIR,
        headless=HEADLESS,
        viewport={"width": 1440, "height": 900},
        args=["--disable-blink-features=AutomationControlled"],
    )
    page = context.pages[0] if context.pages else await context.new_page()
    return context, page


async def _is_logged_in(page) -> bool:
    """Heuristic: the global nav 'Me' menu only renders for authenticated users."""
    try:
        url = page.url
        if "/login" in url or "/checkpoint" in url or "/authwall" in url:
            return False
        return await page.locator("img.global-nav__me-photo, .global-nav__me").count() > 0
    except Exception:
        return False


async def _ensure_logged_in(page) -> bool:
    """Navigate to the feed; if not authenticated, wait for a manual login."""
    try:
        await page.goto("https://www.linkedin.com/feed/", wait_until="domcontentloaded", timeout=60000)
    except Exception:
        pass
    if await _is_logged_in(page):
        return True
    if HEADLESS:
        print("  ✗ Not logged in and running headless — cannot log in interactively.")
        print("    Run once headful (unset PLAYWRIGHT_HEADLESS) to seed the profile, then re-run.")
        return False
    print(f"  → Please log in to LinkedIn in the open window (waiting up to {LOGIN_WAIT_S}s)...")
    deadline = time.perf_counter() + LOGIN_WAIT_S
    while time.perf_counter() < deadline:
        if await _is_logged_in(page):
            print("  ✓ Login detected.")
            return True
        await asyncio.sleep(2.0)
    print("  ✗ Timed out waiting for login.")
    return False


# ── Page setup: surface an Easy Apply control ───────────────────────────────────
async def _open_job_with_easy_apply(
    page, perception: Perception, executor: ToolExecutor, *, max_cards: int = 6
) -> Tuple[Optional[Observation], Optional[int]]:
    """Open the search results and click job cards until a detail pane exposes an
    Easy Apply button. Returns (observation, easy_apply_ref) or (obs, None)."""
    await page.goto(_search_url(KEYWORDS), wait_until="domcontentloaded", timeout=60000)
    await asyncio.sleep(3.0)  # let the results list hydrate

    obs = await perception.observe()
    ref = _find_easy_apply_ref(obs)
    if ref is not None:
        return obs, ref

    # Click successive job-card links, re-observing for an Easy Apply button.
    cards = page.locator("a.job-card-container__link, a.job-card-list__title, "
                         "li.jobs-search-results__list-item a[href*='/jobs/view/']")
    n = min(await cards.count(), max_cards)
    for i in range(n):
        try:
            await cards.nth(i).click(timeout=8000)
        except Exception:
            continue
        await asyncio.sleep(2.5)  # detail pane loads
        obs = await perception.observe()
        ref = _find_easy_apply_ref(obs)
        if ref is not None:
            return obs, ref
    return obs, None


def _find_easy_apply_ref(obs: Observation) -> Optional[int]:
    """Heuristic scan of the observation for an Easy Apply entry control."""
    for el in obs.elements:
        if el.get("disabled"):
            continue
        if _looks_like_easy_apply(el.get("label", ""), el.get("text", "")):
            return el.get("ref")
    return None


async def _close_modal(page) -> None:
    """Dismiss the Easy Apply modal so the entry button is clickable again.
    Escape opens a 'Discard application?' confirm on LinkedIn — confirm discard."""
    try:
        await page.keyboard.press("Escape")
        await asyncio.sleep(0.8)
        discard = page.get_by_role("button", name="Discard")
        if await discard.count() > 0:
            await discard.first.click(timeout=4000)
            await asyncio.sleep(0.8)
    except Exception:
        pass


# ── COLD: LLM resolves the Easy Apply selector ──────────────────────────────────
async def _cold_resolve(
    reasoner: ReasoningEngine, obs: Observation, llm_up: bool
) -> Tuple[Optional[int], float, str]:
    """Ask the local model which element is Easy Apply. Returns (ref, llm_seconds,
    mode). Falls back to a DOM heuristic (clearly labelled) when the LLM is down."""
    if not llm_up:
        return _find_easy_apply_ref(obs), 0.0, "DOM heuristic (LLM offline)"

    system = reasoner.system_prompt()  # generic core + action catalogue
    user = (
        f"GOAL: Click the LinkedIn 'Easy Apply' button to OPEN the application "
        f"form. Do NOT fill or submit anything — only open it.\n\n"
        f"CURRENT OBSERVATION:\n{obs.render()}\n\n"
        f"Reply with the click action targeting the Easy Apply control."
    )
    messages: List[Dict[str, Any]] = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]
    t0 = time.perf_counter()
    decision = await reasoner.decide(messages)
    llm_s = time.perf_counter() - t0

    ref = None
    if decision.valid and decision.tool == "click":
        try:
            ref = int(decision.args.get("ref"))
        except (TypeError, ValueError):
            ref = None
    # Verify the model's pick really is an Easy Apply control (safety + accuracy).
    if ref is not None and not _ref_is_easy_apply(obs, ref):
        print(f"    ! Model picked ref={ref} which isn't an Easy Apply control; "
              f"using DOM heuristic for the click instead.")
        ref = _find_easy_apply_ref(obs)
    return ref, llm_s, f"LLM ({decision.tool or 'no-action'})"


def _ref_is_easy_apply(obs: Observation, ref: int) -> bool:
    for el in obs.elements:
        if el.get("ref") == ref:
            return _looks_like_easy_apply(el.get("label", ""), el.get("text", ""))
    return False


# ── Report ──────────────────────────────────────────────────────────────────────
def _print_report(rows: List[Tuple[str, str]]) -> None:
    width = max(len(k) for k, _ in rows) + 2
    print("\n" + "=" * (width + 22))
    print("  LINKEDIN SELECTOR BENCHMARK — cold (LLM) vs warm (cache)")
    print("=" * (width + 22))
    for k, v in rows:
        print(f"  {k.ljust(width)}{v}")
    print("=" * (width + 22))


async def main() -> int:
    print("LinkedIn cache/brain benchmark")
    print(f"  keywords    : {KEYWORDS!r}")
    print(f"  headless    : {HEADLESS}")
    print(f"  profile dir : {PROFILE_DIR}")

    engine = LocalEngine()
    llm_up = await engine.is_available()
    print(f"  LLM backend : {engine.host} / {engine.model} "
          f"({'reachable' if llm_up else 'OFFLINE — cold phase uses DOM heuristic'})")

    async with async_playwright() as p:
        context, page = await _launch(p)
        try:
            if not await _ensure_logged_in(page):
                return 1

            perception = Perception(page)
            executor = ToolExecutor(page)
            reasoner = ReasoningEngine(engine.llm)

            print(f"\n[1/4] Searching jobs for {KEYWORDS!r} and finding an Easy Apply listing...")
            obs, ref = await _open_job_with_easy_apply(page, perception, executor)
            if obs is None or ref is None:
                print("  ✗ No Easy Apply control found on the sampled listings "
                      "(LinkedIn often mixes in off-site 'Apply' jobs). Try re-running, "
                      "or set BENCH_KEYWORDS to a query with more Easy Apply roles.")
                return 2
            domain = domain_of(obs.url)
            await engine.selector_memory.prime(domain)  # pull any fleet-wide entry
            print(f"  ✓ Easy Apply control found (ref={ref}) on {domain}.")

            # ── COLD: LLM (or heuristic) resolves the selector, then we click ────
            print("\n[2/4] COLD — resolving Easy Apply via the reasoning model...")
            t_obs0 = time.perf_counter()
            obs = await perception.observe()  # fresh, timed observation
            perceive_s = time.perf_counter() - t_obs0
            cold_ref, llm_s, mode = await _cold_resolve(reasoner, obs, llm_up)
            if cold_ref is None:
                print("  ✗ Could not resolve an Easy Apply control this turn.")
                return 3

            selector = obs.selector_for(cold_ref)
            label = next((e.get("label") or e.get("text") or ""
                          for e in obs.elements if e.get("ref") == cold_ref), "")
            if not _looks_like_easy_apply(label, ""):
                print(f"  ✗ Resolved control {label!r} failed the Easy Apply safety "
                      f"guard; aborting before any click.")
                return 4

            t_act0 = time.perf_counter()
            click_res = await executor.execute("click", {"ref": cold_ref})
            cold_act_s = time.perf_counter() - t_act0
            cold_total_s = perceive_s + llm_s + cold_act_s
            print(f"  · perception      : {perceive_s * 1000:7.0f} ms")
            print(f"  · selector resolve: {llm_s * 1000:7.0f} ms   [{mode}]")
            print(f"  · click (open)    : {cold_act_s * 1000:7.0f} ms   {click_res}")

            # Persist the proven selector exactly as the live loop does, then
            # close the modal so the entry button is clickable again.
            if selector and not str(click_res).startswith("ERROR"):
                engine.selector_memory.remember(domain, EASY_APPLY_INTENT, selector, "click")
                await engine.selector_memory.push_global(domain, EASY_APPLY_INTENT, selector, "click")
                print(f"  ✓ Remembered selector for '{EASY_APPLY_INTENT}': {selector!r}")
            else:
                print("  ! No stable selector captured (LinkedIn control lacked id/name/"
                      "aria-label) — warm phase will show this as a cache-unusable case.")
            await _close_modal(page)
            await asyncio.sleep(1.5)

            # ── WARM: cache resolves the same control, no LLM ───────────────────
            print("\n[3/4] WARM — resolving Easy Apply from SelectorMemory (no LLM)...")
            t_look0 = time.perf_counter()
            entry = engine.selector_memory.lookup(domain, EASY_APPLY_INTENT)
            lookup_s = time.perf_counter() - t_look0
            warm_total_s: Optional[float] = None
            warm_note = ""
            if not entry or not entry.get("selector"):
                warm_note = "cache MISS (nothing remembered)"
            else:
                cached_sel = entry["selector"]
                t_warm0 = time.perf_counter()
                if not await executor.present(cached_sel):
                    warm_note = (f"selector {cached_sel!r} not uniquely present — the live "
                                 f"loop would re-observe & invalidate (selector-stability "
                                 f"finding, not a timing win)")
                else:
                    warm_res = await executor.exec_by_selector("click", cached_sel)
                    warm_act_s = time.perf_counter() - t_warm0
                    warm_total_s = lookup_s + warm_act_s
                    print(f"  · cache lookup    : {lookup_s * 1000:7.3f} ms")
                    print(f"  · click (open)    : {warm_act_s * 1000:7.0f} ms   {warm_res}")
                    if str(warm_res).startswith("ERROR"):
                        warm_note = "cached click errored (stale) — loop would invalidate"
                        warm_total_s = None
                    await _close_modal(page)

            print("\n[4/4] Done — see summary below.")

            # ── Summary table ───────────────────────────────────────────────────
            rows: List[Tuple[str, str]] = [
                ("domain", domain),
                ("LLM backend", f"{engine.host} / {engine.model}"
                                + ("" if llm_up else "  (offline)")),
                ("cold: perception", f"{perceive_s * 1000:.0f} ms"),
                ("cold: selector resolve", f"{llm_s * 1000:.0f} ms  [{mode}]"),
                ("cold: total", f"{cold_total_s * 1000:.0f} ms"),
            ]
            if warm_total_s is not None:
                speedup = cold_total_s / warm_total_s if warm_total_s > 0 else float("inf")
                resolve_speedup = (llm_s / lookup_s) if lookup_s > 0 and llm_s > 0 else None
                rows += [
                    ("warm: cache lookup", f"{lookup_s * 1000:.3f} ms"),
                    ("warm: total", f"{warm_total_s * 1000:.0f} ms"),
                    ("speedup (total)", f"{speedup:.1f}x faster warm"),
                ]
                if resolve_speedup:
                    rows.append(("speedup (resolve only)",
                                 f"{resolve_speedup:,.0f}x (LLM vs cache lookup)"))
            else:
                rows.append(("warm", warm_note or "unavailable"))
            _print_report(rows)
            return 0
        finally:
            await context.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
