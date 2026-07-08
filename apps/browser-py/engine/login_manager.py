"""Login manager — handles all authentication methods for any website.

Supports: password, Google SSO, Apple SSO, GitHub SSO, magic link,
OTP/SMS, TOTP (Google Authenticator), passkey detection, session restoration.
NEVER auto-fills OTP or 2FA codes — always pauses for user input.
"""

import asyncio
import base64
import hashlib
import hmac
import logging
import re
import struct
import time
from dataclasses import dataclass
from typing import Optional

log = logging.getLogger("browser-py.engine.login_manager")

_SSO_PROVIDERS = {
    "google": [
        '[data-provider="google"]', '[class*="google-sign"]', 'button[aria-label*="Google"]',
        'a[href*="accounts.google.com"]', '[id*="google-login"]', 'text=Continue with Google',
        'text=Sign in with Google', 'text=Log in with Google',
    ],
    "github": [
        '[class*="github-login"]', 'a[href*="github.com/login"]', 'text=Continue with GitHub',
        'text=Sign in with GitHub', '[data-provider="github"]',
    ],
    "apple": [
        'apple-sign-in-button', 'text=Sign in with Apple', 'text=Continue with Apple',
        '[class*="apple-sign-in"]',
    ],
    "microsoft": [
        'text=Sign in with Microsoft', 'text=Continue with Microsoft',
        'a[href*="login.microsoftonline.com"]',
    ],
    "linkedin": [
        'text=Sign in with LinkedIn', '[class*="linkedin-login"]',
    ],
}

_MAGIC_LINK_TEXTS = [
    "send magic link", "email me a link", "sign in with email link",
    "get login link", "send me a link", "email link",
]

_2FA_SELECTORS = [
    '[class*="otp"]', '[class*="2fa"]', '[class*="two-factor"]',
    'input[autocomplete="one-time-code"]', '[placeholder*="verification code"]',
    '[placeholder*="OTP"]', 'input[maxlength="6"]',
]

_LOGIN_FORM_SELECTORS = {
    "email": 'input[type="email"], input[name*="email"], input[name*="username"], input[placeholder*="email"]',
    "password": 'input[type="password"]',
    "submit": 'button[type="submit"], input[type="submit"], button[class*="login"], button[class*="sign-in"]',
}


@dataclass
class LoginResult:
    success: bool
    method_used: str           # "password"|"google"|"github"|"apple"|"magic_link"|"session"|"failed"
    needs_2fa: bool
    needs_magic_link_click: bool
    requires_user_action: str  # "" | "enter_otp" | "click_magic_link" | "solve_captcha" | "enter_password"
    details: dict


@dataclass
class AuthState:
    is_authenticated: bool
    username: Optional[str]
    detected_method: Optional[str]


