"""Post-action verifier — confirms every browser action actually worked.

Checks navigation success, form submission, price/cart state, login,
booking confirmation, before/after comparison, element visibility,
error absence, data display, workflow alignment, and comprehensive combined verification.
"""

import asyncio
import hashlib
import logging
import re
from dataclasses import dataclass
from typing import Optional

log = logging.getLogger("browser-py.engine.verifier")


@dataclass
class VerificationResult:
    success: bool
    confidence: float           # 0.0 – 1.0
    verification_type: str
    expected: str
    actual: str
    details: dict
    recommended_action: str     # "continue" | "retry" | "replan" | "escalate"


@dataclass
class ComprehensiveVerification:
    overall_success: bool
    confidence: float
    checks_passed: int
    checks_total: int
    results: list               # list of VerificationResult
    failure_reasons: list
    recommended_action: str


class Verifier:
    """Verifies browser action outcomes against expected states."""

    async def verify_navigation(
        self,
        page,
        expected_url_fragment: str,
        *,
        expected_title_fragment: str = "",
    ) -> VerificationResult:
        """Verify a navigation step reached the expected page."""
        try:
            actual_url = page.url
            actual_title = await page.title()

            url_ok = expected_url_fragment.lower() in actual_url.lower()
            title_ok = (
                not expected_title_fragment
                or expected_title_fragment.lower() in actual_title.lower()
            )
            error_detected = await self._check_error_page(page)

            success = url_ok and title_ok and not error_detected
            confidence = 0.95 if success else (0.5 if url_ok else 0.1)

            return VerificationResult(
                success=success,
                confidence=confidence,
                verification_type="navigation",
                expected=f"URL contains '{expected_url_fragment}'",
                actual=f"URL: {actual_url}, Title: {actual_title}",
                details={"url_ok": url_ok, "title_ok": title_ok, "error_detected": error_detected},
                recommended_action="continue" if success else "retry",
            )
        except Exception as exc:
            log.warning("verify_navigation failed: %s", exc)
            return self._error_result("navigation", str(exc))

    async def verify_form_submission(
        self, page, *, before_url: str = "", before_hash: str = ""
    ) -> VerificationResult:
        """Verify a form was actually submitted."""
        try:
            after_url = page.url
            after_hash = await self._content_hash(page)

            url_changed = after_url != before_url and bool(before_url)
            content_changed = after_hash != before_hash and bool(before_hash)

            success_msgs = await page.evaluate("""() => {
                const patterns = [
                    /thank you/i, /success/i, /submitted/i, /confirmed/i,
                    /application received/i, /we.{0,10}received/i,
                    /applied/i, /sent/i, /order placed/i,
                ];
                const text = document.body.innerText || '';
                return patterns.some(p => p.test(text));
            }""")

            error_visible = bool(await self._get_visible_errors(page))

            success = (url_changed or content_changed or success_msgs) and not error_visible
            confidence = 0.9 if success and success_msgs else (0.7 if success else 0.2)

            return VerificationResult(
                success=success,
                confidence=confidence,
                verification_type="form_submission",
                expected="Form submitted — URL or content should change, success message visible",
                actual=f"URL changed: {url_changed}, Content changed: {content_changed}, Success msg: {success_msgs}",
                details={
                    "before_url": before_url,
                    "after_url": after_url,
                    "url_changed": url_changed,
                    "success_message_found": success_msgs,
                    "error_visible": error_visible,
                },
                recommended_action="continue" if success else "retry",
            )
        except Exception as exc:
            return self._error_result("form_submission", str(exc))

    async def verify_login(self, page, *, expected_domain: str = "") -> VerificationResult:
        """Verify a login succeeded by checking for auth indicators."""
        try:
            auth_signals = await page.evaluate("""() => {
                const logged_in = [
                    '[class*="user-menu"]', '[class*="account"]', '[class*="avatar"]',
                    '[aria-label*="account"]', '[data-testid*="user"]',
                    '.user-profile', '[class*="signed-in"]',
                ].some(sel => !!document.querySelector(sel));

                const login_form_gone = !document.querySelector('input[type="password"]');
                const error_msg = Array.from(document.querySelectorAll('[class*="error"], [role="alert"]'))
                    .find(el => /invalid|incorrect|wrong/i.test(el.textContent));

                return {logged_in, login_form_gone, has_error: !!error_msg};
            }""")

            success = (
                auth_signals.get("logged_in") or auth_signals.get("login_form_gone")
            ) and not auth_signals.get("has_error")

            return VerificationResult(
                success=success,
                confidence=0.85 if success else 0.15,
                verification_type="login",
                expected="Authenticated state — user menu visible, no login form",
                actual=str(auth_signals),
                details=auth_signals,
                recommended_action="continue" if success else "replan",
            )
        except Exception as exc:
            return self._error_result("login", str(exc))

    async def verify_price(
        self, page, expected_price: float, *, tolerance_pct: float = 0.05
    ) -> VerificationResult:
        """Verify the page shows the expected price (within tolerance)."""
        try:
            prices = await self._extract_all_prices(page)
            tolerance = expected_price * tolerance_pct
            matching = [p for p in prices if abs(p - expected_price) <= tolerance]

            success = len(matching) > 0
            return VerificationResult(
                success=success,
                confidence=0.9 if success else 0.2,
                verification_type="price",
                expected=f"Price {expected_price} (±{tolerance_pct*100}%)",
                actual=f"Found prices: {prices[:5]}",
                details={"expected": expected_price, "found": prices[:5], "matching": matching},
                recommended_action="continue" if success else "escalate",
            )
        except Exception as exc:
            return self._error_result("price", str(exc))

    async def verify_cart_item(self, page, item_name: str) -> VerificationResult:
        """Verify an item was added to a shopping cart."""
        try:
            cart_text = await page.evaluate("""() => {
                const cart = document.querySelector(
                    '[class*="cart"], [class*="basket"], [aria-label*="cart"], [data-testid*="cart"]'
                );
                return cart ? cart.textContent : document.body.innerText;
            }""")

            item_in_cart = item_name.lower() in (cart_text or "").lower()
            cart_count = await page.evaluate("""() => {
                const badge = document.querySelector('[class*="cart-count"], [class*="cart-badge"], [aria-label*="cart item"]');
                if (badge) return parseInt(badge.textContent) || 0;
                return null;
            }""")

            success = item_in_cart
            return VerificationResult(
                success=success,
                confidence=0.85 if success else 0.3,
                verification_type="cart",
                expected=f"'{item_name}' in cart",
                actual=f"item_found={item_in_cart}, cart_count={cart_count}",
                details={"item_name": item_name, "in_cart": item_in_cart, "cart_count": cart_count},
                recommended_action="continue" if success else "retry",
            )
        except Exception as exc:
            return self._error_result("cart", str(exc))

    async def verify_booking(self, page) -> VerificationResult:
        """Verify a booking/reservation confirmation page."""
        try:
            result = await page.evaluate("""() => {
                const text = (document.body.innerText || '').toLowerCase();
                const confirmation_patterns = [
                    'booking confirmed', 'reservation confirmed', 'confirmation number',
                    'booking reference', 'reservation number', 'confirmation code',
                    'your booking', 'successfully booked', 'your reservation',
                ];
                const found = confirmation_patterns.find(p => text.includes(p));
                const numMatch = text.match(/(?:confirmation|booking|reference|reservation)[\\s#:\\-]*([a-z0-9]{4,})/i);
                return {confirmed: !!found, pattern: found, ref_number: numMatch ? numMatch[1] : null};
            }""")

            success = result.get("confirmed", False)
            return VerificationResult(
                success=success,
                confidence=0.9 if success else 0.1,
                verification_type="booking",
                expected="Booking confirmation message or number",
                actual=f"pattern={result.get('pattern')}, ref={result.get('ref_number')}",
                details=result,
                recommended_action="continue" if success else "escalate",
            )
        except Exception as exc:
            return self._error_result("booking", str(exc))

    async def verify_before_after(
        self,
        page,
        before_summary: dict,
        *,
        expected_change: str = "any",
    ) -> VerificationResult:
        """Compare current page state against a saved before-state."""
        try:
            after_url = page.url
            after_hash = await self._content_hash(page)

            url_changed = after_url != before_summary.get("url", after_url)
            content_changed = after_hash != before_summary.get("content_hash", after_hash)

            if expected_change == "url":
                success = url_changed
            elif expected_change == "content":
                success = content_changed
            elif expected_change == "form_gone":
                forms = await page.locator("form").count()
                success = forms < before_summary.get("form_count", forms + 1)
            else:
                success = url_changed or content_changed

            return VerificationResult(
                success=success,
                confidence=0.8 if success else 0.3,
                verification_type="before_after",
                expected=f"Page changed ({expected_change})",
                actual=f"URL changed: {url_changed}, content changed: {content_changed}",
                details={"url_changed": url_changed, "content_changed": content_changed},
                recommended_action="continue" if success else "retry",
            )
        except Exception as exc:
            return self._error_result("before_after", str(exc))

    async def take_before_snapshot(self, page) -> dict:
        """Take a snapshot of current page state for later comparison."""
        url = ""
        try:
            url = page.url
        except Exception:
            pass
        content_hash = await self._content_hash(page)
        form_count = 0
        try:
            form_count = await page.locator("form").count()
        except Exception:
            pass
        return {"url": url, "content_hash": content_hash, "form_count": form_count}

    async def verify_element_visible(self, page, selector: str) -> VerificationResult:
        """Verify a specific element is visible on the page."""
        try:
            el = page.locator(selector).first
            is_visible = await el.is_visible(timeout=3000)
            return VerificationResult(
                success=is_visible,
                confidence=0.95 if is_visible else 0.05,
                verification_type="element_visible",
                expected=f"Element '{selector}' is visible",
                actual=f"visible={is_visible}",
                details={"selector": selector, "visible": is_visible},
                recommended_action="continue" if is_visible else "retry",
            )
        except Exception as exc:
            return self._error_result("element_visible", str(exc))

    async def verify_no_errors(self, page) -> VerificationResult:
        """Verify no error messages are visible on the page."""
        try:
            errors = await self._get_visible_errors(page)
            success = len(errors) == 0
            return VerificationResult(
                success=success,
                confidence=0.9 if success else 0.1,
                verification_type="no_errors",
                expected="No visible error messages",
                actual=f"{len(errors)} errors found: {errors[:3]}",
                details={"error_count": len(errors), "errors": errors[:5]},
                recommended_action="continue" if success else "replan",
            )
        except Exception as exc:
            return self._error_result("no_errors", str(exc))

    async def verify_data_displayed(self, page, expected_data: dict) -> VerificationResult:
        """Verify specific data values are displayed on the page."""
        try:
            body_text = (await page.evaluate("() => document.body.innerText || ''")).lower()
            found = {}
            missing = {}
            for key, value in expected_data.items():
                if str(value).lower() in body_text:
                    found[key] = value
                else:
                    missing[key] = value

            success = len(missing) == 0
            confidence = len(found) / max(len(expected_data), 1)
            return VerificationResult(
                success=success,
                confidence=confidence,
                verification_type="data_displayed",
                expected=f"All {len(expected_data)} data items visible",
                actual=f"{len(found)} found, {len(missing)} missing",
                details={"found": found, "missing": missing},
                recommended_action="continue" if success else "retry",
            )
        except Exception as exc:
            return self._error_result("data_displayed", str(exc))

    async def verify_workflow_alignment(
        self, page, expected_stage: str
    ) -> VerificationResult:
        """Verify the page matches the expected workflow stage."""
        try:
            url = page.url.lower()
            title = (await page.title()).lower()
            body = (await page.evaluate("() => (document.body.innerText || '').toLowerCase()") or "")
            stage = expected_stage.lower()

            in_url = stage in url
            in_title = stage in title
            in_body = stage in body

            success = in_url or in_title or in_body
            return VerificationResult(
                success=success,
                confidence=0.85 if success else 0.2,
                verification_type="workflow_alignment",
                expected=f"Page is in stage '{expected_stage}'",
                actual=f"in_url={in_url}, in_title={in_title}, in_body={in_body}",
                details={"stage": expected_stage, "in_url": in_url, "in_title": in_title, "in_body": in_body},
                recommended_action="continue" if success else "replan",
            )
        except Exception as exc:
            return self._error_result("workflow_alignment", str(exc))

    async def verify_action_complete(
        self, page, action_type: str, context: dict = {}
    ) -> VerificationResult:
        """Dispatch to the right verifier by action type."""
        dispatch = {
            "navigate": lambda: self.verify_navigation(page, context.get("expected_url", "")),
            "submit": lambda: self.verify_form_submission(page,
                before_url=context.get("before_url", ""),
                before_hash=context.get("before_hash", "")),
            "login": lambda: self.verify_login(page),
            "add_to_cart": lambda: self.verify_cart_item(page, context.get("item_name", "")),
            "booking": lambda: self.verify_booking(page),
            "no_errors": lambda: self.verify_no_errors(page),
        }
        fn = dispatch.get(action_type)
        if fn:
            return await fn()
        return await self.verify_before_after(page, context)

    async def comprehensive_verify(
        self,
        page,
        checks: list,
    ) -> ComprehensiveVerification:
        """Run multiple checks in parallel and return a combined result.

        checks: list of dicts, each with 'type' and optional kwargs.
        E.g. [{'type': 'no_errors'}, {'type': 'element_visible', 'selector': '#confirm'}]
        """
        coros = []
        for check in checks:
            ctype = check.get("type", "no_errors")
            if ctype == "no_errors":
                coros.append(self.verify_no_errors(page))
            elif ctype == "element_visible":
                coros.append(self.verify_element_visible(page, check.get("selector", "body")))
            elif ctype == "navigation":
                coros.append(self.verify_navigation(page, check.get("expected_url", "")))
            elif ctype == "data_displayed":
                coros.append(self.verify_data_displayed(page, check.get("expected_data", {})))
            elif ctype == "form_submission":
                coros.append(self.verify_form_submission(page,
                    before_url=check.get("before_url", ""),
                    before_hash=check.get("before_hash", "")))
            else:
                coros.append(self.verify_no_errors(page))

        results = list(await asyncio.gather(*coros, return_exceptions=False))

        passed = [r for r in results if isinstance(r, VerificationResult) and r.success]
        failed = [r for r in results if isinstance(r, VerificationResult) and not r.success]
        failure_reasons = [f"{r.verification_type}: {r.actual}" for r in failed]

        overall = len(failed) == 0
        avg_confidence = (
            sum(r.confidence for r in results if isinstance(r, VerificationResult))
            / max(len(results), 1)
        )

        if overall:
            action = "continue"
        elif len(passed) / max(len(results), 1) >= 0.7:
            action = "retry"
        else:
            action = "replan"

        return ComprehensiveVerification(
            overall_success=overall,
            confidence=round(avg_confidence, 3),
            checks_passed=len(passed),
            checks_total=len(results),
            results=results,
            failure_reasons=failure_reasons,
            recommended_action=action,
        )

    # ── Private helpers ───────────────────────────────────────────────────────

    async def _check_error_page(self, page) -> bool:
        try:
            return await page.evaluate("""() => {
                const h1 = document.querySelector('h1');
                const txt = h1 ? h1.textContent : '';
                return /404|not found|error|forbidden|503/i.test(txt) ||
                       /404|not found|error|forbidden/i.test(document.title);
            }""")
        except Exception:
            return False

    async def _get_visible_errors(self, page) -> list[str]:
        try:
            return await page.evaluate("""() => {
                return Array.from(document.querySelectorAll('[class*="error"], [role="alert"]'))
                    .map(el => el.textContent.trim())
                    .filter(t => t.length > 2 && t.length < 200);
            }""") or []
        except Exception:
            return []

    async def _extract_all_prices(self, page) -> list[float]:
        try:
            text = await page.evaluate("() => document.body.innerText || ''")
            matches = re.findall(r"[\d,]+(?:\.\d{1,2})?", text or "")
            prices = []
            for m in matches:
                try:
                    val = float(m.replace(",", ""))
                    if 0.01 <= val <= 1_000_000:
                        prices.append(val)
                except ValueError:
                    pass
            return prices[:20]
        except Exception:
            return []

    async def _content_hash(self, page) -> str:
        try:
            text = await page.evaluate("() => document.body.innerText || ''")
            return hashlib.md5((text or "").encode()).hexdigest()[:12]
        except Exception:
            return "unknown"

    def _error_result(self, vtype: str, error: str) -> VerificationResult:
        return VerificationResult(
            success=False,
            confidence=0.0,
            verification_type=vtype,
            expected="",
            actual="",
            details={"error": error},
            recommended_action="retry",
        )
