"""
Research Agent Orchestrator
Main orchestration logic for the autonomous web research agent.

Follows the same structure as job_agent/src/agent/orchestrator.py:
  - __init__ wires up config and components
  - run(page, context) accepts an injected Playwright page (OmniTask engine)
    or launches its own browser in standalone CLI mode
  - execute(task_context) is the thin bridge called by the executor / skill layer

Self-healing approach for selector failures:
  - Every DOM query is wrapped in try/except; failures fall back to the next
    candidate selector or to JS evaluate on the whole page body
  - Progress is emitted via the same bridge.log / bridge.emit_result callbacks
    used by the job_agent portals
"""

import asyncio
import json
import logging
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional
from urllib.parse import quote_plus

log = logging.getLogger("browser-py.research_agent")


# ---------------------------------------------------------------------------
# Selector constants — ordered from most to least specific.  The agent tries
# each in sequence and moves on if the element is absent or invisible.
# ---------------------------------------------------------------------------

# Google search input / submit
_GOOGLE_SEARCH_SELECTORS = [
    'textarea[name="q"]',
    'input[name="q"]',
    'input[type="search"]',
]

# Google / Bing organic result blocks
_RESULT_LINK_SELECTORS = [
    "a h3",                  # Google organic h3-inside-anchor
    ".b_algo h2 a",          # Bing standard
    "h3 a",                  # fallback generic
]

# Main content areas (for article text extraction)
_CONTENT_SELECTORS = [
    "article",
    "main",
    '[role="main"]',
    ".post-content",
    ".entry-content",
    ".article-body",
    "#content",
    "#main-content",
]


# ---------------------------------------------------------------------------
# Tiny DOM helpers (evaluated in the live page)
# ---------------------------------------------------------------------------

_SEARCH_RESULTS_JS = r"""
(() => {
  const out = [];
  const seen = new Set();
  const anchors = Array.from(document.querySelectorAll('a h3')).map(h => h.closest('a'));
  for (const a of anchors) {
    if (!a || !a.href || seen.has(a.href)) continue;
    if (a.href.includes('google.com') || a.href.startsWith('javascript')) continue;
    seen.add(a.href);
    const h3 = a.querySelector('h3');
    const block = a.closest('div');
    const snippetEl = block
      ? block.parentElement?.querySelector(
          'div[style*="webkit-line-clamp"], .VwiC3b, span'
        )
      : null;
    out.push({
      title: (h3?.textContent || '').trim(),
      url: a.href,
      snippet: (snippetEl?.textContent || '').trim().slice(0, 300),
    });
    if (out.length >= 12) break;
  }
  return out;
})()
"""

_BING_RESULTS_JS = r"""
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
    if (out.length >= 12) break;
  }
  return out;
})()
"""

_EXTRACT_TEXT_JS = r"""
((limit) => {
  // Prefer semantic content containers, fall back to full body.
  const candidates = [
    'article', 'main', '[role="main"]', '.post-content',
    '.entry-content', '.article-body', '#content', '#main-content',
  ];
  for (const sel of candidates) {
    const el = document.querySelector(sel);
    if (el) {
      const t = (el.innerText || '').trim();
      if (t.length > 200) return t.slice(0, limit);
    }
  }
  return (document.body?.innerText || '').trim().slice(0, limit);
})
"""


# ---------------------------------------------------------------------------
# ResearchAgentOrchestrator
# ---------------------------------------------------------------------------

