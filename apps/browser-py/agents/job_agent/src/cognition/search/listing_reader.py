"""listing_reader — generic job-card candidate extraction from any page.

A site-agnostic heuristic: scan the page for links with job-like text and capture
each one's surrounding "card" context. This deliberately over-collects (nav links,
ads, filters slip through); the local model then filters the candidates down to
real postings. No selectors tied to any specific site.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List

# Runs in the page. Collects anchor candidates + the text of their nearest card
# container, deduped by (href, text). Returns up to `maxN` candidates.
_READ_JS = r"""
(maxN) => {
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const anchors = Array.from(document.querySelectorAll('a[href]'));
  const out = [];
  const seen = new Set();
  for (const a of anchors) {
    const text = norm(a.innerText || a.getAttribute('aria-label') || '');
    const href = a.href;
    if (!href || href.indexOf('javascript:') === 0) continue;
    if (text.length < 3 || text.length > 140) continue;
    const card = a.closest(
      'li, article, [class*="card"], [class*="job"], [class*="result"], [class*="listing"]'
    ) || a.parentElement;
    let ctx = '';
    try { ctx = norm(card ? card.innerText : text).slice(0, 260); } catch (e) { ctx = text; }
    const key = href.split('#')[0] + '|' + text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title: text, href: href, context: ctx });
    if (out.length >= maxN) break;
  }
  return { url: location.href, title: document.title, candidates: out };
}
"""


@dataclass
class ListingScan:
    url: str
    title: str
    candidates: List[Dict[str, Any]]

    def __len__(self) -> int:
        return len(self.candidates)


async def read_candidates(page, max_n: int = 50) -> ListingScan:
    try:
        data = await page.evaluate(_READ_JS, max_n)
    except Exception:
        return ListingScan(url=getattr(page, "url", "") or "", title="", candidates=[])
    return ListingScan(
        url=data.get("url", ""),
        title=data.get("title", ""),
        candidates=data.get("candidates", []),
    )
