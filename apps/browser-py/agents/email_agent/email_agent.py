"""Email Agent — Playwright-based Gmail/Outlook automation.

Mirrors the job_agent orchestrator structure: an EmailAgentOrchestrator that
is constructed once, then driven via execute(task_context).

When running inside the OmniTask engine the executor passes a live Playwright
Page (injected mode); the orchestrator reuses it so the dashboard live-view
remains active.  In standalone mode it launches its own Chromium window.

Supported actions (inferred from the task goal / task_context['action']):
  read     — open inbox and return a list of recent email summaries
  search   — search for messages matching a query string
  compose  — build a draft (never auto-sends; always gates on user approval)
  send     — compose + gate approval + send (requires explicit confirmation)
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any, Callable, Coroutine, Dict, List, Optional

log = logging.getLogger("browser-py.email_agent")

# ---------------------------------------------------------------------------
# Webmail site definitions
# Selector groups are organised by site so self-healing can try each in order.
# ---------------------------------------------------------------------------

SITES: Dict[str, Dict[str, Any]] = {
    "gmail": {
        "url": "https://mail.google.com",
        "login_indicator": "[data-tooltip='Google Account']",
        "inbox_selectors": [
            "tr.zA",               # conversation row (primary / all-mail view)
            "[data-legacy-thread-id]",
            "div[role='main'] table tr",
        ],
        "subject_selectors": ["span.bqe", "span.bog"],
        "sender_selectors": ["span.yP", "span.zF"],
        "snippet_selectors": ["span.y2"],
        "date_selectors": ["span.xW span", "td.xW"],
        "search_box_selectors": [
            "input[aria-label='Search mail']",
            "input[name='q']",
            "input[placeholder*='Search']",
        ],
        "compose_btn_selectors": [
            "div[gh='cm']",                      # classic compose button
            "[data-tooltip='Compose']",
            "div.T-I.J-J5-Ji.T-I-KE.L3",
        ],
        "to_field_selectors": [
            "textarea[name='to']",
            "input[aria-label='To']",
            "[name='to']",
        ],
        "subject_field_selectors": [
            "input[name='subjectbox']",
            "input[aria-label='Subject']",
            "[name='subjectbox']",
        ],
        "body_selectors": [
            "div[aria-label='Message Body']",
            "div[contenteditable='true'][role='textbox']",
            ".editable",
        ],
        "send_btn_selectors": [
            "div[data-tooltip='Send']",
            "[aria-label='Send']",
            ".aoD.TP",
        ],
    },
    "outlook": {
        "url": "https://outlook.live.com",
        "login_indicator": "[aria-label*='Account manager']",
        "inbox_selectors": [
            "div[role='listitem'][data-convid]",
            "div.customScrollBar div[aria-label]",
            "[data-convid]",
        ],
        "subject_selectors": ["span._2FG3k", "div[class*='subject']"],
        "sender_selectors": ["span[class*='sender']", "div[class*='from']"],
        "snippet_selectors": ["span[class*='preview']", "div[class*='preview']"],
        "date_selectors": ["span[class*='date']", "div[class*='timestamp']"],
        "search_box_selectors": [
            "input[aria-label='Search Outlook']",
            "input[placeholder*='Search']",
            "[role='searchbox'] input",
        ],
        "compose_btn_selectors": [
            "button[aria-label='New message']",
            "button[title='New message']",
            "[data-icon-name='ComposeRegular']",
        ],
        "to_field_selectors": [
            "div[aria-label='To'] input",
            "input[aria-label='To']",
            "[aria-label='Add a recipient'] input",
        ],
        "subject_field_selectors": [
            "input[aria-label='Add a subject']",
            "[placeholder='Add a subject']",
        ],
        "body_selectors": [
            "div[aria-label='Message body']",
            "div[contenteditable='true']",
        ],
        "send_btn_selectors": [
            "button[aria-label='Send']",
            "button[title='Send']",
        ],
    },
}

# ---------------------------------------------------------------------------
# Selector self-healing helper
# ---------------------------------------------------------------------------


async def _first_visible(page, selectors: List[str], timeout: int = 5_000):
    """Try each selector in order; return the first visible element or None."""
    for sel in selectors:
        try:
            el = await page.query_selector(sel)
            if el and await el.is_visible():
                return el
        except Exception:
            continue
    # Slow path: wait for any selector with a shared timeout.
    for sel in selectors:
        try:
            await page.wait_for_selector(sel, timeout=timeout, state="visible")
            el = await page.query_selector(sel)
            if el:
                return el
        except Exception:
            continue
    return None


async def _all_visible(page, selectors: List[str]) -> List:
    """Return all elements matching the first selector that yields results."""
    for sel in selectors:
        try:
            els = await page.query_selector_all(sel)
            if els:
                return els
        except Exception:
            continue
    return []


async def _inner_text(el) -> str:
    try:
        return (await el.inner_text()).strip()
    except Exception:
        return ""


# ---------------------------------------------------------------------------
# EmailAgentOrchestrator
# ---------------------------------------------------------------------------


class EmailAgentOrchestrator:
    """Orchestrates email automation across Gmail and Outlook webmail.

    Parameters
    ----------
    page:
        Optional Playwright Page injected by the OmniTask engine.  When
        provided, the orchestrator reuses this live page and never launches or
        closes its own browser (injected mode).  When None, a Chromium window
        is launched in standalone mode.
    progress_callback:
        Async callable ``async (message: str, level: str) -> None`` used to
        stream log lines back to the caller (the OmniTask skill uses
        ``ctx.log``).  If None, messages go to the Python logger only.
    """

    def __init__(
        self,
        page=None,
        progress_callback: Optional[Callable[[str, str], Coroutine]] = None,
    ) -> None:
        self.logger = logging.getLogger("EmailAgent")
        self._page = page
        self._injected = page is not None
        self._callback = progress_callback

        # Will be set if we launch our own browser.
        self._playwright = None
        self._browser = None
        self._context = None

        self.results: Dict[str, Any] = {
            "action": None,
            "emails": [],
            "status": "idle",
        }

    # ------------------------------------------------------------------
    # Public entry-point
    # ------------------------------------------------------------------

    async def execute(self, task_context: Dict[str, Any]) -> Dict[str, Any]:
        """Run an email task.

        Parameters
        ----------
        task_context:
            Dict that mirrors the shape of the OmniTask job payload:
              action  — 'read' | 'search' | 'compose' | 'send'
              site    — 'gmail' | 'outlook'  (optional; inferred from goal)
              goal    — natural-language description of the task
              to      — recipient address (compose/send only)
              subject — email subject (compose/send only)
              body    — email body text (compose/send only)
              query   — search query string (search only)
              limit   — max emails to return (read/search; default 10)

        Returns
        -------
        dict
            {
              "action": "sent" | "read" | "searched" | "composed" | "failed",
              "emails": [...],
              "status": "success" | "failed" | "requires_approval",
            }
        """
        action = self._resolve_action(task_context)
        site = self._resolve_site(task_context)
        self.results["action"] = action
        self.results["site"] = site

        await self._log(f"EmailAgent starting — action={action}, site={site}")

        page = await self._get_page()
        site_cfg = SITES.get(site, SITES["gmail"])

        try:
            # Navigate to the webmail interface.
            await self._navigate(page, site_cfg["url"])
            await asyncio.sleep(2)

            logged_in = await self._check_login(page, site_cfg)
            if not logged_in:
                await self._log(
                    f"Not logged in to {site} — please log in manually in the "
                    "live browser view and retry.",
                    level="warn",
                )
                self.results["status"] = "failed"
                self.results["action"] = "failed"
                return dict(self.results)

            if action == "read":
                emails = await self._read_inbox(page, site_cfg, task_context)
                self.results["emails"] = emails
                self.results["action"] = "read"
                self.results["status"] = "success"

            elif action == "search":
                emails = await self._search_emails(page, site_cfg, task_context)
                self.results["emails"] = emails
                self.results["action"] = "searched"
                self.results["status"] = "success"

            elif action in ("compose", "send"):
                result = await self._compose_or_send(page, site_cfg, task_context, do_send=(action == "send"))
                self.results.update(result)

            else:
                await self._log(f"Unknown action '{action}', defaulting to read.", level="warn")
                emails = await self._read_inbox(page, site_cfg, task_context)
                self.results["emails"] = emails
                self.results["action"] = "read"
                self.results["status"] = "success"

        except Exception as exc:
            self.logger.exception("EmailAgent error: %s", exc)
            await self._log(f"Agent error: {exc}", level="error")
            self.results["status"] = "failed"
            self.results["action"] = "failed"
            self.results["error"] = str(exc)

        finally:
            if not self._injected:
                await self._close_browser()

        return dict(self.results)

    # ------------------------------------------------------------------
    # Action handlers
    # ------------------------------------------------------------------

    async def _read_inbox(
        self, page, site_cfg: Dict, task_context: Dict
    ) -> List[Dict]:
        """Open the inbox and return a list of email summaries."""
        limit = int(task_context.get("limit", 10))
        await self._log(f"Reading inbox (limit={limit})...")

        rows = await _all_visible(page, site_cfg["inbox_selectors"])
        if not rows:
            await self._log("No email rows found in inbox.", level="warn")
            return []

        emails = []
        for row in rows[:limit]:
            email = await self._extract_email_summary(row, site_cfg)
            if email:
                emails.append(email)

        await self._log(f"Found {len(emails)} email(s) in inbox.", level="success")
        return emails

    async def _search_emails(
        self, page, site_cfg: Dict, task_context: Dict
    ) -> List[Dict]:
        """Enter a search query and return matching email summaries."""
        query = task_context.get("query") or task_context.get("goal", "")
        limit = int(task_context.get("limit", 10))
        await self._log(f"Searching for: {query}")

        search_box = await _first_visible(page, site_cfg["search_box_selectors"])
        if not search_box:
            await self._log("Could not locate search box.", level="warn")
            return []

        try:
            await search_box.click()
            await asyncio.sleep(0.3)
            await page.keyboard.press("Control+A")
            await page.keyboard.type(query, delay=40)
            await page.keyboard.press("Enter")
            await asyncio.sleep(2)
        except Exception as exc:
            await self._log(f"Search input failed: {exc}", level="warn")
            return []

        rows = await _all_visible(page, site_cfg["inbox_selectors"])
        emails = []
        for row in rows[:limit]:
            email = await self._extract_email_summary(row, site_cfg)
            if email:
                emails.append(email)

        await self._log(f"Search returned {len(emails)} result(s).", level="success")
        return emails

    async def _compose_or_send(
        self, page, site_cfg: Dict, task_context: Dict, *, do_send: bool
    ) -> Dict[str, Any]:
        """Open the compose window, fill the draft, and optionally send.

        Sending always requires explicit approval from the caller — the method
        returns ``requires_approval`` when called with do_send=True so the
        OmniTask approval gate can be applied before the send button is pressed.
        When composing only (do_send=False), the draft is filled and left open.
        """
        to_addr = task_context.get("to", "")
        subject = task_context.get("subject", "")
        body = task_context.get("body", "")

        await self._log(f"Opening compose window on {site_cfg.get('url', '')}...")

        compose_btn = await _first_visible(page, site_cfg["compose_btn_selectors"])
        if not compose_btn:
            await self._log("Could not find compose button.", level="warn")
            return {"action": "failed", "status": "failed",
                    "error": "compose button not found"}

        try:
            await compose_btn.click()
            await asyncio.sleep(1.5)
        except Exception as exc:
            await self._log(f"Failed to click compose: {exc}", level="warn")
            return {"action": "failed", "status": "failed", "error": str(exc)}

        # Fill To field.
        if to_addr:
            to_el = await _first_visible(page, site_cfg["to_field_selectors"])
            if to_el:
                try:
                    await to_el.click()
                    await to_el.fill(to_addr)
                    await page.keyboard.press("Tab")
                    await asyncio.sleep(0.3)
                except Exception as exc:
                    await self._log(f"To-field fill failed: {exc}", level="warn")

        # Fill Subject field.
        if subject:
            subj_el = await _first_visible(page, site_cfg["subject_field_selectors"])
            if subj_el:
                try:
                    await subj_el.click()
                    await subj_el.fill(subject)
                except Exception as exc:
                    await self._log(f"Subject fill failed: {exc}", level="warn")

        # Fill body.
        if body:
            body_el = await _first_visible(page, site_cfg["body_selectors"])
            if body_el:
                try:
                    await body_el.click()
                    # Use keyboard typing to avoid contenteditable quirks.
                    await page.keyboard.type(body, delay=20)
                except Exception as exc:
                    await self._log(f"Body fill failed: {exc}", level="warn")

        draft = {"to": to_addr, "subject": subject, "body": body[:200]}

        if not do_send:
            await self._log("Draft composed — NOT sending (compose-only mode).",
                            level="success")
            return {
                "action": "composed",
                "status": "success",
                "emails": [draft],
                "requiresApproval": False,
            }

        # Sending requires approval — return the gate payload.  The skill layer
        # (skills/email.py) or the NestJS executor checks this flag and refuses
        # to proceed without an explicit user confirm action.
        await self._log(
            "Draft ready — requires user approval before sending.",
            level="warn",
        )
        return {
            "action": "send",
            "status": "requires_approval",
            "emails": [draft],
            "requiresApproval": True,
            "_send_pending": True,  # internal flag for execute() retry path
        }

    async def _do_send(self, page, site_cfg: Dict) -> bool:
        """Press the Send button once the caller has confirmed approval."""
        send_btn = await _first_visible(page, site_cfg["send_btn_selectors"])
        if not send_btn:
            await self._log("Send button not found.", level="error")
            return False
        try:
            await send_btn.click()
            await asyncio.sleep(2)
            await self._log("Email sent.", level="success")
            return True
        except Exception as exc:
            await self._log(f"Send click failed: {exc}", level="error")
            return False

    # ------------------------------------------------------------------
    # DOM extraction helpers
    # ------------------------------------------------------------------

    async def _extract_email_summary(
        self, row, site_cfg: Dict
    ) -> Optional[Dict[str, str]]:
        """Extract subject/sender/snippet/date from a single inbox row element."""
        try:
            subject = await self._try_text(row, site_cfg["subject_selectors"])
            sender = await self._try_text(row, site_cfg["sender_selectors"])
            snippet = await self._try_text(row, site_cfg["snippet_selectors"])
            date = await self._try_text(row, site_cfg["date_selectors"])

            # If we got nothing meaningful, skip this row.
            if not any([subject, sender, snippet]):
                return None

            return {
                "subject": subject or "(no subject)",
                "from": sender or "",
                "snippet": snippet or "",
                "date": date or "",
            }
        except Exception:
            return None

    async def _try_text(self, container, selectors: List[str]) -> str:
        """Try each selector inside a container; return the first non-empty text."""
        for sel in selectors:
            try:
                el = await container.query_selector(sel)
                if el:
                    text = (await el.inner_text()).strip()
                    if text:
                        return text
            except Exception:
                continue
        return ""

    # ------------------------------------------------------------------
    # Session / navigation helpers
    # ------------------------------------------------------------------

    async def _navigate(self, page, url: str) -> None:
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=30_000)
        except Exception as exc:
            await self._log(f"Navigation to {url} failed: {exc}", level="warn")

    async def _check_login(self, page, site_cfg: Dict) -> bool:
        """Return True if the webmail dashboard is fully loaded (user is logged in)."""
        indicator = site_cfg.get("login_indicator")
        if not indicator:
            return True
        try:
            el = await page.query_selector(indicator)
            return el is not None
        except Exception:
            return False

    # ------------------------------------------------------------------
    # Browser lifecycle (only used in standalone / non-injected mode)
    # ------------------------------------------------------------------

    async def _get_page(self):
        """Return the live Playwright page (injected or freshly launched)."""
        if self._injected and self._page is not None:
            return self._page

        from playwright.async_api import async_playwright

        self._playwright = await async_playwright().start()
        try:
            self._browser = await self._playwright.chromium.launch(
                channel="chrome",
                headless=False,
                slow_mo=300,
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                ],
            )
        except Exception:
            self._browser = await self._playwright.chromium.launch(
                headless=False,
                slow_mo=300,
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                ],
            )

        self._context = await self._browser.new_context(
            viewport={"width": 1440, "height": 900},
            locale="en-US",
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
        )
        # Anti-detection: hide the webdriver fingerprint.
        await self._context.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', { get: () => undefined });"
        )
        self._page = await self._context.new_page()
        return self._page

    async def _close_browser(self) -> None:
        """Tear down the browser we launched ourselves (no-op in injected mode)."""
        if self._page:
            try:
                await self._page.close()
            except Exception:
                pass
        if self._context:
            try:
                await self._context.close()
            except Exception:
                pass
        if self._browser:
            try:
                await self._browser.close()
            except Exception:
                pass
        if self._playwright:
            try:
                await self._playwright.stop()
            except Exception:
                pass

    # ------------------------------------------------------------------
    # Inference helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _resolve_action(task_context: Dict) -> str:
        """Infer the action from explicit key or the goal text."""
        explicit = (task_context.get("action") or "").lower()
        if explicit in ("read", "search", "compose", "send"):
            return explicit

        goal = (task_context.get("goal") or "").lower()
        if any(k in goal for k in ("send", "email to", "write to")):
            return "send"
        if any(k in goal for k in ("compose", "draft", "write email")):
            return "compose"
        if any(k in goal for k in ("search", "find email", "look for")):
            return "search"
        return "read"

    @staticmethod
    def _resolve_site(task_context: Dict) -> str:
        """Infer the webmail provider from explicit key or the goal text."""
        explicit = (task_context.get("site") or "").lower()
        if explicit in SITES:
            return explicit

        goal = (task_context.get("goal") or "").lower()
        if "outlook" in goal or "hotmail" in goal or "microsoft" in goal:
            return "outlook"
        return "gmail"

    # ------------------------------------------------------------------
    # Progress logging
    # ------------------------------------------------------------------

    async def _log(self, message: str, level: str = "info") -> None:
        self.logger.info("[%s] %s", level.upper(), message)
        if self._callback is not None:
            try:
                await self._callback(message, level)
            except Exception:
                pass


# ---------------------------------------------------------------------------
# Standalone entry-point (CLI smoke-test)
# ---------------------------------------------------------------------------


async def _smoke_test() -> None:
    """Quick smoke-test: open Gmail and read the inbox."""
    agent = EmailAgentOrchestrator()
    result = await agent.execute({"action": "read", "site": "gmail", "limit": 5})
    import json
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    asyncio.run(_smoke_test())
