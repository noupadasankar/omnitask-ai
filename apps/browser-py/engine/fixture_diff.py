"""Fixture diff — compares two FixtureBundles to detect regressions.

Produces a FixtureDiffResult with a scored regression_score (0.0–1.0)
and a list of regression_signals explaining what changed. Designed for
use in nightly regression pipelines and post-deploy validation.
"""

import hashlib
import logging
from dataclasses import dataclass

log = logging.getLogger("browser-py.engine.fixture_diff")

_AUTH_COOKIE_KEYWORDS = {"sessionid", "token", "auth", "jwt", "access_token", "refresh_token"}


@dataclass
class DomStructureDiff:
    element_count_a: int
    element_count_b: int
    element_count_delta: int
    dom_hash_match: bool
    structural_change_score: float   # 0.0 = identical, 1.0 = completely different


@dataclass
class StorageDiff:
    cookies_added: list
    cookies_removed: list
    local_storage_added: list
    local_storage_removed: list
    local_storage_changed: list


@dataclass
class FixtureDiffResult:
    fixture_a_id: str
    fixture_b_id: str
    label: str
    url_changed: bool
    url_a: str
    url_b: str
    dom: DomStructureDiff
    screenshot_changed: bool
    storage: StorageDiff
    accessibility_changed: bool
    is_regression: bool
    regression_score: float          # 0.0 = clean, 1.0 = severe
    regression_signals: list

    def summary(self) -> dict:
        return {
            "fixture_a": self.fixture_a_id,
            "fixture_b": self.fixture_b_id,
            "label": self.label,
            "is_regression": self.is_regression,
            "regression_score": round(self.regression_score, 3),
            "url_changed": self.url_changed,
            "dom_hash_match": self.dom.dom_hash_match,
            "element_count_delta": self.dom.element_count_delta,
            "screenshot_changed": self.screenshot_changed,
            "accessibility_changed": self.accessibility_changed,
            "signals": self.regression_signals,
        }


class FixtureDiffer:
    """Compares two FixtureBundles and scores regression severity."""

    def compare(self, bundle_a, bundle_b) -> FixtureDiffResult:
        dom_diff = self._diff_dom(bundle_a, bundle_b)
        storage_diff = self._diff_storage(bundle_a, bundle_b)
        screenshot_changed = self._screenshot_changed(bundle_a, bundle_b)
        accessibility_changed = self._accessibility_changed(bundle_a, bundle_b)
        url_changed = bundle_a.url != bundle_b.url

        regression_score, signals = self._score_regression(
            url_changed, dom_diff, screenshot_changed, accessibility_changed, storage_diff
        )

        return FixtureDiffResult(
            fixture_a_id=bundle_a.fixture_id,
            fixture_b_id=bundle_b.fixture_id,
            label=bundle_b.label,
            url_changed=url_changed,
            url_a=bundle_a.url,
            url_b=bundle_b.url,
            dom=dom_diff,
            screenshot_changed=screenshot_changed,
            storage=storage_diff,
            accessibility_changed=accessibility_changed,
            is_regression=regression_score >= 0.4,
            regression_score=regression_score,
            regression_signals=signals,
        )

    def _diff_dom(self, a, b) -> DomStructureDiff:
        dom_hash_match = a.dom_hash == b.dom_hash
        count_delta = b.element_count - a.element_count
        if dom_hash_match:
            structural_score = 0.0
        else:
            max_count = max(a.element_count, b.element_count, 1)
            structural_score = min(1.0, abs(count_delta) / max_count)
        return DomStructureDiff(
            element_count_a=a.element_count,
            element_count_b=b.element_count,
            element_count_delta=count_delta,
            dom_hash_match=dom_hash_match,
            structural_change_score=round(structural_score, 3),
        )

    def _diff_storage(self, a, b) -> StorageDiff:
        a_cookies = {c["name"] for c in a.storage.get("cookies", [])}
        b_cookies = {c["name"] for c in b.storage.get("cookies", [])}
        a_local = set(a.storage.get("local_storage", {}).keys())
        b_local = set(b.storage.get("local_storage", {}).keys())

        changed = [
            k for k in a_local & b_local
            if a.storage.get("local_storage", {}).get(k) != b.storage.get("local_storage", {}).get(k)
        ]

        return StorageDiff(
            cookies_added=list(b_cookies - a_cookies),
            cookies_removed=list(a_cookies - b_cookies),
            local_storage_added=list(b_local - a_local),
            local_storage_removed=list(a_local - b_local),
            local_storage_changed=changed,
        )

    def _screenshot_changed(self, a, b) -> bool:
        if not a.screenshot_hash or not b.screenshot_hash:
            return False
        return a.screenshot_hash != b.screenshot_hash

    def _accessibility_changed(self, a, b) -> bool:
        h_a = hashlib.md5(str(a.accessibility_tree).encode()).hexdigest()
        h_b = hashlib.md5(str(b.accessibility_tree).encode()).hexdigest()
        return h_a != h_b

    def _score_regression(
        self,
        url_changed: bool,
        dom: DomStructureDiff,
        screenshot_changed: bool,
        accessibility_changed: bool,
        storage: StorageDiff,
    ) -> tuple:
        score = 0.0
        signals = []

        if url_changed:
            score += 0.5
            signals.append("url_changed")

        if not dom.dom_hash_match:
            weight = dom.structural_change_score * 0.4
            score += weight
            if dom.structural_change_score > 0.2:
                signals.append(f"dom_structural_change ({dom.structural_change_score:.2f})")

        if screenshot_changed and not dom.dom_hash_match:
            score += 0.1
            signals.append("screenshot_changed")

        if accessibility_changed:
            score += 0.1
            signals.append("accessibility_changed")

        lost_auth = [
            c for c in storage.cookies_removed
            if any(kw in c.lower() for kw in _AUTH_COOKIE_KEYWORDS)
        ]
        if lost_auth:
            score += 0.3
            signals.append(f"auth_cookies_lost: {lost_auth}")

        return min(1.0, round(score, 3)), signals
