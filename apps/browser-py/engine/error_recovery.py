"""Universal error recovery — detects and recovers from every browser error class.

11 error categories: NETWORK, TIMEOUT, AUTHENTICATION, CAPTCHA, DOM_CHANGED,
VALIDATION, PERMISSIONS, BROWSER_CRASH, API_FAILURE, SERVER_ERROR, CLIENT_JS_ERROR.
"""

import asyncio
import logging
import random
from dataclasses import dataclass
from enum import Enum
from typing import Optional, Callable, Any

log = logging.getLogger("browser-py.engine.error_recovery")

_RATE_LIMIT_TEXTS = [
    "too many requests", "rate limit", "slow down", "429", "you've been blocked",
    "unusual activity", "please wait", "try again later", "access denied",
]

_CAPTCHA_TEXTS = [
    "are you a robot", "captcha", "recaptcha", "i'm not a robot",
    "verify you're human", "security check", "prove you're human",
    "hcaptcha", "cloudflare", "bot protection",
]

_AUTH_TEXTS = [
    "log in to continue", "please sign in", "session expired",
    "unauthorized", "401", "you must be logged in",
]

_VALIDATION_TEXTS = [
    "please fill", "required field", "invalid email", "field is required",
    "please enter", "must be", "minimum", "maximum",
]

_NETWORK_ERRORS = ["ERR_", "net::", "ETIMEDOUT", "ENOTFOUND", "ECONNREFUSED"]
_API_ERROR_TEXTS = ["api error", "service unavailable", "bad gateway", "502", "503"]
_SERVER_ERROR_TEXTS = ["500", "internal server error", "server error", "server-side error"]
_CLIENT_JS_TEXTS = ["uncaught", "typeerror", "cannot read", "undefined is not"]


class ErrorCategory(str, Enum):
    NETWORK = "network"
    TIMEOUT = "timeout"
    AUTHENTICATION = "authentication"
    CAPTCHA = "captcha"
    DOM_CHANGED = "dom_changed"
    VALIDATION = "validation"
    PERMISSIONS = "permissions"
    BROWSER_CRASH = "browser_crash"
    API_FAILURE = "api_failure"
    SERVER_ERROR = "server_error"
    CLIENT_JS_ERROR = "client_js_error"
    UNKNOWN = "unknown"


_RECOVERY_STRATEGIES = {
    ErrorCategory.NETWORK: ["wait_and_retry", "page_reload", "escalate"],
    ErrorCategory.TIMEOUT: ["wait_and_retry", "navigate_back", "escalate"],
    ErrorCategory.AUTHENTICATION: ["check_vault", "navigate_to_login", "escalate"],
    ErrorCategory.CAPTCHA: ["escalate_captcha"],
    ErrorCategory.DOM_CHANGED: ["requeries_element", "scroll_to_element", "alternate_selector"],
    ErrorCategory.VALIDATION: ["highlight_errors", "scroll_to_errors", "escalate"],
    ErrorCategory.PERMISSIONS: ["escalate"],
    ErrorCategory.BROWSER_CRASH: ["crash_reload", "browser_restart", "escalate"],
    ErrorCategory.API_FAILURE: ["wait_and_retry", "alternate_endpoint", "escalate"],
    ErrorCategory.SERVER_ERROR: ["wait_and_retry", "page_reload", "escalate"],
    ErrorCategory.CLIENT_JS_ERROR: ["page_reload", "alternate_navigation", "escalate"],
    ErrorCategory.UNKNOWN: ["escape_and_retry", "page_reload", "escalate"],
}


@dataclass
class RecoveryResult:
    success: bool
    strategy_used: str
    attempts: int
    error_type: str
    error_category: str
    escalate_to_user: bool
    reason: str