class ResearchAgentOrchestrator:
    """Orchestrates a full research run across multiple web sources.

    Follows the same lifecycle as JobAgentOrchestrator:

      1. Constructed in __init__ (no I/O)
      2. Called via run(page, context) — OmniTask injected mode OR standalone
      3. Progress streamed through ``bridge`` callbacks when available

    The ``bridge`` object (set by the caller, identical to the job_agent bridge
    interface) is expected to expose:

        bridge.log(message, level='info')          — async, dashboard log line
        bridge.emit_result(kind, items)             — async, structured results
        bridge.cancelled()                          — async bool, stop signal
    """

    # Maximum number of search result URLs to visit and read
    MAX_SOURCES = 5
    # Characters to read from each source page
    PAGE_TEXT_LIMIT = 6000
    # Navigation timeout (ms)
    NAV_TIMEOUT = 28_000
    # How long to let JS settle after load (seconds)
    SETTLE_SECS = 1.2

    def __init__(self, bridge: Optional[Any] = None):
        """
        Args:
            bridge: Optional OmniTask integration bridge.  When provided, every
                log line and result is streamed to the dashboard in real time.
                When None the agent runs standalone (logs go to Python logging).
        """
        self.bridge = bridge
        self._page = None    # set in run()
        self._context = None

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    async def execute(self, task_context: Dict) -> Dict:
        """Entry point used by the executor / skill layer.

        ``task_context`` mirrors the SkillContext fields that are plain dicts:
            task_context['goal']       — the user's research question
            task_context['page']       — live Playwright Page object
            task_context['job']        — full raw job payload (optional extras)
            task_context['session_id'] — str
            task_context['user_id']    — str
            task_context['publisher']  — EventPublisher (for self.bridge wiring)

        Returns the same structure as self.ok() / ResearchSkill.run():
            {status, total, results, items, sources, summary, facts}
        """
        page = task_context.get("page")
        query = task_context.get("goal") or task_context.get("query") or ""
        publisher = task_context.get("publisher")
        session_id = task_context.get("session_id", "")

        # Lightweight bridge shim so log/emit work even when no bridge was
        # passed at construction time (OmniTask passes publisher + session_id).
        if self.bridge is None and publisher is not None:
            self.bridge = _PublisherBridge(publisher, session_id)

        return await self.run(page=page, query=query)

    async def run(self, page=None, context=None, query: str = "") -> Dict:
        """Perform the full research pipeline.

        Args:
            page:    Live Playwright Page (injected by the OmniTask engine).
                     When None the method launches its own standalone browser.
            context: BrowserContext that owns the page (for cookies / session).
            query:   The research question.  Falls back to the ``RESEARCH_QUERY``
                     env var for standalone CLI use.

        Returns:
            Structured result dict:
            {
                "status":  "success" | "partial" | "error",
                "total":   <int>,
                "results": [{"stepIndex": i, "success": True, "durationMs": 0}],
                "items":   [...],          # same as sources
                "sources": [              # per-source findings
                    {
                        "title":   str,
                        "url":     str,
                        "snippet": str,
                        "excerpt": str,   # raw page text (truncated)
                        "summary": str,   # AI summary when available
                        "facts":   list,  # extracted bullet facts
                    }
                ],
                "summary": str,           # overall cross-source synthesis
                "facts":   list[str],     # deduplicated key facts
            }
        """
        start_time = datetime.now()
        query = (query or os.environ.get("RESEARCH_QUERY", "")).strip()
        injected = page is not None

        await self._log(f"Research query: {query or '(empty)'}")

        if not query:
            await self._log("No query provided — aborting.", level="error")
            return self._empty_result("no_query")

        # In standalone mode we launch our own browser.  In injected mode we
        # use the engine's live page so the dashboard screencast works.
        own_playwright = None
        own_browser = None
        if not injected:
            try:
                from playwright.async_api import async_playwright
                own_playwright = await async_playwright().start()
                own_browser = await own_playwright.chromium.launch(
                    headless=True,
                    args=["--no-sandbox", "--disable-blink-features=AutomationControlled"],
                )
                context = await own_browser.new_context(
                    viewport={"width": 1280, "height": 800},
                    user_agent=(
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/124.0.0.0 Safari/537.36"
                    ),
                    locale="en-US",
                )
                page = await context.new_page()
            except Exception as exc:
                log.error("Could not launch standalone browser: %s", exc)
                return self._empty_result("browser_launch_failed")

        self._page = page
        self._context = context

        try:
            result = await self._research(query)
        except Exception as exc:
            log.exception("Research pipeline crashed: %s", exc)
            await self._log(f"Research pipeline error: {exc}", level="error")
            result = self._empty_result("pipeline_error")
        finally:
            if not injected:
                # Tear down what we own.
                try:
                    if own_browser:
                        await own_browser.close()
                    if own_playwright:
                        await own_playwright.stop()
                except Exception:
                    pass

        duration = (datetime.now() - start_time).total_seconds()
        await self._log(
            f"Research complete: {result.get('total', 0)} sources in {duration:.1f}s",
            level="success",
        )
        return result

    # ------------------------------------------------------------------
    # Core pipeline
    # ------------------------------------------------------------------

    async def _research(self, query: str) -> Dict:
        """Full pipeline: search -> visit -> extract -> synthesize."""

        # --- 1. Search ---
        await self._log(f"Searching the web for: {query}")
        search_results = await self._web_search(query)
        if not search_results:
            await self._log("No search results found.", level="warn")
            return self._empty_result("no_results")

        await self._log(f"Found {len(search_results)} search results — visiting top {self.MAX_SOURCES}.")

        # --- 2. Visit + extract each source ---
        sources: List[Dict] = []
        all_facts: List[str] = []

        for i, result in enumerate(search_results[: self.MAX_SOURCES]):
            # Respect stop signals from the dashboard.
            if await self._cancelled():
                await self._log("Stop signal received — halting research.", level="warn")
                break

            url = result.get("url", "")
            title = result.get("title", url)
            snippet = result.get("snippet", "")

            await self._log(f"[{i + 1}/{self.MAX_SOURCES}] Reading: {title}")

            excerpt, page_facts = await self._visit_and_extract(url, query)

            source_entry: Dict = {
                "title": title,
                "url": url,
                "snippet": snippet,
                "excerpt": excerpt,
                "summary": "",
                "facts": page_facts,
            }

            # Per-source AI summary (best-effort — skipped when no key).
            if excerpt:
                summary = await self._ai_summarize(
                    excerpt,
                    f"Summarize this page's key information relevant to: '{query}'. "
                    "Give 3-5 concise bullet points. No preamble.",
                )
                if summary:
                    source_entry["summary"] = summary

            # Collect facts for the final synthesis.
            all_facts.extend(page_facts)
            sources.append(source_entry)

        if not sources:
            return self._empty_result("all_sources_failed")

        # --- 3. Cross-source synthesis ---
        overall_summary = ""
        if sources:
            combined_text = "\n\n".join(
                f"Source: {s['title']}\n{s['summary'] or s['excerpt'][:600]}"
                for s in sources
            )
            overall_summary = await self._ai_summarize(
                combined_text,
                f"Write a concise research brief answering: '{query}'. "
                "Use bullet points. Cite sources by their title where relevant.",
            ) or _fallback_summary(sources, query)

        # Deduplicate facts (simple exact-string dedup).
        seen: set = set()
        unique_facts: List[str] = []
        for f in all_facts:
            key = f.strip().lower()
            if key and key not in seen:
                seen.add(key)
                unique_facts.append(f.strip())

        await self._emit_result("research", sources)

        if overall_summary:
            await self._log("Research brief:\n" + overall_summary, level="success")

        n = len(sources)
        return {
            "status": "success",
            "total": n,
            "results": [{"stepIndex": i, "success": True, "durationMs": 0} for i in range(n)]
            or [{"stepIndex": 0, "success": True, "durationMs": 0}],
            "items": sources,
            "sources": sources,
            "summary": overall_summary,
            "facts": unique_facts[:30],
        }

    # ------------------------------------------------------------------
    # Web search (Google first, Bing fallback) — self-healing selector
    # ------------------------------------------------------------------

    async def _dismiss_consent(self) -> None:
        """Best-effort click on consent / cookie walls."""
        for label in ("Accept all", "I agree", "Accept", "Reject all"):
            try:
                btn = self._page.get_by_role("button", name=label)
                if await btn.count() > 0:
                    await btn.first.click(timeout=2000)
                    await asyncio.sleep(0.4)
                    return
            except Exception:
                continue

    async def _web_search(self, query: str) -> List[Dict]:
        """Navigate to a search engine and extract result links."""
        q = quote_plus(query)

        # --- Google ---
        try:
            await self._page.goto(
                f"https://www.google.com/search?q={q}&hl=en",
                wait_until="domcontentloaded",
                timeout=self.NAV_TIMEOUT,
            )
            await self._dismiss_consent()
            # Wait for any result anchor to appear; ignore timeout.
            try:
                await self._page.wait_for_selector("a h3", timeout=5000)
            except Exception:
                pass
            results = await self._page.evaluate(_SEARCH_RESULTS_JS)
            if results:
                return results
        except Exception as exc:
            log.debug("Google search failed (%s) — trying Bing", exc)

        # --- Bing fallback ---
        try:
            await self._page.goto(
                f"https://www.bing.com/search?q={q}",
                wait_until="domcontentloaded",
                timeout=self.NAV_TIMEOUT,
            )
            await asyncio.sleep(self.SETTLE_SECS)
            results = await self._page.evaluate(_BING_RESULTS_JS)
            return results or []
        except Exception as exc:
            log.debug("Bing search also failed: %s", exc)
            return []

    # ------------------------------------------------------------------
    # Source reading — self-healing extraction
    # ------------------------------------------------------------------

    async def _visit_and_extract(self, url: str, query: str):
        """Navigate to a URL and extract readable text + bullet facts.

        Returns:
            (excerpt: str, facts: list[str])
        Self-heals by trying progressively looser extraction on failure.
        """
        if not url:
            return "", []

        # --- Navigate ---
        try:
            await self._page.goto(url, wait_until="domcontentloaded", timeout=self.NAV_TIMEOUT)
            await asyncio.sleep(self.SETTLE_SECS)
        except Exception as exc:
            log.debug("Could not navigate to %s: %s", url, exc)
            return "", []

        # --- Extract text (self-healing selector cascade) ---
        excerpt = ""

        # 1. Try semantic content containers via JS (most reliable cross-site).
        try:
            excerpt = (
                await self._page.evaluate(
                    f"(limit) => {_EXTRACT_TEXT_JS}(limit)",
                    self.PAGE_TEXT_LIMIT,
                )
                or ""
            )
        except Exception:
            pass

        # 2. If the JS approach yielded nothing, try CSS selectors directly.
        if not excerpt.strip():
            for sel in _CONTENT_SELECTORS:
                try:
                    el = await self._page.query_selector(sel)
                    if el and await el.is_visible():
                        text = await el.inner_text()
                        if text and len(text.strip()) > 150:
                            excerpt = text.strip()[: self.PAGE_TEXT_LIMIT]
                            break
                except Exception:
                    continue

        # 3. Last resort: whole body innerText.
        if not excerpt.strip():
            try:
                excerpt = (
                    await self._page.evaluate("() => document.body.innerText || ''")
                    or ""
                )
                excerpt = excerpt.strip()[: self.PAGE_TEXT_LIMIT]
            except Exception:
                excerpt = ""

        # --- Heuristic fact extraction ---
        facts = _extract_facts(excerpt, query)

        return excerpt, facts

    # ------------------------------------------------------------------
    # AI helpers (best-effort — gracefully no-op without an API key)
    # ------------------------------------------------------------------

    async def _ai_summarize(self, text: str, instruction: str) -> str:
        """Call the AI client for a text summary.  Returns "" on any failure."""
        ai = getattr(self, "_ai", None)
        if ai is None:
            try:
                from ai import AIClient  # noqa: PLC0415 — lazy import; not always present
                self._ai = AIClient()
                ai = self._ai
            except Exception:
                self._ai = _NoAI()
                return ""
        if not getattr(ai, "available", False):
            return ""
        try:
            result = await ai.summarize(text, instruction)
            return result or ""
        except Exception as exc:
            log.debug("AI summarize failed: %s", exc)
            return ""

    # ------------------------------------------------------------------
    # Progress / logging helpers
    # ------------------------------------------------------------------

    async def _log(self, message: str, level: str = "info") -> None:
        """Emit a log line to the dashboard (bridge) or Python logging."""
        if self.bridge is not None:
            try:
                await self.bridge.log(message, level)
            except Exception:
                pass
        getattr(log, level if level in ("debug", "info", "warning", "error") else "info")(
            message
        )

    async def _emit_result(self, kind: str, items: List[Dict]) -> None:
        """Emit structured results to the dashboard."""
        if self.bridge is not None:
            try:
                await self.bridge.emit_result(kind, items)
            except Exception:
                pass

    async def _cancelled(self) -> bool:
        """Check if a stop signal has been sent from the dashboard."""
        if self.bridge is not None and hasattr(self.bridge, "cancelled"):
            try:
                return bool(await self.bridge.cancelled())
            except Exception:
                pass
        return False

    # ------------------------------------------------------------------
    # Static helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _empty_result(reason: str) -> Dict:
        return {
            "status": "partial",
            "total": 0,
            "results": [{"stepIndex": 0, "success": False, "durationMs": 0}],
            "items": [],
            "sources": [],
            "summary": f"Research could not complete: {reason}",
            "facts": [],
        }


