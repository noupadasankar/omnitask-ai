"""
Finance Agent
Autonomous browser agent for banking and financial tasks.

Supports:
  - Checking bank account balances
  - Viewing transaction history
  - Paying bills through banking portals
  - Tracking expenses

Usage (standalone CLI):
    python finance_agent.py

Usage (as an OmniTask skill — injected by skills/finance.py):
    agent = FinanceAgent(bridge=bridge)
    result = await agent.execute(task_context)

The `bridge` parameter is None in standalone mode (no live dashboard, no approval
gate). When injected by the skill dispatcher, it provides the same
PortalBridge-style interface the job_agent uses for streaming events and gating
consequential actions (payments).
"""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime
from typing import Any, Dict, List, Optional


log = logging.getLogger("finance_agent")


# ---------------------------------------------------------------------------
# Supported banking portals — extend as needed
# ---------------------------------------------------------------------------

BANKING_PORTALS: Dict[str, str] = {
    "sbi":        "https://www.onlinesbi.sbi/",
    "hdfc":       "https://netbanking.hdfcbank.com/",
    "icici":      "https://www.icicibank.com/",
    "axis":       "https://www.axisbank.com/",
    "kotak":      "https://www.kotak.com/",
    "pnb":        "https://www.netpnb.com/",
    "bob":        "https://www.bobibanking.com/",
    "paytm":      "https://paytm.com/",
    "googlepay":  "https://pay.google.com/",
    "phonepe":    "https://www.phonepe.com/",
}

# Task-type → action label mapping so the result shape is consistent.
TASK_ACTION_MAP: Dict[str, str] = {
    "check_balance":      "check_balance",
    "balance":            "check_balance",
    "view_transactions":  "view_transactions",
    "transaction_history":"view_transactions",
    "transactions":       "view_transactions",
    "pay_bill":           "pay_bill",
    "bill_payment":       "pay_bill",
    "expense_tracking":   "track_expenses",
    "track_expenses":     "track_expenses",
    "spending_analysis":  "track_expenses",
    "financial_report":   "financial_report",
    "budget_management":  "financial_report",
    "finance":            "check_balance",          # generic fallback
}