class ErrorRecovery:
    """Detects and recovers from browser automation errors."""

    def __init__(self, max_attempts: int = 2):
        self.max_attempts = max_attempts

    async def handle(
        self,
        page,
        error: Exception,
        *,
        retry_fn: Optional[Callable] = None,
        context: dict = {},
    ) -> RecoveryResult:
        """Analyze the error and run the appropriate recovery pipeline."""
        category = await self.classify_error_category(page, error)
        log.info("ErrorRecovery: category=%s (error=%s)", category, type(error).__name__)

        handlers = {
            ErrorCategory.NETWORK: self._recover_network,
            ErrorCategory.TIMEOUT: self._recover_timeout,
            ErrorCategory.AUTHENTICATION: self._recover_authentication,
            ErrorCategory.CAPTCHA: self._recover_captcha,
            ErrorCategory.DOM_CHANGED: self._recover_stale_element,
            ErrorCategory.VALIDATION: self._recover_validation,
            ErrorCategory.PERMISSIONS: self._recover_permissions,
            ErrorCategory.BROWSER_CRASH: self._recover_crash,
            ErrorCategory.API_FAILURE: self._recover_api_failure,
            ErrorCategory.SERVER_ERROR: self._recover_server_error,
            ErrorCategory.CLIENT_JS_ERROR: self._recover_client_js,
            ErrorCategory.UNKNOWN: self._recover_generic,
        }

        handler = handlers.get(category, self._recover_generic)
        result = await handler(page, error, retry_fn=retry_fn, context=context)
        result.error_category = category.value
        return result

    async def classify_error_category(self, page, error: Exception) -> ErrorCategory:
        """Classify an exception into one of the 11 ErrorCategory values."""
        err_str = str(error).lower()

        # Exception-level classification
        if "timeout" in err_str:
            return ErrorCategory.TIMEOUT
        if any(t in err_str for t in _NETWORK_ERRORS):
            return ErrorCategory.NETWORK
        if "detached" in err_str or "stale" in err_str or "dom" in err_str:
            return ErrorCategory.DOM_CHANGED
        if "target closed" in err_str or "crashed" in err_str:
            return ErrorCategory.BROWSER_CRASH
        if "permission" in err_str or "not allowed" in err_str:
            return ErrorCategory.PERMISSIONS

        # Page content classification
        try:
            page_text = (await page.evaluate("() => (document.body.innerText || '').toLowerCase()") or "")
            if any(t in page_text for t in _CAPTCHA_TEXTS):
                return ErrorCategory.CAPTCHA
            if any(t in page_text for t in _RATE_LIMIT_TEXTS):
                return ErrorCategory.NETWORK
            if any(t in page_text for t in _AUTH_TEXTS):
                return ErrorCategory.AUTHENTICATION
            if any(t in page_text for t in _VALIDATION_TEXTS):
                return ErrorCategory.VALIDATION
            if any(t in page_text for t in _API_ERROR_TEXTS):
                return ErrorCategory.API_FAILURE
            if any(t in page_text for t in _SERVER_ERROR_TEXTS):
                return ErrorCategory.SERVER_ERROR
            spinner = await page.locator('[class*="spinner"], [aria-busy="true"]').count()
            if spinner > 0:
                return ErrorCategory.TIMEOUT
        except Exception:
            pass

        if any(t in err_str for t in _CLIENT_JS_TEXTS):
            return ErrorCategory.CLIENT_JS_ERROR

        return ErrorCategory.UNKNOWN

    def recovery_strategy_for(self, category: ErrorCategory) -> list[str]:
        """Return ordered list of recovery strategies for a given error category."""
        return list(_RECOVERY_STRATEGIES.get(category, ["escalate"]))

    async def detect_error_state(self, page) -> Optional[str]:
        """Detect if the page is currently in an error state without an exception."""
        try:
            return await page.evaluate("""() => {
                const text = (document.body.innerText || '').toLowerCase();
                if (/are you a robot|captcha|recaptcha|hcaptcha/.test(text)) return 'captcha';
                if (/too many requests|rate limit|429|you've been blocked/.test(text)) return 'rate_limit';
                if (/error 404|not found|page not found/.test(text)) return 'not_found';
                if (/error 500|server error|internal server/.test(text)) return 'server_error';
                if (/access denied|403 forbidden/.test(text)) return 'access_denied';
                if (/log in to continue|session expired|please sign in/.test(text)) return 'authentication';
                if (/please fill|required field|invalid email/.test(text)) return 'validation';

                const spinner = document.querySelector('[class*="spinner"], [class*="loading"], [aria-busy="true"]');
                const hasContent = document.body.children.length > 3;
                if (spinner && !hasContent) return 'infinite_loading';

                return null;
            }""")
        except Exception:
            return "browser_crash"

    async def recover_popup_block(self, page) -> bool:
        """Quick recovery: dismiss any popup blocking the page."""
        try:
            await page.keyboard.press("Escape")
            await asyncio.sleep(0.4)
            close_selectors = [
                'button[aria-label="Close"]', '[class*="close-btn"]',
                '[class*="modal-close"]', '[data-dismiss]',
            ]
            for sel in close_selectors:
                try:
                    el = page.locator(sel).first
                    if await el.is_visible():
                        await el.click(timeout=2000)
                        return True
                except Exception:
                    continue
            return False
        except Exception:
            return False

    async def wait_and_retry(
        self,
        fn: Callable,
        *args,
        wait_ms: int = 2000,
        max_retries: int = 2,
        **kwargs,
    ) -> Any:
        """Retry a coroutine with exponential backoff."""
        for attempt in range(max_retries + 1):
            try:
                return await fn(*args, **kwargs)
            except Exception as exc:
                if attempt >= max_retries:
                    raise
                wait = wait_ms * (2 ** attempt) + random.randint(0, 300)
                log.debug("Retry %d/%d after %dms: %s", attempt + 1, max_retries, wait, exc)
                await asyncio.sleep(wait / 1000)

    # ── Recovery handlers ────────────────────────────────────────────────────

    async def _recover_timeout(self, page, error, *, retry_fn=None, context=None) -> RecoveryResult:
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=10000)
            await asyncio.sleep(1.0)
            if retry_fn:
                await retry_fn()
                return self._ok("timeout", ErrorCategory.TIMEOUT, "wait_and_retry", "Page loaded after wait")
        except Exception:
            pass
        try:
            await page.go_back()
            await asyncio.sleep(1.0)
        except Exception:
            pass
        return self._escalate("timeout", ErrorCategory.TIMEOUT, "navigate_back", "Timeout — could not recover")

    async def _recover_network(self, page, error, *, retry_fn=None, context=None) -> RecoveryResult:
        await asyncio.sleep(3.0)
        if retry_fn:
            try:
                await retry_fn()
                return self._ok("rate_limit", ErrorCategory.NETWORK, "wait_and_retry", "Network recovered after wait")
            except Exception:
                pass
        return self._escalate("network_error", ErrorCategory.NETWORK, "escalate", "Network unavailable after retry")

    async def _recover_authentication(self, page, error, *, retry_fn=None, context=None) -> RecoveryResult:
        """Authentication error: check if we can navigate to login page."""
        try:
            current_url = page.url
            # Look for login link on the page
            login_link = await page.evaluate("""() => {
                const a = document.querySelector('a[href*="login"], a[href*="signin"]');
                return a ? a.href : null;
            }""")
            if login_link:
                return RecoveryResult(
                    success=False, strategy_used="navigate_to_login",
                    attempts=1, error_type="authentication", error_category=ErrorCategory.AUTHENTICATION.value,
                    escalate_to_user=True,
                    reason=f"Session expired — user must log in at {login_link}",
                )
        except Exception:
            pass
        return self._escalate("authentication", ErrorCategory.AUTHENTICATION, "escalate", "Authentication required — please log in")

    async def _recover_captcha(self, page, error, *, retry_fn=None, context=None) -> RecoveryResult:
        return RecoveryResult(
            success=False, strategy_used="escalate_captcha",
            attempts=0, error_type="captcha", error_category=ErrorCategory.CAPTCHA.value,
            escalate_to_user=True,
            reason="CAPTCHA detected — user must solve manually in Take Control mode",
        )

    async def _recover_stale_element(self, page, error, *, retry_fn=None, context=None) -> RecoveryResult:
        await asyncio.sleep(0.5)
        if retry_fn:
            try:
                await retry_fn()
                return self._ok("stale_element", ErrorCategory.DOM_CHANGED, "requeries_element", "Element re-queried after DOM update")
            except Exception:
                pass
        return RecoveryResult(
            success=False, strategy_used="requeries_element",
            attempts=1, error_type="stale_element", error_category=ErrorCategory.DOM_CHANGED.value,
            escalate_to_user=False, reason="Stale element — will retry next attempt",
        )

    async def _recover_validation(self, page, error, *, retry_fn=None, context=None) -> RecoveryResult:
        """Validation error: scroll to first error field and escalate."""
        try:
            await page.evaluate("""() => {
                const errEl = document.querySelector('[class*="error"], [aria-invalid="true"]');
                if (errEl) errEl.scrollIntoView({behavior: 'smooth', block: 'center'});
            }""")
        except Exception:
            pass
        return RecoveryResult(
            success=False, strategy_used="highlight_errors",
            attempts=1, error_type="validation", error_category=ErrorCategory.VALIDATION.value,
            escalate_to_user=True, reason="Form validation errors found — user must correct required fields",
        )

    async def _recover_permissions(self, page, error, *, retry_fn=None, context=None) -> RecoveryResult:
        return self._escalate("permissions", ErrorCategory.PERMISSIONS, "escalate", "Permissions denied — cannot proceed without authorization")

    async def _recover_crash(self, page, error, *, retry_fn=None, context=None) -> RecoveryResult:
        try:
            await page.reload(timeout=20000)
            return self._ok("page_crash", ErrorCategory.BROWSER_CRASH, "crash_reload", "Page reloaded after crash")
        except Exception as exc:
            return self._escalate("page_crash", ErrorCategory.BROWSER_CRASH, "escalate", str(exc))

    async def _recover_api_failure(self, page, error, *, retry_fn=None, context=None) -> RecoveryResult:
        """API failure: wait and retry with exponential backoff."""
        for attempt in range(2):
            wait_s = (attempt + 1) * 10
            await asyncio.sleep(wait_s)
            if retry_fn:
                try:
                    await retry_fn()
                    return self._ok("api_failure", ErrorCategory.API_FAILURE, "wait_and_retry", f"API recovered after {wait_s}s wait")
                except Exception:
                    pass
        return self._escalate("api_failure", ErrorCategory.API_FAILURE, "escalate", "API not responding after retries")

    async def _recover_server_error(self, page, error, *, retry_fn=None, context=None) -> RecoveryResult:
        await asyncio.sleep(5.0)
        try:
            await page.reload(timeout=15000)
            return self._ok("server_error", ErrorCategory.SERVER_ERROR, "page_reload", "Server recovered after reload")
        except Exception as exc:
            return self._escalate("server_error", ErrorCategory.SERVER_ERROR, "escalate", str(exc))

    async def _recover_client_js(self, page, error, *, retry_fn=None, context=None) -> RecoveryResult:
        try:
            await page.reload(timeout=15000)
            await page.wait_for_load_state("domcontentloaded", timeout=10000)
            if retry_fn:
                await retry_fn()
                return self._ok("client_js_error", ErrorCategory.CLIENT_JS_ERROR, "page_reload", "Recovered after page reload")
        except Exception:
            pass
        return self._escalate("client_js_error", ErrorCategory.CLIENT_JS_ERROR, "escalate", "Client JS error persists after reload")

    async def _recover_generic(self, page, error, *, retry_fn=None, context=None) -> RecoveryResult:
        try:
            await page.keyboard.press("Escape")
            await asyncio.sleep(0.5)
            if retry_fn:
                await retry_fn()
                return self._ok("unknown", ErrorCategory.UNKNOWN, "escape_and_retry", "Recovered after Escape")
        except Exception:
            pass
        return self._escalate("unknown", ErrorCategory.UNKNOWN, "escalate", str(error))

    # ── Private helpers ───────────────────────────────────────────────────────

    def _ok(self, error_type: str, category: ErrorCategory, strategy: str, reason: str) -> RecoveryResult:
        return RecoveryResult(
            success=True, strategy_used=strategy, attempts=1,
            error_type=error_type, error_category=category.value,
            escalate_to_user=False, reason=reason,
        )

    def _escalate(self, error_type: str, category: ErrorCategory, strategy: str, reason: str) -> RecoveryResult:
        return RecoveryResult(
            success=False, strategy_used=strategy, attempts=self.max_attempts,
            error_type=error_type, error_category=category.value,
            escalate_to_user=True, reason=reason,
        )