class LoginManager:
    """Handles all auth flows for any website."""

    async def detect_auth_state(self, page) -> AuthState:
        """Detect whether the user is currently logged in."""
        try:
            result = await page.evaluate("""() => {
                const loggedIn = [
                    '[class*="user-menu"]', '[class*="avatar"]', '[class*="account"]',
                    '[aria-label*="account"]', '[data-testid*="user"]',
                    '.user-name', '[class*="profile-pic"]', '[class*="logged-in"]',
                ].some(s => !!document.querySelector(s));

                const loginForms = document.querySelectorAll('form input[type="password"]').length > 0;

                // Try to extract username
                const nameEl = document.querySelector('[class*="user-name"], [class*="display-name"], [aria-label*="profile"]');
                const name = nameEl ? (nameEl.textContent || nameEl.getAttribute('aria-label') || '').trim() : null;

                return {isAuth: loggedIn && !loginForms, name};
            }""")
            return AuthState(
                is_authenticated=result.get("isAuth", False),
                username=result.get("name"),
                detected_method=None,
            )
        except Exception:
            return AuthState(is_authenticated=False, username=None, detected_method=None)

    async def login_with_password(
        self,
        page,
        email: str,
        password: str,
        *,
        submit_timeout_ms: int = 15000,
    ) -> LoginResult:
        """Fill email+password login form and submit.

        NOTE: password is passed in — never logged or stored by this class.
        """
        if not email or not password:
            return LoginResult(
                success=False, method_used="password", needs_2fa=False,
                needs_magic_link_click=False,
                requires_user_action="enter_password",
                details={"error": "Email or password missing — user must provide credentials"},
            )

        try:
            # Fill email
            email_input = page.locator(_LOGIN_FORM_SELECTORS["email"]).first
            await email_input.wait_for(state="visible", timeout=8000)
            await email_input.fill(email)
            await asyncio.sleep(0.2)

            # Try to find password field (may appear after email on some sites)
            pw_input = page.locator(_LOGIN_FORM_SELECTORS["password"]).first
            try:
                await pw_input.wait_for(state="visible", timeout=3000)
            except Exception:
                # Some sites show password on a second screen — press Enter first
                await email_input.press("Enter")
                await asyncio.sleep(1.5)
                await pw_input.wait_for(state="visible", timeout=5000)

            await pw_input.fill(password)
            await asyncio.sleep(0.3)

            # Capture state before submit for comparison
            before_url = page.url

            # Submit
            submit_btn = page.locator(_LOGIN_FORM_SELECTORS["submit"]).first
            await submit_btn.click(timeout=5000)
            await asyncio.sleep(2.0)

            # Check for 2FA
            needs_2fa = await self._detect_2fa(page)
            if needs_2fa:
                return LoginResult(
                    success=False, method_used="password", needs_2fa=True,
                    needs_magic_link_click=False,
                    requires_user_action="enter_otp",
                    details={"message": "2FA required — user must enter OTP manually"},
                )

            # Check success
            after_url = page.url
            auth = await self.detect_auth_state(page)
            success = auth.is_authenticated or after_url != before_url

            return LoginResult(
                success=success, method_used="password", needs_2fa=False,
                needs_magic_link_click=False,
                requires_user_action="" if success else "enter_password",
                details={"before_url": before_url, "after_url": after_url},
            )
        except Exception as exc:
            log.warning("login_with_password failed: %s", exc)
            return LoginResult(
                success=False, method_used="password", needs_2fa=False,
                needs_magic_link_click=False,
                requires_user_action="enter_password",
                details={"error": str(exc)},
            )

    async def click_sso(self, page, provider: str) -> LoginResult:
        """Click an SSO login button (Google, GitHub, Apple, Microsoft, LinkedIn)."""
        selectors = _SSO_PROVIDERS.get(provider.lower(), [])

        for sel in selectors:
            try:
                if sel.startswith("text="):
                    el = page.get_by_text(sel[5:], exact=False).first
                else:
                    el = page.locator(sel).first

                visible = await el.is_visible()
                if visible:
                    await el.click(timeout=5000)
                    await asyncio.sleep(2.0)

                    # SSO opens a popup or redirects — detect which
                    popups = page.context.pages
                    if len(popups) > 1:
                        # SSO opened in a popup — user must complete login there
                        return LoginResult(
                            success=False, method_used=provider, needs_2fa=False,
                            needs_magic_link_click=False,
                            requires_user_action=f"complete_{provider}_login_in_popup",
                            details={"popup_count": len(popups)},
                        )

                    # Redirect-based SSO — wait for redirect back
                    await asyncio.sleep(3.0)
                    auth = await self.detect_auth_state(page)
                    return LoginResult(
                        success=auth.is_authenticated, method_used=provider,
                        needs_2fa=False, needs_magic_link_click=False,
                        requires_user_action="",
                        details={"authenticated": auth.is_authenticated},
                    )
            except Exception:
                continue

        return LoginResult(
            success=False, method_used=provider, needs_2fa=False,
            needs_magic_link_click=False,
            requires_user_action=f"complete_{provider}_login",
            details={"error": f"No {provider} SSO button found on page"},
        )

    async def request_magic_link(self, page, email: str) -> LoginResult:
        """Fill email and click 'Send magic link' button."""
        try:
            # Find and click magic link option if not already on that form
            for text in _MAGIC_LINK_TEXTS:
                try:
                    btn = page.get_by_text(text, exact=False).first
                    if await btn.is_visible():
                        await btn.click(timeout=3000)
                        await asyncio.sleep(1.0)
                        break
                except Exception:
                    continue

            # Fill email
            email_input = page.locator('input[type="email"]').first
            await email_input.wait_for(state="visible", timeout=5000)
            await email_input.fill(email)

            # Submit
            submit = page.locator('button[type="submit"]').first
            await submit.click(timeout=5000)
            await asyncio.sleep(1.5)

            return LoginResult(
                success=True, method_used="magic_link", needs_2fa=False,
                needs_magic_link_click=True,
                requires_user_action="click_magic_link",
                details={"email": email, "message": "Magic link sent — user must click link in email"},
            )
        except Exception as exc:
            return LoginResult(
                success=False, method_used="magic_link", needs_2fa=False,
                needs_magic_link_click=False,
                requires_user_action="click_magic_link",
                details={"error": str(exc)},
            )

    async def restore_session(self, page, cookies: list, local_storage: dict = {}) -> LoginResult:
        """Restore a previously saved browser session from cookies."""
        try:
            if cookies:
                await page.context.add_cookies(cookies)

            if local_storage:
                await page.evaluate("""(data) => {
                    Object.entries(data).forEach(([k, v]) => localStorage.setItem(k, v));
                }""", local_storage)

            await page.reload(wait_until="domcontentloaded", timeout=15000)
            await asyncio.sleep(1.0)

            auth = await self.detect_auth_state(page)
            return LoginResult(
                success=auth.is_authenticated, method_used="session",
                needs_2fa=False, needs_magic_link_click=False,
                requires_user_action="" if auth.is_authenticated else "login_required",
                details={"authenticated": auth.is_authenticated, "username": auth.username},
            )
        except Exception as exc:
            return LoginResult(
                success=False, method_used="session", needs_2fa=False,
                needs_magic_link_click=False,
                requires_user_action="login_required",
                details={"error": str(exc)},
            )

    def generate_totp(self, secret_base32: str) -> str:
        """Generate a TOTP code from a base32 secret (Google Authenticator compatible).

        This is provided for integration testing only.
        In production, TOTP codes must be entered by the user — never auto-filled.
        """
        try:
            # Normalize secret
            secret = secret_base32.upper().replace(" ", "")
            key = base64.b32decode(secret)

            # Time step
            timestamp = int(time.time()) // 30
            msg = struct.pack(">Q", timestamp)

            # HMAC-SHA1
            h = hmac.new(key, msg, hashlib.sha1).digest()
            offset = h[-1] & 0x0F
            code = struct.unpack(">I", h[offset:offset+4])[0] & 0x7FFFFFFF
            return str(code % 1_000_000).zfill(6)
        except Exception as exc:
            log.warning("generate_totp failed: %s", exc)
            return ""

    async def detect_login_method(self, page) -> dict:
        """Detect which login methods are available on the current page."""
        methods = {}

        # Password form
        try:
            pw = await page.locator('input[type="password"]').count()
            methods["password"] = pw > 0
        except Exception:
            methods["password"] = False

        # SSO buttons
        for provider, selectors in _SSO_PROVIDERS.items():
            found = False
            for sel in selectors[:3]:  # Check first 3 selectors only for speed
                try:
                    if sel.startswith("text="):
                        el = page.get_by_text(sel[5:], exact=False).first
                    else:
                        el = page.locator(sel).first
                    if await el.is_visible():
                        found = True
                        break
                except Exception:
                    continue
            methods[provider] = found

        # Magic link
        magic_link_found = False
        for text in _MAGIC_LINK_TEXTS[:3]:
            try:
                el = page.get_by_text(text, exact=False).first
                if await el.is_visible():
                    magic_link_found = True
                    break
            except Exception:
                continue
        methods["magic_link"] = magic_link_found

        return methods

    # ── Private helpers ───────────────────────────────────────────────────────

    async def _detect_2fa(self, page) -> bool:
        """Check if a 2FA prompt is currently visible."""
        for sel in _2FA_SELECTORS:
            try:
                el = page.locator(sel).first
                if await el.is_visible():
                    return True
            except Exception:
                continue
        return False
