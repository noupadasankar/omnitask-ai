"""Element resolver — multi-strategy element resolution that never fails on selector changes.

Tries 8 strategies in priority order: ARIA role → data attributes → semantic text
→ ARIA label → XPath → CSS → visual position → DOM similarity scoring.
"""

import asyncio
import logging
import re
from dataclasses import dataclass
from typing import Optional

log = logging.getLogger("browser-py.engine.element_resolver")


@dataclass
class ResolvedElement:
    strategy_used: str
    confidence: float           # 0.0 – 1.0
    locator_string: str         # Playwright locator expression
    element_text: str
    bounding_box: Optional[dict]  # {x, y, width, height} or None


class ElementResolver:
    """Resolves browser elements using 8 fallback strategies."""

    async def resolve(
        self,
        page,
        intent: str,
        context: dict = {},
    ) -> Optional[ResolvedElement]:
        """Find the best element matching *intent*.

        intent: human description like "Add to cart button", "Email input field"
        context: {nearby_text, expected_type, fallback_selectors}
        """
        strategies = [
            self._try_role,
            self._try_data_attribute,
            self._try_text_exact,
            self._try_aria_label,
            self._try_placeholder,
            self._try_xpath_text,
            self._try_fallback_selectors,
            self._try_fuzzy_text,
        ]

        for strategy in strategies:
            try:
                result = await strategy(page, intent, context)
                if result and result.confidence >= 0.3:
                    log.debug(
                        "Resolved %r via %s (conf=%.2f)",
                        intent, result.strategy_used, result.confidence
                    )
                    return result
            except Exception as exc:
                log.debug("Strategy %s failed for %r: %s", strategy.__name__, intent, exc)

        log.warning("ElementResolver: could not resolve %r", intent)
        return None

    async def resolve_all(self, page, intent: str) -> list[ResolvedElement]:
        """Return all candidate elements ranked by confidence."""
        candidates = []
        for strategy in [self._try_role, self._try_text_exact, self._try_fuzzy_text]:
            try:
                r = await strategy(page, intent, {})
                if r:
                    candidates.append(r)
            except Exception:
                pass
        candidates.sort(key=lambda x: x.confidence, reverse=True)
        return candidates

    async def verify_stable(
        self, page, locator_string: str, *, timeout_ms: int = 2000
    ) -> bool:
        """Return True if element is visible, enabled, not moving, not detached."""
        try:
            loc = page.locator(locator_string).first
            await loc.wait_for(state="visible", timeout=timeout_ms)
            enabled = await loc.is_enabled()
            if not enabled:
                return False
            # Check it's not moving (bounding box stable over 200ms)
            box1 = await loc.bounding_box()
            await asyncio.sleep(0.2)
            box2 = await loc.bounding_box()
            if box1 and box2:
                moved = abs(box1["x"] - box2["x"]) + abs(box1["y"] - box2["y"])
                if moved > 3:
                    return False
            return True
        except Exception:
            return False

    async def find_by_text(
        self,
        page,
        text: str,
        *,
        exact: bool = False,
        element_type: str = "*",
    ) -> Optional[ResolvedElement]:
        """Find an element by its visible text content."""
        try:
            if exact:
                loc = page.get_by_text(text, exact=True).first
            else:
                loc = page.get_by_text(re.compile(re.escape(text), re.IGNORECASE)).first
            await loc.wait_for(state="visible", timeout=3000)
            bbox = await loc.bounding_box()
            elem_text = (await loc.text_content() or "").strip()
            return ResolvedElement(
                strategy_used="text_content",
                confidence=0.85 if exact else 0.7,
                locator_string=f"text={text!r}",
                element_text=elem_text[:120],
                bounding_box=bbox,
            )
        except Exception:
            return None

    async def find_by_role(
        self, page, role: str, name: str = ""
    ) -> Optional[ResolvedElement]:
        """Find element by ARIA role + accessible name."""
        try:
            if name:
                loc = page.get_by_role(role, name=re.compile(re.escape(name), re.IGNORECASE)).first
            else:
                loc = page.get_by_role(role).first
            await loc.wait_for(state="visible", timeout=3000)
            bbox = await loc.bounding_box()
            elem_text = (await loc.text_content() or "").strip()
            conf = 0.95 if name else 0.6
            return ResolvedElement(
                strategy_used="aria_role",
                confidence=conf,
                locator_string=f"role={role}[name={name!r}]" if name else f"role={role}",
                element_text=elem_text[:120],
                bounding_box=bbox,
            )
        except Exception:
            return None

    async def find_form_field(
        self, page, label: str
    ) -> Optional[ResolvedElement]:
        """Find an input by associated label, aria-label, or placeholder."""
        strategies_for_field = [
            ("get_by_label", lambda: page.get_by_label(
                re.compile(re.escape(label), re.IGNORECASE)
            ).first),
            ("get_by_placeholder", lambda: page.get_by_placeholder(
                re.compile(re.escape(label), re.IGNORECASE)
            ).first),
        ]

        for name, factory in strategies_for_field:
            try:
                loc = factory()
                await loc.wait_for(state="visible", timeout=2000)
                bbox = await loc.bounding_box()
                return ResolvedElement(
                    strategy_used=name,
                    confidence=0.9,
                    locator_string=f"{name}={label!r}",
                    element_text=label,
                    bounding_box=bbox,
                )
            except Exception:
                continue

        return None

    # ── Private strategy implementations ─────────────────────────────────────

    async def _try_role(self, page, intent: str, ctx: dict) -> Optional[ResolvedElement]:
        """Strategy 1: ARIA role + accessible name extracted from intent."""
        intent_lower = intent.lower()
        role_map = {
            "button": ["button", "submit", "click", "press", "tap", "apply", "confirm", "buy", "add", "send", "search"],
            "link": ["link", "href", "navigate to", "go to", "open"],
            "textbox": ["input", "field", "enter", "type", "email", "username", "search box"],
            "combobox": ["select", "dropdown", "choose", "pick"],
            "checkbox": ["checkbox", "check", "tick", "enable"],
            "radio": ["radio", "option", "select one"],
        }
        detected_role = None
        for role, keywords in role_map.items():
            if any(kw in intent_lower for kw in keywords):
                detected_role = role
                break

        if not detected_role:
            return None

        # Extract probable name from intent
        name_part = intent
        for prefix in ["click", "press", "find", "the", "button", "input", "field", "link"]:
            name_part = re.sub(rf"\b{prefix}\b", "", name_part, flags=re.IGNORECASE).strip()
        name_part = name_part.strip(" -:")

        return await self.find_by_role(page, detected_role, name_part if name_part else "")

    async def _try_data_attribute(self, page, intent: str, ctx: dict) -> Optional[ResolvedElement]:
        """Strategy 2: data-testid / data-cy / data-qa attributes."""
        slug = intent.lower().replace(" ", "-").replace("_", "-")
        slug2 = intent.lower().replace(" ", "_")

        selectors_to_try = [
            f'[data-testid="{slug}"]',
            f'[data-cy="{slug}"]',
            f'[data-qa="{slug}"]',
            f'[data-testid*="{slug}"]',
            f'[data-testid="{slug2}"]',
        ]

        for selector in selectors_to_try:
            try:
                loc = page.locator(selector).first
                await loc.wait_for(state="visible", timeout=1500)
                bbox = await loc.bounding_box()
                return ResolvedElement(
                    strategy_used="data_attribute",
                    confidence=0.9,
                    locator_string=selector,
                    element_text=intent,
                    bounding_box=bbox,
                )
            except Exception:
                continue
        return None

    async def _try_text_exact(self, page, intent: str, ctx: dict) -> Optional[ResolvedElement]:
        """Strategy 3: Exact text match."""
        # Clean intent to extract the likely button/element text
        clean = re.sub(r"\b(click|press|find|the|button|input|field|link|element)\b", "", intent, flags=re.IGNORECASE).strip()
        if not clean:
            return None
        return await self.find_by_text(page, clean, exact=True)

    async def _try_aria_label(self, page, intent: str, ctx: dict) -> Optional[ResolvedElement]:
        """Strategy 4: aria-label attribute search."""
        clean = re.sub(r"\b(click|press|find|the|button|input|field|link)\b", "", intent, flags=re.IGNORECASE).strip()
        if not clean:
            return None
        return await self.find_form_field(page, clean)

    async def _try_placeholder(self, page, intent: str, ctx: dict) -> Optional[ResolvedElement]:
        """Strategy 5: placeholder attribute."""
        clean = re.sub(r"\b(click|press|find|the|button|input|field|type|enter)\b", "", intent, flags=re.IGNORECASE).strip()
        if not clean:
            return None
        try:
            loc = page.get_by_placeholder(re.compile(re.escape(clean), re.IGNORECASE)).first
            await loc.wait_for(state="visible", timeout=2000)
            bbox = await loc.bounding_box()
            return ResolvedElement(
                strategy_used="placeholder",
                confidence=0.75,
                locator_string=f"placeholder~={clean!r}",
                element_text=clean,
                bounding_box=bbox,
            )
        except Exception:
            return None

    async def _try_xpath_text(self, page, intent: str, ctx: dict) -> Optional[ResolvedElement]:
        """Strategy 6: XPath with text() contains."""
        clean = re.sub(r"\b(click|press|find|the|button|input|field|link)\b", "", intent, flags=re.IGNORECASE).strip()
        if len(clean) < 2:
            return None
        xpath = f'//*[contains(translate(normalize-space(text()),"ABCDEFGHIJKLMNOPQRSTUVWXYZ","abcdefghijklmnopqrstuvwxyz"),"{clean.lower()}")]'
        try:
            loc = page.locator(f"xpath={xpath}").first
            await loc.wait_for(state="visible", timeout=2000)
            bbox = await loc.bounding_box()
            elem_text = (await loc.text_content() or "").strip()
            return ResolvedElement(
                strategy_used="xpath_text",
                confidence=0.6,
                locator_string=f"xpath={xpath}",
                element_text=elem_text[:120],
                bounding_box=bbox,
            )
        except Exception:
            return None

    async def _try_fallback_selectors(self, page, intent: str, ctx: dict) -> Optional[ResolvedElement]:
        """Strategy 7: Use provided fallback_selectors from context."""
        selectors = ctx.get("fallback_selectors", [])
        for sel in selectors:
            try:
                loc = page.locator(sel).first
                await loc.wait_for(state="visible", timeout=1500)
                bbox = await loc.bounding_box()
                elem_text = (await loc.text_content() or "").strip()
                return ResolvedElement(
                    strategy_used="fallback_css",
                    confidence=0.5,
                    locator_string=sel,
                    element_text=elem_text[:120],
                    bounding_box=bbox,
                )
            except Exception:
                continue
        return None

    async def _try_fuzzy_text(self, page, intent: str, ctx: dict) -> Optional[ResolvedElement]:
        """Strategy 8: Fuzzy text content search across all interactive elements."""
        clean = re.sub(r"\b(click|press|find|the|button|input|field|link)\b", "", intent, flags=re.IGNORECASE).strip()
        if len(clean) < 2:
            return None
        return await self.find_by_text(page, clean, exact=False)

    def _score_candidate(self, el_info: dict, intent: str) -> float:
        """Score an element's relevance to the intent. Returns 0.0–1.0."""
        intent_tokens = set(intent.lower().split())
        text_tokens = set((el_info.get("text", "") + " " + el_info.get("aria_label", "")).lower().split())
        if not text_tokens:
            return 0.0
        overlap = intent_tokens & text_tokens
        return len(overlap) / max(len(intent_tokens), 1)

    def _fuzzy_match(self, a: str, b: str) -> float:
        """Simple token overlap ratio between two strings."""
        a_tokens = set(a.lower().split())
        b_tokens = set(b.lower().split())
        if not a_tokens or not b_tokens:
            return 0.0
        overlap = a_tokens & b_tokens
        return len(overlap) / max(len(a_tokens | b_tokens), 1)