# ---------------------------------------------------------------------------
# Heuristic helpers (no deps beyond stdlib)
# ---------------------------------------------------------------------------

def _extract_facts(text: str, query: str) -> List[str]:
    """Very lightweight heuristic fact extraction from raw page text.

    Picks sentences that contain at least one query keyword and are a
    reasonable length.  This runs without any NLP library.
    """
    if not text or not query:
        return []

    keywords = {w.lower() for w in query.split() if len(w) > 3}
    facts: List[str] = []
    # Split on common sentence endings; keep only "sentence-like" chunks.
    import re
    sentences = re.split(r"(?<=[.!?])\s+", text)
    for sent in sentences:
        sent = sent.strip()
        if len(sent) < 40 or len(sent) > 400:
            continue
        lower = sent.lower()
        if any(kw in lower for kw in keywords):
            facts.append(sent)
        if len(facts) >= 15:
            break
    return facts


def _fallback_summary(sources: List[Dict], query: str) -> str:
    """Plain-text summary used when no AI client is available."""
    lines = [f"Research results for: {query}\n"]
    for i, s in enumerate(sources, 1):
        title = s.get("title", "Source")
        url = s.get("url", "")
        snippet = s.get("snippet") or s.get("excerpt", "")[:200]
        lines.append(f"{i}. {title}\n   {url}\n   {snippet}\n")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Thin bridge shims
