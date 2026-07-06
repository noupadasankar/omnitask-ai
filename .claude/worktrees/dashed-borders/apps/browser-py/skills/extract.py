"""Generic, site-agnostic DOM extraction.

These run real JS in the live page and work across most sites by structure
rather than brittle per-site selectors. AI (ai.py) can refine the raw output,
but everything here functions without it.
"""

# ── Search engine result blocks (Google/Bing-style) ────────────────────────────
SEARCH_RESULTS_JS = r"""
(() => {
  const out = [];
  const seen = new Set();
  // Anchors wrapping an <h3> cover Google; fall back to result containers.
  const anchors = Array.from(document.querySelectorAll('a h3')).map(h => h.closest('a'));
  for (const a of anchors) {
    if (!a || !a.href || seen.has(a.href)) continue;
    if (a.href.includes('google.com') || a.href.startsWith('javascript')) continue;
    seen.add(a.href);
    const h3 = a.querySelector('h3');
    const block = a.closest('div');
    const snippetEl = block ? block.parentElement?.querySelector('div[style*="webkit-line-clamp"], .VwiC3b, span') : null;
    out.push({
      title: (h3?.textContent || '').trim(),
      url: a.href,
      snippet: (snippetEl?.textContent || '').trim().slice(0, 300),
    });
    if (out.length >= 15) break;
  }
  return out;
})()
"""

# ── Repeated "cards" with a price (products/listings) ──────────────────────────
PRODUCT_CARDS_JS = r"""
(() => {
  const priceRe = /(?:₹|Rs\.?|\$|€|£)\s?[\d,]{2,}/;
  const cards = [];
  const seen = new Set();
  const nodes = Array.from(document.querySelectorAll('[data-component-type="s-search-result"], .s-result-item, [data-asin], ._1AtVbE, .product, li, div'));
  for (const el of nodes) {
    const text = (el.textContent || '').trim();
    if (!text || text.length < 12 || text.length > 600) continue;
    const m = text.match(priceRe);
    if (!m) continue;
    const link = el.querySelector('a[href]');
    const img = el.querySelector('img');
    const titleEl = el.querySelector('h2, h3, h4, [class*="title"], a span');
    const key = (link?.href || '') + '|' + (titleEl?.textContent || text.slice(0, 40));
    if (seen.has(key)) continue;
    seen.add(key);
    const priceNum = parseInt(m[0].replace(/[^\d]/g, ''), 10);
    const ratingMatch = text.match(/([0-5](?:\.\d)?)\s*(?:out of 5|stars?|★)/i);
    cards.push({
      title: (titleEl?.textContent || text).trim().slice(0, 160),
      price: isNaN(priceNum) ? null : priceNum,
      priceText: m[0],
      rating: ratingMatch ? parseFloat(ratingMatch[1]) : null,
      url: link?.href || null,
      image: img?.src || null,
    });
    if (cards.length >= 30) break;
  }
  return cards;
})()
"""

# ── Repeated job-card-like blocks (title + company/location signals) ───────────
JOB_CARDS_JS = r"""
(() => {
  const out = [];
  const seen = new Set();
  const nodes = Array.from(document.querySelectorAll(
    '[class*="job"], [class*="jobTuple"], [data-job-id], li, article, div'
  ));
  for (const el of nodes) {
    const titleEl = el.querySelector('a[class*="title"], h2 a, h3 a, a[href*="job"], h2, h3');
    if (!titleEl) continue;
    const title = (titleEl.textContent || '').trim();
    if (title.length < 4 || title.length > 120) continue;
    const text = (el.textContent || '').toLowerCase();
    const looksLikeJob = /(experience|yrs|years|apply|hiring|full[- ]?time|remote|salary|ctc)/.test(text);
    if (!looksLikeJob) continue;
    const link = titleEl.closest('a') || el.querySelector('a[href]');
    const url = link?.href || null;
    const key = url || title;
    if (seen.has(key)) continue;
    seen.add(key);
    const companyEl = el.querySelector('[class*="company"], [class*="org"], [class*="subTitle"]');
    const locEl = el.querySelector('[class*="location"], [class*="loc"]');
    out.push({
      title,
      company: (companyEl?.textContent || '').trim().slice(0, 80) || null,
      location: (locEl?.textContent || '').trim().slice(0, 80) || null,
      url,
    });
    if (out.length >= 25) break;
  }
  return out;
})()
"""


async def search_results(page):
    try:
        return await page.evaluate(SEARCH_RESULTS_JS)
    except Exception:
        return []


async def product_cards(page):
    try:
        return await page.evaluate(PRODUCT_CARDS_JS)
    except Exception:
        return []


async def job_cards(page):
    try:
        return await page.evaluate(JOB_CARDS_JS)
    except Exception:
        return []


async def page_text(page, limit: int = 8000) -> str:
    try:
        text = await page.evaluate("() => document.body.innerText || ''")
        return (text or "").strip()[:limit]
    except Exception:
        return ""