class FinanceAgent:
    """Autonomous browser agent for financial tasks.

    Constructor parameters mirror the JobAgentOrchestrator pattern so the skill
    wrapper can treat both agents uniformly.

    Args:
        bridge:  OmniTask event bridge (None = standalone CLI mode).
                 Must expose:
                   await bridge.log(msg, level='info')
                   await bridge.gate(action_desc, step_data) -> bool
                   await bridge.emit_result(kind, items)
                   await bridge.cancelled() -> bool
        page:    Playwright Page injected by the skill (None = standalone).
        config:  Optional dict with portal / credential hints from the dashboard.
    """

    def __init__(
        self,
        bridge: Optional[Any] = None,
        page: Optional[Any] = None,
        config: Optional[Dict] = None,
    ) -> None:
        self.bridge = bridge
        self.page = page
        self.config = config or {}
        self.logger = logging.getLogger("FinanceAgent")

        self._results: List[Dict] = []
        self._start_time: Optional[datetime] = None
        self._end_time: Optional[datetime] = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def execute(self, task_context: Dict) -> Dict:
        """Entry point called by skills/finance.py (and directly in CLI mode).

        Args:
            task_context: dict with keys:
                goal      — natural-language goal string
                task_type — backend taskType string (e.g. 'check_balance')
                portal    — optional bank name hint (e.g. 'hdfc')
                query     — optional supplementary query string
                config    — optional per-run overrides

        Returns:
            {
                "action":  "check_balance" | "pay_bill" | "view_transactions"
                           | "track_expenses" | "financial_report",
                "data":    {...},           # structured payload
                "status":  "success" | "partial" | "failed",
                "items":   [...],           # list of result dicts for self.ok()
            }
        """
        self._start_time = datetime.now()
        goal       = task_context.get("goal", "")
        task_type  = task_context.get("task_type", "")
        portal_key = (task_context.get("portal") or "").lower()
        query      = task_context.get("query") or goal

        action = self._resolve_action(task_type, goal)
        portal_name, portal_url = self._resolve_portal(portal_key, goal)

        await self._log(
            f"Starting finance task: action={action}, portal={portal_name or 'web'}",
            level="info",
        )

        # --- Stop requested while waiting? ---
        if await self._cancelled():
            return self._result("cancelled", action, [], status="partial")

        try:
            if action == "check_balance":
                items = await self._check_balance(portal_name, portal_url, query)

            elif action == "view_transactions":
                items = await self._view_transactions(portal_name, portal_url, query)

            elif action == "pay_bill":
                items = await self._pay_bill(portal_name, portal_url, query, task_context)

            elif action == "track_expenses":
                items = await self._track_expenses(portal_name, portal_url, query)

            elif action == "financial_report":
                items = await self._financial_report(portal_name, portal_url, query)

            else:
                await self._log(f"Unknown action '{action}' — falling back to balance check", level="warn")
                items = await self._check_balance(portal_name, portal_url, query)

        except Exception as exc:  # noqa: BLE001
            self.logger.error("FinanceAgent error: %s", exc, exc_info=True)
            await self._log(f"Finance task failed: {exc}", level="error")
            return self._result("error", action, [], status="failed")

        finally:
            self._end_time = datetime.now()

        await self._log(
            f"Finance task complete — {len(items)} item(s) returned.",
            level="success",
        )
        return self._result("done", action, items, status="success")

    # ------------------------------------------------------------------
    # Action implementations
    # ------------------------------------------------------------------

    async def _check_balance(
        self,
        portal_name: Optional[str],
        portal_url: Optional[str],
        query: str,
    ) -> List[Dict]:
        """Navigate to a banking portal and extract the account balance."""
        await self._log("Checking account balance...", level="info")

        if portal_url and self.page:
            try:
                await self.page.goto(portal_url, wait_until="domcontentloaded", timeout=30_000)
                await asyncio.sleep(2)
                await self._log(f"Navigated to {portal_name} portal", level="info")

                text = await self._page_text()
                balance_info = self._extract_balance_text(text)
            except Exception as exc:  # noqa: BLE001 — self-heal
                await self._log(
                    f"Portal navigation failed ({exc}) — trying web search fallback",
                    level="warn",
                )
                balance_info = await self._web_fallback_search(query + " account balance check")
        else:
            balance_info = await self._web_fallback_search(query + " check account balance")

        item = {
            "action":      "check_balance",
            "portal":      portal_name or "web",
            "query":       query,
            "balanceText": balance_info,
            "timestamp":   datetime.now().isoformat(),
            "note":        (
                "Please log in to your banking portal to see live balance. "
                "Sensitive credentials are never stored or transmitted by OmniTask."
            ),
        }
        await self._emit("finance_balance", [item])
        return [item]

    async def _view_transactions(
        self,
        portal_name: Optional[str],
        portal_url: Optional[str],
        query: str,
    ) -> List[Dict]:
        """Navigate to a banking portal and extract recent transactions."""
        await self._log("Fetching transaction history...", level="info")

        transactions: List[Dict] = []

        if portal_url and self.page:
            try:
                await self.page.goto(portal_url, wait_until="domcontentloaded", timeout=30_000)
                await asyncio.sleep(2)

                # Common banking portal — try navigating to a statements/transactions section.
                for selector_attempt in [
                    "a[href*='statement']",
                    "a[href*='transaction']",
                    "a[href*='history']",
                    "[class*='statement']",
                    "[class*='transaction']",
                ]:
                    try:
                        el = await self.page.query_selector(selector_attempt)
                        if el:
                            await el.click()
                            await asyncio.sleep(1.5)
                            await self._log(
                                f"Clicked transaction section via {selector_attempt}",
                                level="info",
                            )
                            break
                    except Exception:
                        continue

                text = await self._page_text()
                transactions = self._extract_transactions(text, portal_name)
            except Exception as exc:  # noqa: BLE001 — self-heal
                await self._log(
                    f"Portal navigation failed ({exc}) — web search fallback",
                    level="warn",
                )
                transactions = await self._web_fallback_transactions(query)
        else:
            transactions = await self._web_fallback_transactions(query)

        if not transactions:
            transactions = [{
                "action":    "view_transactions",
                "portal":    portal_name or "web",
                "query":     query,
                "message":   "Please log in to your bank portal to view transactions.",
                "timestamp": datetime.now().isoformat(),
            }]

        await self._emit("finance_transactions", transactions)
        return transactions

    async def _pay_bill(
        self,
        portal_name: Optional[str],
        portal_url: Optional[str],
        query: str,
        task_context: Dict,
    ) -> List[Dict]:
        """Gate a bill payment through the approval panel before any submit.

        The approval gate mirrors the job_agent pattern exactly: we publish
        `approval:required`, wait for user confirmation, and only proceed if
        approved. This method NEVER submits a payment without approval.
        """
        await self._log(
            "Bill payment requested — approval required before any action.",
            level="warn",
        )

        payee    = task_context.get("payee") or query
        amount   = task_context.get("amount")
        due_date = task_context.get("due_date")

        candidate = {
            "action":    "pay_bill",
            "portal":    portal_name or "web",
            "payee":     payee,
            "amount":    amount,
            "due_date":  due_date,
            "query":     query,
            "timestamp": datetime.now().isoformat(),
            "status":    "PENDING_APPROVAL",
        }

        # --- Approval gate (same pattern as job_agent portal submit gate) ---
        approved = await self._gate(
            description=(
                f"Pay bill: {payee}"
                + (f" — amount {amount}" if amount else "")
                + (f" (due {due_date})" if due_date else "")
            ),
            step_data=candidate,
        )

        if not approved:
            await self._log("Bill payment denied or timed out — skipping.", level="warn")
            candidate["status"] = "DENIED"
            await self._emit("finance_payment", [candidate])
            return [candidate]

        # Approved — navigate and attempt to fill the payment form.
        await self._log("Payment approved — navigating to banking portal.", level="info")
        candidate["status"] = "APPROVED"

        if portal_url and self.page:
            try:
                await self.page.goto(portal_url, wait_until="domcontentloaded", timeout=30_000)
                await asyncio.sleep(2)
                await self._log(
                    f"Navigated to {portal_name} for bill payment. "
                    "User must complete login and confirm the payment on-screen.",
                    level="info",
                )
                candidate["portalUrl"] = portal_url
                candidate["note"] = (
                    "Portal opened. Complete login and payment on the live browser view. "
                    "OmniTask does not submit without your explicit on-screen confirmation."
                )
            except Exception as exc:  # noqa: BLE001 — self-heal
                await self._log(
                    f"Portal navigation failed ({exc}). "
                    "Please complete the payment manually in the browser.",
                    level="warn",
                )
                candidate["error"] = str(exc)

        candidate["status"] = "PORTAL_OPENED"
        await self._emit("finance_payment", [candidate])
        return [candidate]

    async def _track_expenses(
        self,
        portal_name: Optional[str],
        portal_url: Optional[str],
        query: str,
    ) -> List[Dict]:
        """Summarise recent expenses from a banking portal or spending tracker."""
        await self._log("Tracking expenses / spending analysis...", level="info")

        page_text = ""
        if portal_url and self.page:
            try:
                await self.page.goto(portal_url, wait_until="domcontentloaded", timeout=30_000)
                await asyncio.sleep(2)
                page_text = await self._page_text()
            except Exception as exc:  # noqa: BLE001 — self-heal
                await self._log(f"Portal failed ({exc}) — web fallback", level="warn")
                page_text = await self._web_fallback_text(query + " expense tracker")
        else:
            page_text = await self._web_fallback_text(query + " expense tracker budget")

        # AI extraction if available.
        summary = await self._ai_summarise(
            page_text,
            (
                "Extract expense categories and totals from this page. "
                "Return a concise spending breakdown. If no data, suggest steps to track expenses."
            ),
        ) if page_text else None

        item = {
            "action":    "track_expenses",
            "portal":    portal_name or "web",
            "query":     query,
            "summary":   summary or (
                "Navigate to your bank's statement section or connect a budgeting tool "
                "(e.g. Money Manager, Walnut, YNAB) to see a breakdown."
            ),
            "timestamp": datetime.now().isoformat(),
        }
        await self._emit("finance_expenses", [item])
        return [item]

    async def _financial_report(
        self,
        portal_name: Optional[str],
        portal_url: Optional[str],
        query: str,
    ) -> List[Dict]:
        """Generate a brief financial summary / budget report."""
        await self._log("Generating financial report...", level="info")

        page_text = ""
        if portal_url and self.page:
            try:
                await self.page.goto(portal_url, wait_until="domcontentloaded", timeout=30_000)
                await asyncio.sleep(2)
                page_text = await self._page_text()
            except Exception as exc:  # noqa: BLE001 — self-heal
                await self._log(f"Portal failed ({exc}) — web fallback", level="warn")

        report = await self._ai_summarise(
            page_text or query,
            (
                "Create a brief financial report with: income vs expenses summary, "
                "top spending categories, savings rate, and 2-3 actionable recommendations. "
                "Use bullet points. Be concise."
            ),
        ) if (page_text or query) else None

        item = {
            "action":    "financial_report",
            "portal":    portal_name or "web",
            "query":     query,
            "report":    report or (
                "Connect your banking portal to generate a personalised financial report. "
                "OmniTask can analyse your statement once you're logged in."
            ),
            "timestamp": datetime.now().isoformat(),
        }
        await self._emit("finance_report", [item])
        return [item]

    # ------------------------------------------------------------------
    # Helper utilities
    # ------------------------------------------------------------------

    def _resolve_action(self, task_type: str, goal: str) -> str:
        """Map a backend task_type (or goal keywords) to an internal action."""
        key = (task_type or "").strip().lower()
        if key in TASK_ACTION_MAP:
            return TASK_ACTION_MAP[key]
        # Fallback: keyword scan of the goal string.
        g = goal.lower()
        if any(w in g for w in ("balance", "how much", "account")):
            return "check_balance"
        if any(w in g for w in ("transaction", "history", "statement")):
            return "view_transactions"
        if any(w in g for w in ("pay", "bill", "payment")):
            return "pay_bill"
        if any(w in g for w in ("expense", "spending", "budget", "track")):
            return "track_expenses"
        if any(w in g for w in ("report", "analysis", "summary")):
            return "financial_report"
        return "check_balance"

    def _resolve_portal(self, portal_key: str, goal: str) -> tuple[Optional[str], Optional[str]]:
        """Return (portal_name, portal_url) for the requested bank or None."""
        if portal_key and portal_key in BANKING_PORTALS:
            return portal_key, BANKING_PORTALS[portal_key]
        # Keyword scan of the goal.
        g = goal.lower()
        for name, url in BANKING_PORTALS.items():
            if name in g:
                return name, url
        return None, None

    async def _page_text(self, limit: int = 8000) -> str:
        """Extract visible text from the live page (self-heals on failure)."""
        if not self.page:
            return ""
        try:
            text = await self.page.evaluate("() => document.body.innerText || ''")
            return (text or "").strip()[:limit]
        except Exception:
            return ""

    def _extract_balance_text(self, page_text: str) -> str:
        """Heuristic: grab lines that look like they contain a monetary balance."""
        if not page_text:
            return ""
        lines = page_text.splitlines()
        hits = [
            ln.strip() for ln in lines
            if any(tok in ln for tok in ("₹", "Rs.", "INR", "Balance", "Available", "balance"))
            and len(ln.strip()) < 200
        ]
        return " | ".join(hits[:5]) if hits else ""

    def _extract_transactions(self, page_text: str, portal: Optional[str]) -> List[Dict]:
        """Heuristic: identify transaction-like lines from the page text."""
        if not page_text:
            return []
        import re
        amount_re = re.compile(r"(?:₹|Rs\.?|INR)\s?[\d,]{2,}(?:\.\d{2})?")
        lines = [ln.strip() for ln in page_text.splitlines() if amount_re.search(ln) and 10 < len(ln.strip()) < 200]
        txns = []
        for i, ln in enumerate(lines[:20]):
            m = amount_re.search(ln)
            txns.append({
                "action":  "view_transactions",
                "portal":  portal or "web",
                "index":   i,
                "line":    ln,
                "amount":  m.group(0) if m else None,
                "timestamp": datetime.now().isoformat(),
            })
        return txns

    async def _web_fallback_search(self, query: str) -> str:
        """Use a Google search as a last resort when the portal is unreachable."""
        if not self.page:
            return ""
        try:
            from urllib.parse import quote_plus
            url = f"https://www.google.com/search?q={quote_plus(query)}"
            await self.page.goto(url, wait_until="domcontentloaded", timeout=20_000)
            await asyncio.sleep(1)
            return await self._page_text(limit=3000)
        except Exception:
            return ""

    async def _web_fallback_text(self, query: str) -> str:
        return await self._web_fallback_search(query)

    async def _web_fallback_transactions(self, query: str) -> List[Dict]:
        text = await self._web_fallback_search(query + " transaction history")
        return self._extract_transactions(text, None)

    async def _ai_summarise(self, text: str, instruction: str) -> Optional[str]:
        """Call the AI client if available; return None otherwise (graceful degrade)."""
        # The bridge may expose an `ai` attribute when called from the skill layer.
        ai = getattr(self.bridge, "ai", None)
        if ai is None or not getattr(ai, "available", False):
            return None
        try:
            return await ai.summarize(text, instruction)
        except Exception:
            return None

    # ------------------------------------------------------------------
    # Bridge helpers — degrade to no-ops in standalone CLI mode
    # ------------------------------------------------------------------

    async def _log(self, message: str, level: str = "info") -> None:
        self.logger.info("[%s] %s", level.upper(), message)
        if self.bridge is not None:
            try:
                await self.bridge.log(message, level=level)
            except Exception:
                pass

    async def _gate(self, description: str, step_data: Dict) -> bool:
        """Request user approval before a consequential action.

        Returns True (proceed) when:
          - running standalone (no bridge) — auto-approve in CLI mode
          - bridge.gate() returns True
          - FINANCE_AUTO_APPROVE env var is set
        """
        auto = os.environ.get("FINANCE_AUTO_APPROVE", "").strip().lower() in ("1", "true", "yes")
        if auto:
            await self._log("Auto-approved (FINANCE_AUTO_APPROVE=true)", level="warn")
            return True
        if self.bridge is None:
            await self._log("Standalone mode — auto-approving payment gate", level="warn")
            return True
        try:
            return await self.bridge.gate(description, step_data)
        except Exception:
            return False

    async def _emit(self, kind: str, items: List[Dict]) -> None:
        self._results.extend(items)
        if self.bridge is not None:
            try:
                await self.bridge.emit_result(kind, items)
            except Exception:
                pass

    async def _cancelled(self) -> bool:
        if self.bridge is not None:
            try:
                return bool(await self.bridge.cancelled())
            except Exception:
                pass
        return False

    # ------------------------------------------------------------------
    # Result packaging
    # ------------------------------------------------------------------

    @staticmethod
    def _result(
        phase: str,
        action: str,
        items: List[Dict],
        status: str = "success",
    ) -> Dict:
        return {
            "action": action,
            "phase":  phase,
            "status": status,
            "data":   {"items": items, "count": len(items)},
            "items":  items,
        }


# ---------------------------------------------------------------------------
# Standalone CLI entry point (mirrors job_agent/main.py pattern)
# ---------------------------------------------------------------------------

async def _cli_main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [finance_agent] %(levelname)s %(message)s",
    )
    logger = logging.getLogger("Main")
    logger.info("=" * 60)
    logger.info("FINANCE AGENT — standalone mode")
    logger.info("=" * 60)

    task_context = {
        "goal":      os.environ.get("FINANCE_GOAL", "check my bank account balance"),
        "task_type": os.environ.get("FINANCE_TASK_TYPE", "check_balance"),
        "portal":    os.environ.get("FINANCE_PORTAL", ""),
        "query":     os.environ.get("FINANCE_QUERY", ""),
    }

    agent = FinanceAgent()
    result = await agent.execute(task_context)

    logger.info("Result: action=%s status=%s items=%d",
                result.get("action"), result.get("status"), len(result.get("items", [])))
    for item in result.get("items", []):
        logger.info("  %s", item)


if __name__ == "__main__":
    asyncio.run(_cli_main())
