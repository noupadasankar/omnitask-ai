"""Semantic page analyzer — converts any web page into rich structured data.

Instead of raw DOM: understands page purpose, extracts prices, dates, errors,
forms, auth state, loading state, navigation, tables, cards, tabs, accordions,
carousels, menus, filters, toasts, and produces a complete PageSummary.
"""

import asyncio
import hashlib
import logging
import re
from dataclasses import dataclass, field
from typing import Optional

log = logging.getLogger("browser-py.engine.semantic_page")

_PRICE_PATTERN = re.compile(
    r"(?:[$£€₹¥₩]\s*[\d,]+(?:\.\d{1,2})?|[\d,]+(?:\.\d{1,2})?\s*(?:USD|EUR|GBP|INR|JPY|KRW|AUD|CAD))",
    re.IGNORECASE,
)
_DATE_PATTERN = re.compile(
    r"\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}|"
    r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{2,4})\b",
    re.IGNORECASE,
)
_ERROR_CLASSES = re.compile(r"error|invalid|danger|alert|warning|failed|failure", re.IGNORECASE)
_SUCCESS_CLASSES = re.compile(r"success|confirmed|completed|thank", re.IGNORECASE)


@dataclass
class PageElement:
    # Core identity
    tag: str
    id: str
    role: str
    text: str
    aria_label: str
    placeholder: str
    tooltip: str
    # Hierarchy & location
    selector: str
    xpath: str
    parent_hierarchy: list
    bounding_box: Optional[dict]
    # Properties
    attributes: dict
    children_count: int
    confidence: float           # 0-1 confidence this is the right element
    # State flags
    is_interactive: bool
    is_visible: bool
    is_enabled: bool
    is_required: bool
    is_readonly: bool
    is_clickable: bool
    # Classification
    semantic_type: str  # button|link|input|heading|price|date|image|video|form|table|list|card|navigation|modal|toast|error|loading|empty_state


@dataclass
class PageSummary:
    url: str
    title: str
    page_purpose: str           # homepage|search_results|product_detail|cart|checkout|login|signup|profile|dashboard|form|article|listing|confirmation|error
    primary_action: Optional[str]
    secondary_actions: list
    forms: list
    prices: list                # [{text, amount, currency, context}]
    dates: list                 # [{text, context}]
    errors: list                # visible error messages
    warnings: list
    auth_state: str             # authenticated|anonymous|unknown
    loading_state: str          # ready|loading|error|empty
    interactive_elements: list  # full per-element properties
    semantic_sections: list
    has_pagination: bool
    has_infinite_scroll: bool
    has_modal: bool
    modal_content: Optional[str]
    breadcrumb: list
    content_hash: str
    # Extended element categories (Phase 2)
    navigation_elements: list
    tables: list
    cards: list
    tabs: list
    accordions: list
    carousels: list
    search_bar: Optional[dict]
    filters: list
    toast_notifications: list
    success_messages: list
    required_fields: list
    disabled_controls: list
    empty_states: list
    menus: list


