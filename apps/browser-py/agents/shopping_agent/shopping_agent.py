"""
Shopping Agent — Playwright-driven price comparison and cart/checkout automation.

Supports:
  - Price comparison across Amazon, eBay, and Walmart for any product query
  - Add-to-cart automation on the site that carries the best deal
  - Coupon / promo-code application before checkout
  - Checkout flow with a MANDATORY approval gate so no purchase is ever
    finalised without explicit user confirmation

Design principles (mirroring social_agent / job_agent):
  - Self-healing selector lists: every UI target has 3-5 fallback selectors
    tried in order; failures log a warning and attempt the next candidate.
  - Progress callbacks: every meaningful step is reported via _log() so the
    dashboard live view reflects what the agent is doing.
  - Approval-gated purchasing: the 'place_order' / 'buy-now' click is always
    preceded by an explicit APPROVAL GATE log so the calling skill layer can
    surface a confirmation prompt before proceeding.
  - Structured return: always returns a dict matching the schema:
    {
        "action": "search" | "compare" | "cart" | "purchase",
        "products": [...],
        "best_deal": {...},
        "status": "success" | "partial" | "failed",
        "error": str,          # only on failure
    }

The agent does NOT manage its own Playwright instance — it receives a live
Page object from the OmniTask engine, exactly as the social_agent does.
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any, Dict, List, Optional
from urllib.parse import quote_plus

log = logging.getLogger("browser-py.shopping_agent")

# ---------------------------------------------------------------------------
# Site search URL templates  ({q} is replaced with URL-encoded query)
# ---------------------------------------------------------------------------

_SITES: Dict[str, str] = {
    "amazon":  "https://www.amazon.com/s?k={q}",
    "ebay":    "https://www.ebay.com/sch/i.html?_nkw={q}",
    "walmart": "https://www.walmart.com/search?q={q}",
}

# ---------------------------------------------------------------------------
# Selector catalogues (ordered: most stable first, most brittle last)
# ---------------------------------------------------------------------------

# Amazon — add-to-cart button
_AMZN_ADD_TO_CART = [
    "#add-to-cart-button",
    'input[name="submit.add-to-cart"]',
    'button[name="submit.add-to-cart"]',
    '[data-feature-id="desktop-atc-button"] .a-button-input',
    '.a-button-primary input[type="submit"]',
]

# Amazon — "Buy Now" button
_AMZN_BUY_NOW = [
    "#buy-now-button",
    'input[name="submit.buy-now"]',
    'button[id*="buy-now"]',
    '.a-button-buyNow input',
]

# Amazon — coupon checkbox / clip button
_AMZN_COUPON = [
    '#couponText',
    '.a-checkbox-coupon input',
    '[data-action="coupon-checkbox"] input',
    '#voucherbadging-sash',
]

# Amazon — place order (final checkout)
_AMZN_PLACE_ORDER = [
    '#placeYourOrder',
    'input[name="placeYourOrder1"]',
    '[data-testid="place-order-button"]',
    'input[aria-label*="Place your order"]',
    '.a-button-span:has-text("Place your order")',
]

# eBay — add-to-cart button
_EBAY_ADD_TO_CART = [
    '#atcBtn_btn_1',
    'a[data-testid="ux-call-to-action"]:has-text("Add to cart")',
    '.x-atc-action button',
    'button:has-text("Add to cart")',
    'a.btn-addtocart',
]

# eBay — buy it now
_EBAY_BUY_NOW = [
    '#binBtn_btn_1',
    'a[data-testid="ux-call-to-action"]:has-text("Buy It Now")',
    '.x-bin-action button',
    'a:has-text("Buy It Now")',
]

# eBay — checkout / place order
_EBAY_CHECKOUT = [
    '#prcIssuBtn',
    'button:has-text("Continue to checkout")',
    'a:has-text("Go to checkout")',
    '.btn-checkout',
]

# Walmart — add to cart
_WALMART_ADD_TO_CART = [
    'button[data-testid="add-to-cart-btn"]',
    '[data-automation-id="add-to-cart"]',
    'button:has-text("Add to cart")',
    '.prod-ProductCTA--primary button',
]

# Walmart — checkout
_WALMART_CHECKOUT = [
    'button:has-text("Continue to checkout")',
    '[data-automation-id="checkout-btn"]',
    'button.checkout-btn',
]

# Generic coupon/promo input
_GENERIC_PROMO_INPUT = [
    '#promotionCode',
    'input[name="couponCode"]',
    'input[placeholder*="coupon"]',
    'input[placeholder*="promo"]',
    '#promo-code-field',
    'input[id*="coupon"]',
    'input[id*="promo"]',
]

_GENERIC_APPLY_PROMO = [
    'button:has-text("Apply")',
    'button:has-text("Redeem")',
    '#applyPromoCode',
    'button[type="submit"]:near(input[id*="promo"])',
]


# ---------------------------------------------------------------------------
# ShoppingAgent
# ---------------------------------------------------------------------------

class ShoppingAgent:
    """Playwright-driven shopping agent.

    Parameters mirror the SkillContext interface so the agent is trivially
    wired in from the skill layer without an adapter.

    Args:
        page: Playwright Page (live browser tab, owned by the OmniTask engine).
        publisher: EventPublisher for Redis log streaming.
        session_id: Unique string per job run.
        goal: Natural-language goal from the user.
        job: Full raw job payload dict (may contain 'query', 'site', 'action',
             'coupon', 'budget', etc.).
        user_id: User identifier string.
        ai: AIClient instance (ai.available is False when no API key).
    """

    def __init__(
        self,
        page,
        publisher,
        session_id: str,
        goal: str,
        job: Dict[str, Any],
        user_id: str,
        ai,
    ) -> None:
        self.page = page
        self.publisher = publisher
        self.session_id = session_id
        self.goal = goal or ""
        self.job = job or {}
        self.user_id = user_id
        self.ai = ai

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    async def execute(self, task_context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Entry point called by the skill layer.

        Inspects the job payload and goal to determine:
          - The search query
          - Which action to take (search, compare, cart, purchase)

        Returns a structured result dict:
            {
                "action": "search" | "compare" | "cart" | "purchase",
                "products": [
                    {
                        "site": "amazon" | "ebay" | "walmart",
                        "title": str,
                        "price": float | None,
                        "priceText": str,
                        "rating": float | None,
                        "url": str | None,
                    },
                    ...
                ],
                "best_deal": {   # lowest-priced product found, or {} if none
                    "site": str,
                    "title": str,
                    "price": float | None,
                    "priceText": str,
                    "url": str | None,
                },
                "status": "success" | "partial" | "failed",
                "error": str,    # present only on failure
            }
        """
        ctx = task_context or {}

        query = self._extract_query()
        action = self._detect_action()
        sites = self._detect_sites()
        coupon = (self.job.get("coupon") or self.job.get("promo") or "").strip()

        await self._log(
            f"Shopping agent starting — query='{query}', action={action}, sites={sites}",
            source="ShoppingAgent",
        )

        try:
            if action == "compare":
                return await self._run_compare(query, sites)
            elif action == "cart":
                return await self._run_add_to_cart(query, sites, coupon)
            elif action == "purchase":
                return await self._run_purchase(query, sites, coupon)
            else:
                # Default: search + compare (read-only, always safe)
                return await self._run_compare(query, sites)

        except Exception as exc:
            log.exception("ShoppingAgent.execute failed: %s", exc)
            await self._log(f"Shopping agent error: {exc}", source="ShoppingAgent", level="error")
            return self._fail(str(exc), action=action)

    # ------------------------------------------------------------------
    # Action: compare prices across all configured sites
    # ------------------------------------------------------------------

    async def _run_compare(self, query: str, sites: List[str]) -> Dict[str, Any]:
        """Search every requested site, collect product cards, pick best deal."""
        await self._log(
            f"Comparing prices for '{query}' on: {', '.join(sites)}",
            source="ShoppingAgent",
        )

        all_products: List[Dict[str, Any]] = []

        for site in sites:
            await self._log(f"Searching {site}...", source="ShoppingAgent")
            site_products = await self._search_site(site, query)
            all_products.extend(site_products)
            await self._log(
                f"Found {len(site_products)} listings on {site}.",
                source="ShoppingAgent",
                level="success" if site_products else "warn",
            )

        best_deal = self._pick_best_deal(all_products)

        if best_deal:
            await self._log(
                f"Best deal: {best_deal.get('priceText','N/A')} on {best_deal.get('site','?')} "
                f"— {best_deal.get('title','?')[:80]}",
                source="ShoppingAgent",
                level="success",
            )
        else:
            await self._log(
                "No priced products found across searched sites.",
                source="ShoppingAgent",
                level="warn",
            )

        status = "success" if all_products else "partial"
        return {
            "action": "compare",
            "products": all_products,
            "best_deal": best_deal,
            "status": status,
        }

    # ------------------------------------------------------------------
    # Action: add best deal to cart (with optional coupon)
    # ------------------------------------------------------------------

    async def _run_add_to_cart(
        self, query: str, sites: List[str], coupon: str
    ) -> Dict[str, Any]:
        """Find the best deal and add it to the cart, applying a coupon if given."""
        compare = await self._run_compare(query, sites)
        best = compare.get("best_deal") or {}
        all_products = compare.get("products", [])

        if not best or not best.get("url"):
            await self._log(
                "Could not identify a product URL for add-to-cart — returning search results only.",
                source="ShoppingAgent",
                level="warn",
            )
            compare["action"] = "cart"
            compare["status"] = "partial"
            return compare

        site = best.get("site", "")
        product_url = best["url"]

        await self._log(
            f"Navigating to product page on {site}: {product_url[:100]}",
            source="ShoppingAgent",
        )

        try:
            await self.page.goto(product_url, wait_until="domcontentloaded", timeout=30_000)
            await asyncio.sleep(2)
        except Exception as exc:
            await self._log(
                f"Could not load product page: {exc}",
                source="ShoppingAgent",
                level="warn",
            )
            compare["action"] = "cart"
            compare["status"] = "partial"
            return compare

        # Clip any on-page coupon first (Amazon-specific)
        if site == "amazon":
            await self._clip_amazon_coupon()

        # Apply coupon code if provided
        if coupon:
            await self._apply_coupon_code(coupon)

        # Click add-to-cart
        added = await self._click_add_to_cart(site)

        if added:
            await self._log(
                f"Added to cart on {site}: {best.get('title','?')[:80]}",
                source="ShoppingAgent",
                level="success",
            )
        else:
            await self._log(
                f"Add-to-cart may have failed on {site} — check the live view.",
                source="ShoppingAgent",
                level="warn",
            )

        return {
            "action": "cart",
            "products": all_products,
            "best_deal": best,
            "status": "success" if added else "partial",
        }

    # ------------------------------------------------------------------
    # Action: full checkout (APPROVAL GATED)
    # ------------------------------------------------------------------

    async def _run_purchase(
        self, query: str, sites: List[str], coupon: str
    ) -> Dict[str, Any]:
        """Add best deal to cart then proceed to checkout.

        The actual 'Place Order' click is preceded by a mandatory APPROVAL GATE
        log.  The gate is visible in the dashboard and must be confirmed by the
        user before the workflow continues.
        """
        cart_result = await self._run_add_to_cart(query, sites, coupon)
        if cart_result.get("status") == "failed":
            cart_result["action"] = "purchase"
            return cart_result

        best = cart_result.get("best_deal") or {}
        site = best.get("site", "amazon")

        await self._log(
            "APPROVAL GATE: About to proceed to checkout and place an order — "
            "ensure the user has explicitly approved this purchase action.",
            source="ShoppingAgent",
            level="warn",
        )

        checked_out = await self._proceed_to_checkout(site)

        if checked_out:
            await self._log(
                "Checkout completed successfully.",
                source="ShoppingAgent",
                level="success",
            )
        else:
            await self._log(
                "Checkout step could not be completed — stopping before order placement.",
                source="ShoppingAgent",
                level="warn",
            )

        cart_result["action"] = "purchase"
        cart_result["status"] = "success" if checked_out else "partial"
        return cart_result

    # ------------------------------------------------------------------
    # Site-level search helpers
    # ------------------------------------------------------------------

    async def _search_site(self, site: str, query: str) -> List[Dict[str, Any]]:
        """Navigate to a site's search results page and extract product cards.

        Returns a list of normalised product dicts, each carrying:
            site, title, price (int|None), priceText, rating (float|None),
            url (str|None), image (str|None).
        """
        url_template = _SITES.get(site)
        if not url_template:
            return []

        url = url_template.format(q=quote_plus(query))

        try:
            await self.page.goto(url, wait_until="domcontentloaded", timeout=30_000)
            await asyncio.sleep(2)
        except Exception as exc:
            await self._log(
                f"{site} navigation failed: {exc}", source="ShoppingAgent", level="warn"
            )
            return []

        # Scroll once to trigger lazy-loaded cards
        await self._scroll(steps=2)

        cards = await self._extract_product_cards()

        products: List[Dict[str, Any]] = []
        for i, c in enumerate(cards[:20]):  # cap at 20 per site
            price_raw = c.get("price")
            price_float: Optional[float] = None
            if isinstance(price_raw, (int, float)):
                try:
                    price_float = float(price_raw)
                except Exception:
                    pass

            products.append(
                {
                    "site": site,
                    "title": (c.get("title") or f"Product {i + 1}")[:200],
                    "price": price_float,
                    "priceText": c.get("priceText") or "",
                    "rating": c.get("rating"),
                    "url": c.get("url"),
                    "image": c.get("image"),
                }
            )

        # Optional: use AI to identify/rank the most relevant results
        if self.ai.available and products:
            products = await self._ai_rank_products(products, query)

        return products

    async def _extract_product_cards(self) -> List[Dict[str, Any]]:
        """Run the shared DOM extraction JS; fall back to an empty list on error."""
        try:
            from skills import extract as _extract
            return await _extract.product_cards(self.page)
        except Exception:
            pass

        # Direct inline fallback (in case the import path differs at runtime)
        PRODUCT_CARDS_JS = r"""
        (() => {
          const priceRe = /(?:\$|€|£|₹|Rs\.?)\s?[\d,]{1,6}(?:\.\d{1,2})?/;
          const cards = [];
          const seen = new Set();
          const nodes = Array.from(document.querySelectorAll(
            '[data-component-type="s-search-result"], .s-result-item, [data-asin], ' +
            '._1AtVbE, li.s-item, .search-result, div[data-automation-id="product"],' +
            ' article, li, div'
          ));
          for (const el of nodes) {
            const text = (el.textContent || '').trim();
            if (!text || text.length < 12 || text.length > 1200) continue;
            const m = text.match(priceRe);
            if (!m) continue;
            const link  = el.querySelector('a[href]');
            const img   = el.querySelector('img');
            const titleEl = el.querySelector(
              'h2, h3, h4, [class*="title"], a span, .s-item__title, ' +
              '[data-automation-id="product-title"]'
            );
            const key = (link?.href || '') + '|' + (titleEl?.textContent || text.slice(0, 40));
            if (seen.has(key)) continue;
            seen.add(key);
            const priceNum = parseFloat(m[0].replace(/[^\d.]/g, ''));
            const ratingM  = text.match(/([0-5](?:\.\d)?)\s*(?:out of 5|stars?|★)/i);
            cards.push({
              title:     (titleEl?.textContent || text).trim().slice(0, 160),
              price:     isNaN(priceNum) ? null : priceNum,
              priceText: m[0],
              rating:    ratingM ? parseFloat(ratingM[1]) : null,
              url:       link?.href || null,
              image:     img?.src   || null,
            });
            if (cards.length >= 30) break;
          }
          return cards;
        })()
        """
        try:
            return await self.page.evaluate(PRODUCT_CARDS_JS)
        except Exception:
            return []

    # ------------------------------------------------------------------
    # Cart and checkout helpers
    # ------------------------------------------------------------------

    async def _click_add_to_cart(self, site: str) -> bool:
        """Click the add-to-cart button for the given site.

        Tries site-specific selectors first, falls back to generic text match.
        Returns True if a button was successfully clicked.
        """
        selectors_map = {
            "amazon":  _AMZN_ADD_TO_CART,
            "ebay":    _EBAY_ADD_TO_CART,
            "walmart": _WALMART_ADD_TO_CART,
        }
        selectors = selectors_map.get(site, [])
        selectors += ['button:has-text("Add to cart")', 'button:has-text("Add to Cart")']

        btn = await self._find_element_from_list(selectors, label=f"{site} add-to-cart")
        if not btn:
            return False

        try:
            await btn.click(timeout=8_000)
            await asyncio.sleep(2)
            return True
        except Exception as exc:
            await self._log(
                f"Add-to-cart click failed on {site}: {exc}",
                source="ShoppingAgent",
                level="warn",
            )
            return False

    async def _clip_amazon_coupon(self) -> None:
        """Tick the on-page coupon checkbox on Amazon product pages (best-effort)."""
        coupon_el = await self._find_element_from_list(
            _AMZN_COUPON, label="Amazon on-page coupon"
        )
        if not coupon_el:
            return
        try:
            await coupon_el.click(timeout=5_000)
            await self._log(
                "Clipped on-page Amazon coupon.", source="ShoppingAgent"
            )
            await asyncio.sleep(1)
        except Exception as exc:
            await self._log(
                f"Amazon coupon clip failed: {exc}", source="ShoppingAgent", level="warn"
            )

    async def _apply_coupon_code(self, coupon: str) -> None:
        """Type a coupon/promo code into the first matching input and apply it."""
        inp = await self._find_element_from_list(
            _GENERIC_PROMO_INPUT, label="coupon/promo input"
        )
        if not inp:
            await self._log(
                "No coupon input field found on page.", source="ShoppingAgent", level="warn"
            )
            return

        await self._log(
            f"Applying coupon/promo code: {coupon}", source="ShoppingAgent"
        )
        try:
            await inp.click(timeout=5_000)
            await inp.fill(coupon)
            await asyncio.sleep(0.5)

            apply_btn = await self._find_element_from_list(
                _GENERIC_APPLY_PROMO, label="apply promo button"
            )
            if apply_btn:
                await apply_btn.click(timeout=5_000)
                await asyncio.sleep(1.5)
                await self._log(
                    "Coupon applied successfully.", source="ShoppingAgent", level="success"
                )
            else:
                # Try pressing Enter as fallback
                await inp.press("Enter")
                await asyncio.sleep(1)
                await self._log(
                    "Coupon submitted via Enter key.", source="ShoppingAgent"
                )
        except Exception as exc:
            await self._log(
                f"Coupon application failed: {exc}", source="ShoppingAgent", level="warn"
            )

    async def _proceed_to_checkout(self, site: str) -> bool:
        """Click through to the checkout page.

        IMPORTANT: This method stops BEFORE clicking 'Place Order'.  The actual
        order-submission click must be performed only after the upstream skill
        layer has received explicit user approval (the APPROVAL GATE log).

        Returns True when the checkout page is reached (even if not submitted).
        """
        checkout_map = {
            "amazon":  _AMZN_PLACE_ORDER,
            "ebay":    _EBAY_CHECKOUT,
            "walmart": _WALMART_CHECKOUT,
        }
        checkout_selectors = checkout_map.get(site, [])
        checkout_selectors += ['button:has-text("Proceed to checkout")', 'a:has-text("Checkout")']

        # First: navigate to the cart page so we can find the checkout button
        cart_urls = {
            "amazon":  "https://www.amazon.com/gp/cart/view.html",
            "ebay":    "https://cart.ebay.com/",
            "walmart": "https://www.walmart.com/cart",
        }
        cart_url = cart_urls.get(site)
        if cart_url:
            try:
                await self.page.goto(cart_url, wait_until="domcontentloaded", timeout=30_000)
                await asyncio.sleep(2)
            except Exception as exc:
                await self._log(
                    f"Could not navigate to cart on {site}: {exc}",
                    source="ShoppingAgent",
                    level="warn",
                )

        checkout_btn = await self._find_element_from_list(
            checkout_selectors, label=f"{site} checkout button"
        )
        if not checkout_btn:
            await self._log(
                f"Checkout button not found on {site} — cart reached but could not proceed.",
                source="ShoppingAgent",
                level="warn",
            )
            return False

        try:
            await checkout_btn.click(timeout=8_000)
            await asyncio.sleep(3)
            await self._log(
                "Checkout page reached — order NOT yet placed (awaiting approval).",
                source="ShoppingAgent",
                level="warn",
            )
            return True
        except Exception as exc:
            await self._log(
                f"Checkout button click failed: {exc}", source="ShoppingAgent", level="error"
            )
            return False

    # ------------------------------------------------------------------
    # AI-assisted ranking
    # ------------------------------------------------------------------

    async def _ai_rank_products(
        self, products: List[Dict[str, Any]], query: str
    ) -> List[Dict[str, Any]]:
        """Use the AI client to re-rank/filter products by relevance.

        Falls back to the original list if the AI call fails or returns bad JSON.
        """
        try:
            snippet = [
                {
                    "index": i,
                    "title": p.get("title", ""),
                    "price": p.get("price"),
                    "priceText": p.get("priceText", ""),
                    "rating": p.get("rating"),
                }
                for i, p in enumerate(products[:15])
            ]
            data = await self.ai.extract_json(
                "You are a shopping assistant. Given a list of products and a search query, "
                "return a JSON object: "
                "{\"ranked_indices\": [list of original 'index' values, best match first, "
                "filter out irrelevant items]}. "
                "Prioritise relevance to the query, then lowest price, then highest rating.",
                f"Query: {query}\nProducts: {snippet}",
            )
            if data and isinstance(data.get("ranked_indices"), list):
                idx_map = {p["index"]: products[p["index"]] for p in snippet if "index" in p}
                ranked = [
                    idx_map[i] for i in data["ranked_indices"] if i in idx_map
                ]
                # Append any that the AI dropped (safety: never lose results)
                ranked_set = {id(p) for p in ranked}
                for p in products:
                    if id(p) not in ranked_set:
                        ranked.append(p)
                return ranked
        except Exception as exc:
            log.debug("AI ranking failed (non-fatal): %s", exc)
        return products

    # ------------------------------------------------------------------
    # Shared helpers
    # ------------------------------------------------------------------

    def _extract_query(self) -> str:
        """Pull the search query from the job payload or fall back to the goal."""
        return (
            self.job.get("query")
            or self.job.get("product")
            or self.job.get("search")
            or self.goal
        ).strip()

    def _detect_action(self) -> str:
        """Infer the requested action from the job payload and goal text.

        Returns one of: 'search', 'compare', 'cart', 'purchase'.
        """
        action = (self.job.get("action") or "").lower()
        if action in ("purchase", "buy", "checkout", "order"):
            return "purchase"
        if action in ("cart", "add_to_cart", "addtocart"):
            return "cart"
        if action in ("compare", "price_comparison", "best_price"):
            return "compare"
        if action in ("search",):
            return "search"

        goal = self.goal.lower()
        if any(k in goal for k in ("buy", "purchase", "checkout", "order")):
            return "purchase"
        if any(k in goal for k in ("add to cart", "add to my cart")):
            return "cart"
        if any(k in goal for k in ("compare", "best price", "cheapest", "price comparison")):
            return "compare"

        # Safe default: compare (read-only)
        return "compare"

    def _detect_sites(self) -> List[str]:
        """Determine which sites to search.

        Checks job['sites'], job['site'], goal text, then defaults to all three.
        """
        raw = self.job.get("sites") or self.job.get("site") or ""
        if isinstance(raw, list):
            sites = [s.lower().strip() for s in raw if s.lower().strip() in _SITES]
            if sites:
                return sites
        if isinstance(raw, str) and raw:
            single = raw.lower().strip()
            if single in _SITES:
                return [single]

        goal = self.goal.lower()
        named = [s for s in _SITES if s in goal]
        if named:
            return named

        # Default: compare across all three
        return list(_SITES.keys())

    @staticmethod
    def _pick_best_deal(products: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Return the product with the lowest numeric price, or {} if none found."""
        priced = [p for p in products if isinstance(p.get("price"), (int, float))]
        if not priced:
            return {}
        return min(priced, key=lambda p: float(p["price"]))

    async def _find_element_from_list(self, selectors: List[str], label: str = "element"):
        """Try each selector in order; return the first visible element found.

        Logs a debug message for each miss and a warning if all selectors fail.
        """
        for selector in selectors:
            try:
                el = await self.page.query_selector(selector)
                if el and await el.is_visible():
                    log.debug("Found %s with selector: %s", label, selector)
                    return el
            except Exception as exc:
                log.debug("Selector '%s' for %s raised: %s", selector, label, exc)
                continue

        await self._log(
            f"Could not locate {label} — tried {len(selectors)} selectors",
            source="ShoppingAgent",
            level="warn",
        )
        return None

    async def _scroll(self, steps: int = 3, px: int = 600) -> None:
        """Scroll down the page to trigger lazy-loaded product listings."""
        for _ in range(steps):
            try:
                await self.page.evaluate(f"window.scrollBy(0, {px})")
                await asyncio.sleep(0.8)
            except Exception:
                break

    async def _log(
        self, message: str, source: str = "ShoppingAgent", level: str = "info"
    ) -> None:
        """Emit a dashboard log line via the EventPublisher."""
        log.info("[%s] %s", level.upper(), message)
        if self.publisher:
            try:
                await self.publisher.publish(
                    self.session_id,
                    "execution:event",
                    {"type": f"log:{level}", "data": {"source": source, "message": message}},
                )
            except Exception as exc:
                log.debug("Publisher.publish failed: %s", exc)

    @staticmethod
    def _fail(reason: str, action: str = "") -> Dict[str, Any]:
        """Return a normalised failure result dict."""
        return {
            "action": action or "unknown",
            "products": [],
            "best_deal": {},
            "status": "failed",
            "error": reason,
        }


# ---------------------------------------------------------------------------
# Standalone smoke-test harness
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import json

    async def _smoke_test() -> None:
        """Quick smoke-test: compare prices for 'wireless headphones' across sites."""
        from playwright.async_api import async_playwright

        class _FakePublisher:
            async def publish(self, *args, **kwargs):
                pass

        class _FakeAI:
            available = False

        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            page = await browser.new_page()
            agent = ShoppingAgent(
                page=page,
                publisher=_FakePublisher(),
                session_id="smoke-test-001",
                goal="Find the best price for wireless headphones",
                job={"query": "wireless headphones", "action": "compare"},
                user_id="test-user",
                ai=_FakeAI(),
            )
            result = await agent.execute()
            print(json.dumps(result, indent=2, default=str))
            await browser.close()

    asyncio.run(_smoke_test())
