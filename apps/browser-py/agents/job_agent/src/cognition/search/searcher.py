"""CognitiveSearcher — find job postings on any site via observation + reasoning.

Flow (bounded, robust):
  1. Navigate to the listing (or stay on the current page).
  2. Clear popups + lazy-load more cards (Escape + scroll passes).
  3. Extract candidate links with the generic `listing_reader`.
  4. If nothing found, ask the local model for ONE action to reveal the listing
     (dismiss a wall, click a "Jobs"/"Search" tab), then re-extract. (1 retry.)
  5. Normalize candidates → structured jobs with the local model, filtering out
     nav/ads/filters and keeping postings that match the user's preferences.

Returns job dicts in the shape the queue + apply flow expect:
  {role, company, location, job_url, job_id, card_index, portal, description}
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Awaitable, Callable, Dict, List, Optional

from ..browser_tools import ACTIONS_DOC, ToolExecutor
from ..perception import Perception
from .listing_reader import read_candidates

log = logging.getLogger("browser-py.job_agent.cognition")

EmitFn = Callable[[str, Dict[str, Any]], Awaitable[None]]

_NORMALIZE_SYS = (
    "You extract JOB POSTINGS from a list of page links scraped from a careers / "
    "job-board page. A posting is a specific role a person could apply to. "
    "EXCLUDE navigation, filters, category pages, company-profile links, ads, "
    "'sign in', 'save', and search-refinement links. "
    "Reply ONLY as JSON: {\"jobs\": [{\"role\": \"\", \"company\": \"\", "
    "\"location\": \"\", \"url\": \"\"}]}. Use each candidate's href as url and its "
    "text/context for role/company/location; leave company/location empty if "
    "unknown. Prefer postings matching the user's target roles/locations, but "
    "include clearly relevant ones. Never invent a posting that isn't in the list."
)

_PREP_SYS = (
    "You operate a browser to reveal a job listing. The page may have a cookie/login "
    "popup or need a click on a 'Jobs'/'Search'/'Results' control. Choose ONE action "
    "to make job postings visible. Reply ONLY as JSON: "
    "{\"action\": {\"tool\": \"...\", ...}}.\n\n" + ACTIONS_DOC
)


class CognitiveSearcher:
    def __init__(self, engine, page, *, emit: Optional[EmitFn] = None,
                 logger: Optional[logging.Logger] = None):
        self.engine = engine
        self.llm = engine.llm
        self.page = page
        self.perception = Perception(page)
        self.executor = ToolExecutor(page)
        self.emit = emit
        self.log = logger or log

    async def _emit(self, kind: str, payload: Dict[str, Any]) -> None:
        if self.emit is None:
            return
        try:
            await self.emit(kind, payload)
        except Exception:  # noqa: BLE001
            pass

    async def find_jobs(self, *, portal: str, start_url: Optional[str] = None,
                        max_jobs: int = 25,
                        preferences: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        if start_url:
            try:
                await self.page.goto(start_url, wait_until="domcontentloaded", timeout=60000)
                await asyncio.sleep(3)
            except Exception as exc:  # noqa: BLE001
                self.log.warning(f"Cognitive search navigation failed: {exc}")

        await self._dismiss_and_scroll()

        scan = await read_candidates(self.page, max_n=60)
        if not scan.candidates:
            await self._reasoned_reveal()
            await self._dismiss_and_scroll()
            scan = await read_candidates(self.page, max_n=60)

        if not scan.candidates:
            self.log.info("Cognitive search found no link candidates.")
            return []

        await self._emit("log", {
            "message": f"🔎 Cognitive search scanned {len(scan.candidates)} candidates on "
                       f"{scan.url}", "level": "info",
        })

        jobs = await self._normalize(scan.candidates, portal=portal,
                                     max_jobs=max_jobs, preferences=preferences or {})
        await self._emit("log", {
            "message": f"🔎 Extracted {len(jobs)} job postings.", "level": "info",
        })
        return jobs

    # ── helpers ───────────────────────────────────────────────────────────────

    async def _dismiss_and_scroll(self, scrolls: int = 4) -> None:
        """Clear an obvious popup and lazy-load more of the listing."""
        try:
            await self.page.keyboard.press("Escape")
            await asyncio.sleep(0.4)
        except Exception:
            pass
        for _ in range(scrolls):
            try:
                await self.page.mouse.wheel(0, 1400)
            except Exception:
                try:
                    await self.page.evaluate("window.scrollBy(0, 1400)")
                except Exception:
                    pass
            await asyncio.sleep(1.0)

    async def _reasoned_reveal(self) -> None:
        """One model-chosen action to surface the listing (popup/tab/search)."""
        try:
            obs = await self.perception.observe()
            data = await self.llm.chat_json(
                [{"role": "system", "content": _PREP_SYS},
                 {"role": "user", "content": "OBSERVATION:\n" + obs.render()}],
                temperature=0.1,
            )
            action = data.get("action") or {}
            tool = str(action.get("tool", "")).strip()
            if tool and tool not in ("finish", "request_human", "get_screenshot"):
                args = {k: v for k, v in action.items() if k != "tool"}
                result = await self.executor.execute(tool, args)
                self.log.info(f"Cognitive search reveal action: {tool} -> {result}")
                await asyncio.sleep(2)
        except Exception as exc:  # noqa: BLE001
            self.log.debug(f"Reasoned reveal failed: {exc}")

    async def _normalize(self, candidates: List[Dict[str, Any]], *, portal: str,
                         max_jobs: int, preferences: Dict[str, Any]) -> List[Dict[str, Any]]:
        roles = preferences.get("roles") or []
        locations = preferences.get("locations") or []
        # Bound the payload so it fits a local context window.
        trimmed = [
            {"title": c.get("title", "")[:140],
             "href": c.get("href", ""),
             "context": c.get("context", "")[:240]}
            for c in candidates[:60]
        ]
        user = (
            f"USER TARGET ROLES: {roles}\nUSER TARGET LOCATIONS: {locations}\n\n"
            f"CANDIDATE LINKS (JSON):\n{trimmed}"
        )
        try:
            data = await self.llm.chat_json(
                [{"role": "system", "content": _NORMALIZE_SYS},
                 {"role": "user", "content": user}],
                temperature=0.1,
            )
        except Exception as exc:  # noqa: BLE001
            self.log.warning(f"Cognitive search normalization failed: {exc}")
            return []

        raw_jobs = data.get("jobs") if isinstance(data, dict) else None
        if not isinstance(raw_jobs, list):
            return []

        jobs: List[Dict[str, Any]] = []
        seen = set()
        for idx, j in enumerate(raw_jobs):
            if not isinstance(j, dict):
                continue
            role = str(j.get("role", "")).strip()
            if not role:
                continue
            company = str(j.get("company", "")).strip()
            url = str(j.get("url", "")).strip()
            key = (role.lower(), company.lower(), url.split("#")[0])
            if key in seen:
                continue
            seen.add(key)
            if not url:
                url = f"{portal.lower()}://job/{idx}"
            jobs.append({
                "role": role,
                "company": company,
                "location": str(j.get("location", "")).strip(),
                "job_url": url,
                "job_id": f"{portal.lower()}_{idx}",
                "card_index": idx,
                "portal": portal,
                "description": "",
            })
            if len(jobs) >= max_jobs:
                break
        return jobs