class SemanticPage:
    """Converts any web page into a structured semantic representation."""

    async def analyze(self, page, *, depth: str = "full") -> PageSummary:
        """Analyze the current page and return a PageSummary.

        depth: "quick" | "standard" | "full"
        """
        url = ""
        title = ""
        try:
            url = page.url
            title = await page.title()
        except Exception:
            pass

        purpose = await self.get_page_purpose(page)
        primary, secondary = await self._extract_actions(page, purpose)

        # Always extract these
        errors = await self.extract_errors(page)
        loading = await self.detect_loading_state(page)
        auth = await self.detect_auth_state(page)
        has_modal, modal_content = await self._detect_modal(page)

        # Standard depth and above
        forms: list = []
        prices: list = []
        dates: list = []
        warnings: list = []
        interactive: list = []
        sections: list = []
        breadcrumb: list = []

        if depth in ("standard", "full"):
            forms = await self.extract_forms(page)
            prices = await self.extract_prices(page)
            errors = await self.extract_errors(page)
            warnings = await self._extract_warnings(page)
            breadcrumb = await self._extract_breadcrumb(page)

        if depth == "full":
            dates = await self.extract_dates(page)
            interactive = await self._extract_interactive_elements(page)
            sections = await self._extract_semantic_sections(page)

        has_pagination = await self._detect_pagination(page)
        has_infinite_scroll = await self._detect_infinite_scroll(page)
        content_hash = await self._content_hash(page)

        # Extended element categories
        nav_elements: list = []
        tables: list = []
        cards: list = []
        tabs: list = []
        accordions: list = []
        carousels: list = []
        search_bar = None
        filters: list = []
        toasts: list = []
        success_msgs: list = []
        required_fields: list = []
        disabled_controls: list = []
        empty_states: list = []
        menus: list = []

        if depth == "full":
            (
                nav_elements, tables, cards, tabs, accordions, carousels,
                search_bar, filters, toasts, success_msgs,
                required_fields, disabled_controls, empty_states, menus,
            ) = await asyncio.gather(
                self._extract_navigation(page),
                self._extract_tables(page),
                self._extract_cards(page),
                self._extract_tabs(page),
                self._extract_accordions(page),
                self._extract_carousels(page),
                self._extract_search_bar(page),
                self._extract_filters(page),
                self._extract_toasts(page),
                self._extract_success_messages(page),
                self._extract_required_fields(page),
                self._extract_disabled_controls(page),
                self._extract_empty_states(page),
                self._extract_menus(page),
            )

        return PageSummary(
            url=url,
            title=title,
            page_purpose=purpose,
            primary_action=primary,
            secondary_actions=secondary,
            forms=forms,
            prices=prices,
            dates=dates,
            errors=errors,
            warnings=warnings,
            auth_state=auth,
            loading_state=loading,
            interactive_elements=interactive,
            semantic_sections=sections,
            has_pagination=has_pagination,
            has_infinite_scroll=has_infinite_scroll,
            has_modal=has_modal,
            modal_content=modal_content,
            breadcrumb=breadcrumb,
            content_hash=content_hash,
            navigation_elements=nav_elements,
            tables=tables,
            cards=cards,
            tabs=tabs,
            accordions=accordions,
            carousels=carousels,
            search_bar=search_bar,
            filters=filters,
            toast_notifications=toasts,
            success_messages=success_msgs,
            required_fields=required_fields,
            disabled_controls=disabled_controls,
            empty_states=empty_states,
            menus=menus,
        )

    async def get_page_purpose(self, page) -> str:
        """Classify the current page into one of the known purpose types."""
        url = ""
        try:
            url = page.url.lower()
        except Exception:
            pass

        url_patterns = {
            "login": ["/login", "/signin", "/sign-in", "/auth"],
            "signup": ["/signup", "/register", "/sign-up", "/create-account"],
            "cart": ["/cart", "/basket", "/bag"],
            "checkout": ["/checkout", "/payment", "/order/"],
            "confirmation": ["/confirmation", "/success", "/thank-you", "/order-confirm"],
            "search_results": ["/search", "?q=", "?query=", "/results"],
            "product_detail": ["/product/", "/item/", "/p/", "/dp/"],
            "profile": ["/profile", "/account", "/settings", "/my-"],
            "dashboard": ["/dashboard", "/home", "/overview"],
        }

        for purpose, patterns in url_patterns.items():
            if any(p in url for p in patterns):
                return purpose

        try:
            content_signals = await page.evaluate("""() => {
                const h1 = document.querySelector('h1');
                const h1Text = (h1 && h1.textContent || '').toLowerCase();
                const forms = document.querySelectorAll('form').length;
                const inputs = document.querySelectorAll('input[type="text"], input[type="email"]').length;
                const hasPrice = !!document.querySelector('[class*="price"], [class*="amount"]');
                const hasResults = !!document.querySelector('[class*="result"], [class*="listing"], [class*="product-list"]');
                const isArticle = !!document.querySelector('article, [class*="article"], [class*="blog-post"]');
                return {h1Text, forms, inputs, hasPrice, hasResults, isArticle};
            }""")

            if content_signals.get("isArticle"):
                return "article"
            if content_signals.get("hasResults"):
                return "search_results" if "search" in url else "listing"
            if content_signals.get("hasPrice") and not content_signals.get("hasResults"):
                return "product_detail"
            if content_signals.get("forms", 0) > 0 and content_signals.get("inputs", 0) > 2:
                return "form"
        except Exception:
            pass

        return "homepage"

    async def extract_prices(self, page) -> list[dict]:
        """Extract all price mentions from the page."""
        try:
            text = await page.evaluate("() => document.body.innerText")
            matches = _PRICE_PATTERN.finditer(text or "")
            prices = []
            for m in matches:
                raw = m.group()
                nums = re.findall(r"[\d,.]+", raw)
                amount = float(nums[0].replace(",", "")) if nums else 0.0
                currency = "INR" if "₹" in raw else "USD" if "$" in raw else "EUR" if "€" in raw else "GBP" if "£" in raw else "?"
                prices.append({"text": raw, "amount": amount, "currency": currency, "context": ""})
            return prices[:20]
        except Exception:
            return []

    async def extract_dates(self, page) -> list[dict]:
        """Extract all date mentions from the page."""
        try:
            text = await page.evaluate("() => document.body.innerText")
            matches = _DATE_PATTERN.findall(text or "")
            return [{"text": m, "context": ""} for m in dict.fromkeys(matches)][:10]
        except Exception:
            return []

    async def extract_errors(self, page) -> list[str]:
        """Extract all visible error messages."""
        errors = []
        try:
            raw = await page.evaluate("""() => {
                const selectors = [
                    '[class*="error"]', '[class*="invalid"]', '[role="alert"]',
                    '[class*="danger"]', '[class*="failed"]', '.alert-danger',
                    'input:invalid + *', '[aria-invalid="true"] + *',
                ];
                const seen = new Set();
                const results = [];
                for (const sel of selectors) {
                    for (const el of document.querySelectorAll(sel)) {
                        const t = (el.textContent || '').trim();
                        if (t && t.length > 2 && t.length < 300 && !seen.has(t)) {
                            seen.add(t);
                            results.push(t);
                        }
                    }
                }
                return results;
            }""")
            errors = [str(e) for e in (raw or [])]
        except Exception:
            pass
        return errors[:10]

    async def extract_forms(self, page) -> list[dict]:
        """Extract all forms with their field information."""
        try:
            return await page.evaluate("""() => {
                return Array.from(document.querySelectorAll('form')).map((form, i) => ({
                    index: i,
                    id: form.id || null,
                    action: form.action || null,
                    method: form.method || 'get',
                    field_count: form.querySelectorAll('input, select, textarea').length,
                    fields: Array.from(form.querySelectorAll('input, select, textarea')).map(el => ({
                        name: el.name || el.id || '',
                        type: el.type || el.tagName.toLowerCase(),
                        required: el.required,
                        placeholder: el.placeholder || '',
                        label: (() => {
                            if (el.labels && el.labels.length) return el.labels[0].textContent.trim();
                            return el.getAttribute('aria-label') || el.placeholder || el.name || '';
                        })(),
                    })),
                }));
            }""") or []
        except Exception:
            return []

    async def detect_auth_state(self, page) -> str:
        """Detect whether the user appears logged in."""
        try:
            result = await page.evaluate("""() => {
                const loggedInSignals = [
                    '[class*="user-menu"]', '[class*="account-menu"]',
                    '[class*="logged-in"]', '[class*="user-avatar"]',
                    '[aria-label*="account"]', '[aria-label*="profile"]',
                    '.avatar', '[class*="profile-pic"]',
                ];
                const loggedOutSignals = ['a[href*="login"]', 'a[href*="signin"]', 'button[class*="login"]'];

                const isIn = loggedInSignals.some(s => document.querySelector(s));
                const isOut = loggedOutSignals.some(s => document.querySelector(s));
                if (isIn) return 'authenticated';
                if (isOut) return 'anonymous';
                return 'unknown';
            }""")
            return result or "unknown"
        except Exception:
            return "unknown"

    async def detect_loading_state(self, page) -> str:
        """Detect the page's current loading/content state."""
        try:
            result = await page.evaluate("""() => {
                const spinners = document.querySelectorAll(
                    '[class*="spinner"], [class*="loading"], [class*="skeleton"], [aria-busy="true"]'
                );
                if (spinners.length > 0) return 'loading';

                const h1 = document.querySelector('h1');
                if (h1 && (h1.textContent.includes('Error') || h1.textContent.includes('404'))) return 'error';

                const empty = document.querySelectorAll('[class*="empty-state"], [class*="no-results"], [class*="no-data"]');
                if (empty.length > 0) return 'empty';

                return 'ready';
            }""")
            return result or "ready"
        except Exception:
            return "ready"

    async def get_semantic_diff(self, before: PageSummary, after: PageSummary) -> dict:
        """Compute what changed between two page summaries."""
        changes = {}
        if before.url != after.url:
            changes["url"] = {"before": before.url, "after": after.url}
        if before.page_purpose != after.page_purpose:
            changes["page_purpose"] = {"before": before.page_purpose, "after": after.page_purpose}
        if before.has_modal != after.has_modal:
            changes["modal"] = {"appeared": after.has_modal, "content": after.modal_content}
        if before.errors != after.errors:
            changes["errors"] = {"added": list(set(after.errors) - set(before.errors)),
                                  "removed": list(set(before.errors) - set(after.errors))}
        if before.loading_state != after.loading_state:
            changes["loading_state"] = {"before": before.loading_state, "after": after.loading_state}
        if before.content_hash != after.content_hash:
            changes["content_changed"] = True
        return changes

    # ── Extended element extractors ──────────────────────────────────────────

    async def _extract_navigation(self, page) -> list[dict]:
        try:
            return await page.evaluate("""() => {
                return Array.from(document.querySelectorAll('nav, [role="navigation"], header a')).slice(0, 20).map(el => ({
                    tag: el.tagName.toLowerCase(),
                    text: (el.textContent || '').trim().slice(0, 60),
                    href: el.href || null,
                    aria_label: el.getAttribute('aria-label') || '',
                    is_active: el.getAttribute('aria-current') === 'page' || el.classList.contains('active'),
                }));
            }""") or []
        except Exception:
            return []

    async def _extract_tables(self, page) -> list[dict]:
        try:
            return await page.evaluate("""() => {
                return Array.from(document.querySelectorAll('table, [role="table"]')).slice(0, 5).map(tbl => {
                    const headers = Array.from(tbl.querySelectorAll('th, [role="columnheader"]')).map(h => (h.textContent || '').trim());
                    const rows = tbl.querySelectorAll('tr, [role="row"]').length;
                    return {headers, row_count: rows, has_sortable: !!tbl.querySelector('[aria-sort]')};
                });
            }""") or []
        except Exception:
            return []

    async def _extract_cards(self, page) -> list[dict]:
        try:
            return await page.evaluate("""() => {
                const cardSels = ['[class*="card"]', '[class*="tile"]', '[class*="item-card"]', 'article'];
                const seen = new Set();
                const cards = [];
                for (const sel of cardSels) {
                    for (const el of document.querySelectorAll(sel)) {
                        const t = (el.textContent || '').trim().slice(0, 100);
                        if (t && !seen.has(t)) {
                            seen.add(t);
                            const rect = el.getBoundingClientRect();
                            cards.push({text: t, has_image: !!el.querySelector('img'), visible: rect.top < window.innerHeight});
                        }
                    }
                }
                return cards.slice(0, 20);
            }""") or []
        except Exception:
            return []

    async def _extract_tabs(self, page) -> list[dict]:
        try:
            return await page.evaluate("""() => {
                return Array.from(document.querySelectorAll('[role="tab"], [class*="tab-item"]')).map(el => ({
                    text: (el.textContent || '').trim(),
                    is_active: el.getAttribute('aria-selected') === 'true' || el.classList.contains('active'),
                    href: el.getAttribute('href') || null,
                }));
            }""") or []
        except Exception:
            return []

    async def _extract_accordions(self, page) -> list[dict]:
        try:
            return await page.evaluate("""() => {
                return Array.from(document.querySelectorAll('[class*="accordion"], details')).slice(0, 10).map(el => ({
                    heading: (el.querySelector('summary, [class*="accordion-header"]') || el).textContent.trim().slice(0, 80),
                    is_expanded: el.open || el.getAttribute('aria-expanded') === 'true',
                }));
            }""") or []
        except Exception:
            return []

    async def _extract_carousels(self, page) -> list[dict]:
        try:
            return await page.evaluate("""() => {
                const carousels = document.querySelectorAll('[class*="carousel"], [class*="slider"], [role="listbox"]');
                return Array.from(carousels).slice(0, 5).map(el => ({
                    item_count: el.children.length,
                    has_prev_next: !!(el.querySelector('[class*="prev"], [class*="next"], [aria-label*="previous"], [aria-label*="next"]')),
                }));
            }""") or []
        except Exception:
            return []

    async def _extract_search_bar(self, page) -> Optional[dict]:
        try:
            return await page.evaluate("""() => {
                const input = document.querySelector(
                    'input[type="search"], input[placeholder*="search" i], input[aria-label*="search" i], input[name="q"]'
                );
                if (!input) return null;
                const rect = input.getBoundingClientRect();
                return {
                    selector: input.id ? '#' + input.id : input.name ? '[name="' + input.name + '"]' : 'input[type="search"]',
                    placeholder: input.placeholder || '',
                    current_value: input.value || '',
                    is_visible: rect.top < window.innerHeight && rect.width > 0,
                };
            }""")
        except Exception:
            return None

    async def _extract_filters(self, page) -> list[dict]:
        try:
            return await page.evaluate("""() => {
                const filterSels = ['[class*="filter"]', '[class*="facet"]', '[aria-label*="filter" i]'];
                const filters = [];
                for (const sel of filterSels) {
                    for (const el of document.querySelectorAll(sel)) {
                        const label = (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 50);
                        if (label) filters.push({label, type: el.tagName.toLowerCase(), is_applied: el.getAttribute('aria-pressed') === 'true'});
                    }
                }
                return filters.slice(0, 20);
            }""") or []
        except Exception:
            return []

    async def _extract_toasts(self, page) -> list[dict]:
        try:
            return await page.evaluate("""() => {
                const toastSels = ['[class*="toast"]', '[class*="snackbar"]', '[class*="notification"]', '[role="status"]'];
                const toasts = [];
                for (const sel of toastSels) {
                    for (const el of document.querySelectorAll(sel)) {
                        const t = (el.textContent || '').trim();
                        if (t && t.length > 2) {
                            const rect = el.getBoundingClientRect();
                            if (rect.width > 0) toasts.push({text: t.slice(0, 200), type: 'info'});
                        }
                    }
                }
                return toasts.slice(0, 5);
            }""") or []
        except Exception:
            return []

    async def _extract_success_messages(self, page) -> list[str]:
        try:
            raw = await page.evaluate("""() => {
                return Array.from(document.querySelectorAll('[class*="success"], [class*="confirmed"], .alert-success, [class*="thank"]'))
                    .map(el => (el.textContent || '').trim())
                    .filter(t => t.length > 2 && t.length < 300);
            }""")
            return (raw or [])[:5]
        except Exception:
            return []

    async def _extract_required_fields(self, page) -> list[dict]:
        try:
            return await page.evaluate("""() => {
                return Array.from(document.querySelectorAll('input[required], select[required], textarea[required]')).map(el => ({
                    name: el.name || el.id || '',
                    type: el.type || el.tagName.toLowerCase(),
                    label: el.getAttribute('aria-label') || el.placeholder || el.name || '',
                    is_filled: !!el.value,
                }));
            }""") or []
        except Exception:
            return []

    async def _extract_disabled_controls(self, page) -> list[dict]:
        try:
            return await page.evaluate("""() => {
                return Array.from(document.querySelectorAll('button:disabled, input:disabled, [aria-disabled="true"]')).slice(0, 10).map(el => ({
                    tag: el.tagName.toLowerCase(),
                    text: (el.textContent || el.value || '').trim().slice(0, 60),
                    aria_label: el.getAttribute('aria-label') || '',
                }));
            }""") or []
        except Exception:
            return []

    async def _extract_empty_states(self, page) -> list[str]:
        try:
            raw = await page.evaluate("""() => {
                return Array.from(document.querySelectorAll('[class*="empty-state"], [class*="no-results"], [class*="no-data"], [class*="empty"]'))
                    .map(el => (el.textContent || '').trim().slice(0, 150))
                    .filter(t => t.length > 2);
            }""")
            return (raw or [])[:3]
        except Exception:
            return []

    async def _extract_menus(self, page) -> list[dict]:
        try:
            return await page.evaluate("""() => {
                return Array.from(document.querySelectorAll('[role="menu"], [role="menubar"], [class*="dropdown-menu"]')).slice(0, 5).map(el => ({
                    item_count: el.querySelectorAll('[role="menuitem"], li, a').length,
                    is_visible: el.getBoundingClientRect().width > 0,
                    aria_label: el.getAttribute('aria-label') || '',
                }));
            }""") or []
        except Exception:
            return []

    # ── Private helpers ───────────────────────────────────────────────────────

    async def _extract_actions(self, page, purpose: str) -> tuple[Optional[str], list[str]]:
        try:
            result = await page.evaluate("""() => {
                const primary = document.querySelector(
                    'button[type="submit"], .cta-button, [class*="primary-btn"], [class*="btn-primary"]'
                );
                const all_buttons = Array.from(document.querySelectorAll('button, [role="button"]'))
                    .filter(el => {
                        const rect = el.getBoundingClientRect();
                        return rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight;
                    })
                    .map(el => (el.textContent || '').trim())
                    .filter(t => t.length > 0 && t.length < 50);
                return {
                    primary: primary ? (primary.textContent || '').trim() : null,
                    secondary: all_buttons.slice(0, 8),
                };
            }""")
            return result.get("primary"), result.get("secondary", [])
        except Exception:
            return None, []

    async def _detect_modal(self, page) -> tuple[bool, Optional[str]]:
        try:
            result = await page.evaluate("""() => {
                const modal = document.querySelector('dialog[open], [role="dialog"][aria-modal="true"], [class*="modal"][style*="display: block"]');
                if (!modal) return {visible: false, content: null};
                return {visible: true, content: (modal.textContent || '').trim().slice(0, 200)};
            }""")
            return result.get("visible", False), result.get("content")
        except Exception:
            return False, None

    async def _extract_warnings(self, page) -> list[str]:
        try:
            raw = await page.evaluate("""() => {
                return Array.from(document.querySelectorAll('[class*="warning"], [class*="warn"], .alert-warning'))
                    .map(el => (el.textContent || '').trim())
                    .filter(t => t.length > 2 && t.length < 300);
            }""")
            return raw or []
        except Exception:
            return []

    async def _extract_breadcrumb(self, page) -> list[str]:
        try:
            raw = await page.evaluate("""() => {
                const nav = document.querySelector('[aria-label="breadcrumb"], .breadcrumb, [class*="breadcrumb"]');
                if (!nav) return [];
                return Array.from(nav.querySelectorAll('a, span, li'))
                    .map(el => (el.textContent || '').trim())
                    .filter(t => t && t !== '>' && t !== '/' && t !== '›');
            }""")
            return raw or []
        except Exception:
            return []

    async def _detect_pagination(self, page) -> bool:
        try:
            result = await page.evaluate("""() => {
                return !!(
                    document.querySelector('[aria-label*="pagination"], .pagination, [class*="page-nav"], [rel="next"]') ||
                    Array.from(document.querySelectorAll('button')).find(b => /next page/i.test(b.textContent))
                );
            }""")
            return bool(result)
        except Exception:
            return False

    async def _detect_infinite_scroll(self, page) -> bool:
        try:
            result = await page.evaluate("""() => {
                return !!(
                    document.querySelector('[class*="infinite"], [class*="virtualized"], [class*="virtual-list"]') ||
                    document.querySelector('[data-infinite-scroll]')
                );
            }""")
            return bool(result)
        except Exception:
            return False

    async def _extract_interactive_elements(self, page) -> list[dict]:
        """Extract interactive elements with full per-element properties."""
        try:
            raw = await page.evaluate("""() => {
                const els = document.querySelectorAll('button, a, input, select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="radio"]');
                return Array.from(els).slice(0, 80).map(el => {
                    const rect = el.getBoundingClientRect();
                    const visible = rect.width > 0 && rect.top < window.innerHeight;

                    // Build CSS selector
                    let sel = el.tagName.toLowerCase();
                    if (el.id) sel = '#' + el.id;
                    else if (el.getAttribute('data-testid')) sel = '[data-testid="' + el.getAttribute('data-testid') + '"]';
                    else if (el.getAttribute('aria-label')) sel = '[aria-label="' + el.getAttribute('aria-label') + '"]';

                    // Parent hierarchy (3 levels)
                    const hierarchy = [];
                    let parent = el.parentElement;
                    let depth = 0;
                    while (parent && depth < 3) {
                        hierarchy.push(parent.tagName.toLowerCase() + (parent.id ? '#' + parent.id : ''));
                        parent = parent.parentElement;
                        depth++;
                    }

                    return {
                        tag: el.tagName.toLowerCase(),
                        id: el.id || '',
                        role: el.getAttribute('role') || el.tagName.toLowerCase(),
                        text: (el.textContent || el.value || '').trim().slice(0, 80),
                        aria_label: el.getAttribute('aria-label') || '',
                        placeholder: el.placeholder || '',
                        tooltip: el.getAttribute('title') || el.getAttribute('data-tooltip') || '',
                        selector: sel,
                        parent_hierarchy: hierarchy,
                        bounding_box: visible ? {x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height)} : null,
                        children_count: el.children.length,
                        confidence: 0.85,
                        is_interactive: true,
                        is_visible: visible,
                        is_enabled: !el.disabled,
                        is_required: !!el.required,
                        is_readonly: !!el.readOnly,
                        is_clickable: visible && !el.disabled,
                        semantic_type: el.type === 'submit' ? 'button' : el.tagName.toLowerCase() === 'a' ? 'link' : el.tagName.toLowerCase(),
                    };
                }).filter(el => el.is_visible);
            }""")
            return raw or []
        except Exception:
            return []

    async def _extract_semantic_sections(self, page) -> list[dict]:
        try:
            raw = await page.evaluate("""() => {
                const sections = document.querySelectorAll('section, main, aside, nav, header, footer, article, [role="main"], [role="navigation"]');
                return Array.from(sections).slice(0, 10).map(el => ({
                    tag: el.tagName.toLowerCase(),
                    role: el.getAttribute('role') || el.tagName.toLowerCase(),
                    heading: (el.querySelector('h1,h2,h3') ? el.querySelector('h1,h2,h3').textContent : '').trim().slice(0, 80),
                    element_count: el.children.length,
                }));
            }""")
            return raw or []
        except Exception:
            return []

    async def _content_hash(self, page) -> str:
        try:
            text = await page.evaluate("() => document.body.innerText || ''")
            return hashlib.md5((text or "").encode()).hexdigest()[:12]
        except Exception:
            return "unknown"