# ---------------------------------------------------------------------------

class _PublisherBridge:
    """Adapts an EventPublisher + session_id pair to the bridge interface."""

    def __init__(self, publisher, session_id: str):
        self._pub = publisher
        self._sid = session_id

    async def log(self, message: str, level: str = "info") -> None:
        try:
            await self._pub.publish(
                self._sid,
                "execution:event",
                {"type": f"log:{level}", "data": {"source": "ResearchAgent", "message": message}},
            )
        except Exception:
            pass

    async def emit_result(self, kind: str, items: list) -> None:
        try:
            await self._pub.publish(
                self._sid,
                "agent:result",
                {"sessionId": self._sid, "kind": kind, "count": len(items), "items": items},
            )
        except Exception:
            pass

    async def cancelled(self) -> bool:
        return False


class _NoAI:
    """Sentinel used when the AIClient import fails."""
    available = False


# ---------------------------------------------------------------------------
# Standalone CLI entry point
# ---------------------------------------------------------------------------

async def _main() -> int:
    query = " ".join(sys.argv[1:]).strip() if len(sys.argv) > 1 else ""
    if not query:
        query = os.environ.get("RESEARCH_QUERY", "")
    if not query:
        print("Usage: python research_agent.py <your research query>")
        print("   or: RESEARCH_QUERY='...' python research_agent.py")
        return 1

    agent = ResearchAgentOrchestrator()
    result = await agent.run(query=query)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0 if result.get("status") == "success" else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(_main()))
