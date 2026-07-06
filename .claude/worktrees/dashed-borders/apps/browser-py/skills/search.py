"""Real web search used by every skill.

Drives a live Google search (with consent-wall handling) and falls back to Bing.
Returns the extracted result blocks; the live viewport streams the whole thing.
"""

import asyncio
from urllib.parse import quote_plus

from . import extract


async def _dismiss_consent(page) -> None:
    """Best-effort click on a cookie/consent button so search can proceed."""
    for label in ("Accept all", "I agree", "Accept", "Reject all"):
        try:
            btn = page.get_by_role("button", name=label)
            if await btn.count() > 0:
                await btn.first.click(timeout=2000)
                await asyncio.sleep(0.5)
                return
        except Exception:
            continue


async def web_search(page, query: str) -> list:
    """Search the web for `query` and return result blocks (title/url/snippet)."""
    q = quote_plus(query)

    # ── Google first ──
    try:
        await page.goto(f"https://www.google.com/search?q={q}&hl=en", wait_until="domcontentloaded", timeout=30_000)
        await _dismiss_consent(page)
        try:
            await page.wait_for_selector("a h3", timeout=6000)
        except Exception:
            pass
        results = await extract.search_results(page)
        if results:
            return results
    except Exception:
        pass

    # ── Bing fallback ──
    try:
        await page.goto(f"https://www.bing.com/search?q={q}", wait_until="domcontentloaded", timeout=30_000)
        await asyncio.sleep(1)
        results = await page.evaluate(
            r"""
            (() => {
              const out = [];
              for (const li of document.querySelectorAll('#b_results > li.b_algo')) {
                const a = li.querySelector('h2 a');
                if (!a) continue;
                out.push({
                  title: (a.textContent || '').trim(),
                  url: a.href,
                  snippet: (li.querySelector('.b_caption p')?.textContent || '').trim().slice(0, 300),
                });
                if (out.length >= 15) break;
              }
              return out;
            })()
            """
        )
        return results or []
    except Exception:
        return []
