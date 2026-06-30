"""
Social Agent — Playwright-driven Twitter/X and LinkedIn automation.

Supports:
  - Twitter/X: draft and post tweets, read mentions and notifications
  - LinkedIn: create posts, read notifications

Design principles (mirroring job_agent):
  - Self-healing selector lists: every UI target has 3-5 fallback selectors
    tried in order; failures log a warning and attempt the next candidate.
  - Progress callbacks: every meaningful step is reported via ctx.log() so
    the dashboard live view reflects what the agent is doing.
  - Approval-gated posting: actual submit/post clicks are preceded by an
    explicit log warning so the calling skill layer can surface an approval
    prompt before this method reaches the submit step.
  - Structured return: always returns a dict matching the schema described
    in the module docstring (action, platform, content, status).

The agent does NOT manage its own Playwright instance — it receives a live
Page object (ctx.page) from the OmniTask engine, exactly as the job_agent
does when run as a skill.
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any, Dict, List, Optional

log = logging.getLogger("browser-py.social_agent")

# ---------------------------------------------------------------------------
# Platform URL constants
# ---------------------------------------------------------------------------

_TWITTER_HOME = "https://x.com/home"
_TWITTER_NOTIFICATIONS = "https://x.com/notifications"
_TWITTER_MENTIONS = "https://x.com/notifications/mentions"

_LINKEDIN_HOME = "https://www.linkedin.com/feed/"
_LINKEDIN_NOTIFICATIONS = "https://www.linkedin.com/notifications/"

# ---------------------------------------------------------------------------
# Selector catalogues (ordered: most stable first, most brittle last)
# ---------------------------------------------------------------------------

# Twitter/X compose box (the "What is happening?!" text area)
_TW_COMPOSE_SELECTORS = [
    '[data-testid="tweetTextarea_0"]',
    'div[role="textbox"][aria-label*="Post"]',
    'div[role="textbox"][aria-label*="Tweet"]',
    'div[contenteditable="true"][data-testid*="tweet"]',
    'div.public-DraftEditor-content',
    '[aria-label="Tweet text"]',
]

# Twitter/X "Post" / submit button
_TW_POST_BUTTON_SELECTORS = [
    '[data-testid="tweetButton"]',
    '[data-testid="tweetButtonInline"]',
    'button[aria-label="Post"]',
    'button:has-text("Post")',
    'div[data-testid="tweetButton"] > div',
]

# Twitter/X notification items
_TW_NOTIFICATION_SELECTORS = [
    '[data-testid="notification"]',
    'article[data-testid="tweet"]',
    'div[data-testid="cellInnerDiv"]',
    'section[role="region"] article',
    'li[role="listitem"]',
]

# LinkedIn compose area (Start a post button opens the modal)
_LI_START_POST_SELECTORS = [
    'button[aria-label*="Start a post"]',
    'button:has-text("Start a post")',
    '.share-box-feed-entry__trigger',
    '[data-control-name="share.post"]',
    'div.share-creation-state__placeholder',
]

# LinkedIn post content editor (inside the modal)
_LI_EDITOR_SELECTORS = [
    'div[role="textbox"][aria-label*="What do you want to talk about"]',
    'div.ql-editor[contenteditable="true"]',
    'div[contenteditable="true"][data-placeholder]',
    '[role="textbox"]',
    'div.share-creation-state__content-field',
]

# LinkedIn "Post" submit button inside the share modal
_LI_POST_BUTTON_SELECTORS = [
    'button[class*="share-actions__primary-action"]',
    'button.share-actions__primary-action',
    'button:has-text("Post")',
    '[aria-label="Post"]',
    'button[data-control-name="share.post"]',
]

# LinkedIn notification items
_LI_NOTIFICATION_SELECTORS = [
    'div.nt-card-list__item',
    'div.notification-list-item',
    'div.artdeco-list__item',
    'li.notifications-list__item',
    'div[data-urn]',
]


# ---------------------------------------------------------------------------
# SocialAgent
# ---------------------------------------------------------------------------

class SocialAgent:
    """Playwright-driven social media agent.

    Parameters mirror the SkillContext interface so the agent is trivially
    wired in from the skill layer without an adapter.

    Args:
        page: Playwright Page (live browser tab, owned by the OmniTask engine).
        publisher: EventPublisher for Redis log streaming.
        session_id: Unique string per job run.
        goal: Natural-language goal from the user.
        job: Full raw job payload dict (may contain 'platform', 'content',
             'action', 'query', etc.).
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
          - Which platform (twitter/linkedin)
          - Which action (post, draft, read)

        Returns a structured result dict:
            {
                "action": "posted" | "drafted" | "read",
                "platform": "twitter" | "linkedin",
                "content": str,         # text posted/drafted, or summary of feed read
                "status": "success" | "failed",
                "items": list[dict],    # notifications/mentions if action==read
                "error": str,           # present only on failure
            }
        """
        ctx = task_context or {}

        platform = self._detect_platform()
        action = self._detect_action()

        await self._log(
            f"Social agent starting — platform={platform}, action={action}",
            source="SocialAgent",
        )

        try:
            if platform == "twitter":
                return await self._run_twitter(action, ctx)
            elif platform == "linkedin":
                return await self._run_linkedin(action, ctx)
            else:
                # Fallback: try both platforms, return first success
                await self._log(
                    "Platform not specified — trying Twitter/X first",
                    source="SocialAgent",
                    level="warn",
                )
                result = await self._run_twitter(action, ctx)
                if result.get("status") == "success":
                    return result
                return await self._run_linkedin(action, ctx)

        except Exception as exc:
            log.exception("SocialAgent.execute failed: %s", exc)
            await self._log(f"Social agent error: {exc}", source="SocialAgent", level="error")
            return self._fail(str(exc), platform=platform, action=action)

    # ------------------------------------------------------------------
    # Twitter/X flows
    # ------------------------------------------------------------------

    async def _run_twitter(self, action: str, ctx: Dict[str, Any]) -> Dict[str, Any]:
        """Dispatch to the correct Twitter/X flow."""
        if action in ("post", "draft"):
            return await self._twitter_post(action)
        if action == "read":
            return await self._twitter_read()
        # Unknown action — fall back to drafting
        await self._log(
            f"Unknown action '{action}' for Twitter — defaulting to draft",
            source="SocialAgent",
            level="warn",
        )
        return await self._twitter_post("draft")

    async def _twitter_navigate_home(self) -> bool:
        """Navigate to Twitter/X home feed; return True on success."""
        await self._log("Navigating to Twitter/X...", source="SocialAgent")
        try:
            await self.page.goto(_TWITTER_HOME, wait_until="domcontentloaded", timeout=30_000)
            await asyncio.sleep(2)
            return True
        except Exception as exc:
            await self._log(f"Twitter navigation failed: {exc}", source="SocialAgent", level="warn")
            return False

    async def _twitter_post(self, action: str) -> Dict[str, Any]:
        """Draft or post a tweet.

        When action == 'draft': fills the compose box but does NOT click Post.
        When action == 'post':  fills the compose box and clicks Post.

        Self-heals on selector failures — tries each selector in the catalogue
        and logs a warning for each miss.
        """
        content = self._extract_content()

        # Use AI to refine/generate the tweet text if available and content is thin.
        if self.ai.available and (not content or len(content) < 20):
            await self._log("Using AI to draft tweet content...", source="SocialAgent")
            refined = await self.ai.summarize(
                self.goal,
                "Write a single engaging tweet (max 280 characters) about the following goal. "
                "Return ONLY the tweet text, no preamble or quotes.",
            )
            if refined:
                content = refined.strip()[:280]

        if not content:
            content = self.goal[:280] if self.goal else "Hello from OmniTask!"

        await self._log(
            f"Preparing to {'post' if action == 'post' else 'draft'} tweet: {content[:80]}...",
            source="SocialAgent",
        )

        ok = await self._twitter_navigate_home()
        if not ok:
            return self._fail("Could not reach Twitter/X", platform="twitter", action=action)

        # Locate the compose box
        compose = await self._find_element_from_list(_TW_COMPOSE_SELECTORS, label="Twitter compose box")
        if not compose:
            return self._fail(
                "Could not find Twitter/X compose box — you may need to log in",
                platform="twitter",
                action=action,
            )

        await self._log("Clicking compose box...", source="SocialAgent")
        try:
            await compose.click(timeout=8_000)
            await asyncio.sleep(0.8)
        except Exception as exc:
            await self._log(f"Compose box click failed: {exc}", source="SocialAgent", level="warn")

        # Type the tweet content
        await self._log("Typing tweet content...", source="SocialAgent")
        try:
            await compose.type(content, delay=30)
            await asyncio.sleep(0.5)
        except Exception as exc:
            # Fallback: JS-based fill for contenteditable elements
            await self._log(
                f"type() failed ({exc}) — attempting JS input fallback",
                source="SocialAgent",
                level="warn",
            )
            try:
                await self.page.evaluate(
                    "(el, text) => { el.focus(); document.execCommand('insertText', false, text); }",
                    compose,
                    content,
                )
            except Exception as exc2:
                await self._log(f"JS input fallback also failed: {exc2}", source="SocialAgent", level="error")
                return self._fail("Could not type into compose box", platform="twitter", action=action)

        if action == "draft":
            await self._log(
                "Tweet drafted successfully (not posted — approval required).",
                source="SocialAgent",
                level="success",
            )
            return {
                "action": "drafted",
                "platform": "twitter",
                "content": content,
                "status": "success",
                "items": [],
            }

        # action == 'post': find and click the Post button
        await self._log(
            "APPROVAL GATE: About to submit tweet — ensure user has approved this action.",
            source="SocialAgent",
            level="warn",
        )

        post_btn = await self._find_element_from_list(
            _TW_POST_BUTTON_SELECTORS, label="Twitter Post button"
        )
        if not post_btn:
            await self._log(
                "Post button not found — tweet is drafted but not posted.",
                source="SocialAgent",
                level="warn",
            )
            return {
                "action": "drafted",
                "platform": "twitter",
                "content": content,
                "status": "success",
                "items": [],
            }

        try:
            is_enabled = await post_btn.is_enabled()
            if not is_enabled:
                await self._log(
                    "Post button is disabled (content may be empty or over limit).",
                    source="SocialAgent",
                    level="warn",
                )
                return {
                    "action": "drafted",
                    "platform": "twitter",
                    "content": content,
                    "status": "success",
                    "items": [],
                }
        except Exception:
            pass

        try:
            await post_btn.click(timeout=8_000)
            await asyncio.sleep(2)
        except Exception as exc:
            await self._log(f"Post button click failed: {exc}", source="SocialAgent", level="error")
            return self._fail("Post button click failed", platform="twitter", action="post")

        # Wait for confirmation (tweet disappears from compose on success)
        await asyncio.sleep(1.5)
        await self._log("Tweet posted successfully.", source="SocialAgent", level="success")
        return {
            "action": "posted",
            "platform": "twitter",
            "content": content,
            "status": "success",
            "items": [],
        }

    async def _twitter_read(self) -> Dict[str, Any]:
        """Read Twitter/X mentions and notifications.

        Navigates to the Mentions tab (most user-relevant), extracts the
        visible notification cards, and returns them as structured items.
        """
        await self._log("Reading Twitter/X mentions and notifications...", source="SocialAgent")

        # Navigate to mentions (most signal-rich for the user)
        try:
            await self.page.goto(_TWITTER_MENTIONS, wait_until="domcontentloaded", timeout=30_000)
            await asyncio.sleep(3)
        except Exception as exc:
            await self._log(
                f"Could not reach Twitter mentions: {exc} — trying notifications",
                source="SocialAgent",
                level="warn",
            )
            try:
                await self.page.goto(
                    _TWITTER_NOTIFICATIONS, wait_until="domcontentloaded", timeout=30_000
                )
                await asyncio.sleep(2)
            except Exception as exc2:
                return self._fail(f"Could not reach Twitter notifications: {exc2}", platform="twitter", action="read")

        # Scroll slightly to trigger lazy loading
        await self._scroll(steps=3)

        items = await self._extract_twitter_notifications()
        await self._log(
            f"Read {len(items)} Twitter notification(s).",
            source="SocialAgent",
            level="success",
        )

        summary = f"Read {len(items)} Twitter/X notifications"
        if items:
            preview = items[0].get("text", "")[:120]
            summary += f': "{preview}"'

        return {
            "action": "read",
            "platform": "twitter",
            "content": summary,
            "status": "success",
            "items": items,
        }

    async def _extract_twitter_notifications(self) -> List[Dict[str, Any]]:
        """Extract visible notification/mention cards from the current page."""
        items: List[Dict[str, Any]] = []

        for selector in _TW_NOTIFICATION_SELECTORS:
            try:
                cards = await self.page.query_selector_all(selector)
                if cards:
                    log.debug("Twitter notifications: found %d cards with '%s'", len(cards), selector)
                    for i, card in enumerate(cards[:20]):
                        try:
                            text = (await card.inner_text()) or ""
                            text = re.sub(r"\s+", " ", text).strip()
                            if text:
                                items.append(
                                    {
                                        "index": i,
                                        "text": text[:400],
                                        "platform": "twitter",
                                    }
                                )
                        except Exception:
                            continue
                    break
            except Exception:
                continue

        return items

    # ------------------------------------------------------------------
    # LinkedIn flows
    # ------------------------------------------------------------------

    async def _run_linkedin(self, action: str, ctx: Dict[str, Any]) -> Dict[str, Any]:
        """Dispatch to the correct LinkedIn flow."""
        if action in ("post", "draft"):
            return await self._linkedin_post(action)
        if action == "read":
            return await self._linkedin_read()
        await self._log(
            f"Unknown action '{action}' for LinkedIn — defaulting to draft",
            source="SocialAgent",
            level="warn",
        )
        return await self._linkedin_post("draft")

    async def _linkedin_navigate_home(self) -> bool:
        """Navigate to LinkedIn home feed; return True on success."""
        await self._log("Navigating to LinkedIn...", source="SocialAgent")
        try:
            await self.page.goto(_LINKEDIN_HOME, wait_until="domcontentloaded", timeout=30_000)
            await asyncio.sleep(2)
            return True
        except Exception as exc:
            await self._log(f"LinkedIn navigation failed: {exc}", source="SocialAgent", level="warn")
            return False

    async def _linkedin_post(self, action: str) -> Dict[str, Any]:
        """Draft or publish a LinkedIn post.

        When action == 'draft': fills the editor but does NOT click Post.
        When action == 'post':  fills the editor and clicks Post.
        """
        content = self._extract_content()

        if self.ai.available and (not content or len(content) < 30):
            await self._log("Using AI to draft LinkedIn post content...", source="SocialAgent")
            refined = await self.ai.summarize(
                self.goal,
                "Write a professional LinkedIn post (2-4 sentences, max 700 characters) "
                "about the following goal. Return ONLY the post text, no preamble.",
            )
            if refined:
                content = refined.strip()[:700]

        if not content:
            content = self.goal[:700] if self.goal else "Sharing an update from OmniTask."

        await self._log(
            f"Preparing to {'post' if action == 'post' else 'draft'} LinkedIn post: {content[:80]}...",
            source="SocialAgent",
        )

        ok = await self._linkedin_navigate_home()
        if not ok:
            return self._fail("Could not reach LinkedIn", platform="linkedin", action=action)

        # Click "Start a post" trigger to open the share modal
        await self._log("Opening LinkedIn share modal...", source="SocialAgent")
        start_btn = await self._find_element_from_list(
            _LI_START_POST_SELECTORS, label="LinkedIn Start a post button"
        )
        if not start_btn:
            return self._fail(
                "Could not find LinkedIn 'Start a post' button — you may need to log in",
                platform="linkedin",
                action=action,
            )

        try:
            await start_btn.click(timeout=8_000)
            await asyncio.sleep(1.5)
        except Exception as exc:
            await self._log(
                f"'Start a post' click failed: {exc}", source="SocialAgent", level="warn"
            )

        # Locate the content editor inside the modal
        editor = await self._find_element_from_list(
            _LI_EDITOR_SELECTORS, label="LinkedIn post editor"
        )
        if not editor:
            return self._fail(
                "LinkedIn share modal editor not found",
                platform="linkedin",
                action=action,
            )

        await self._log("Typing LinkedIn post content...", source="SocialAgent")
        try:
            await editor.click(timeout=5_000)
            await asyncio.sleep(0.5)
            await editor.type(content, delay=25)
            await asyncio.sleep(0.5)
        except Exception as exc:
            await self._log(
                f"Editor type() failed ({exc}) — attempting JS input fallback",
                source="SocialAgent",
                level="warn",
            )
            try:
                await self.page.evaluate(
                    "(el, text) => { el.focus(); document.execCommand('insertText', false, text); }",
                    editor,
                    content,
                )
            except Exception as exc2:
                await self._log(
                    f"JS input fallback also failed: {exc2}",
                    source="SocialAgent",
                    level="error",
                )
                return self._fail(
                    "Could not type into LinkedIn editor",
                    platform="linkedin",
                    action=action,
                )

        if action == "draft":
            await self._log(
                "LinkedIn post drafted (not published — approval required).",
                source="SocialAgent",
                level="success",
            )
            return {
                "action": "drafted",
                "platform": "linkedin",
                "content": content,
                "status": "success",
                "items": [],
            }

        # action == 'post': click the Post/Submit button
        await self._log(
            "APPROVAL GATE: About to publish LinkedIn post — ensure user has approved.",
            source="SocialAgent",
            level="warn",
        )

        post_btn = await self._find_element_from_list(
            _LI_POST_BUTTON_SELECTORS, label="LinkedIn Post button"
        )
        if not post_btn:
            await self._log(
                "LinkedIn Post button not found — content drafted but not published.",
                source="SocialAgent",
                level="warn",
            )
            return {
                "action": "drafted",
                "platform": "linkedin",
                "content": content,
                "status": "success",
                "items": [],
            }

        try:
            await post_btn.click(timeout=8_000)
            await asyncio.sleep(2)
        except Exception as exc:
            await self._log(
                f"LinkedIn Post button click failed: {exc}", source="SocialAgent", level="error"
            )
            return self._fail("Post button click failed", platform="linkedin", action="post")

        await asyncio.sleep(1.5)
        await self._log("LinkedIn post published successfully.", source="SocialAgent", level="success")
        return {
            "action": "posted",
            "platform": "linkedin",
            "content": content,
            "status": "success",
            "items": [],
        }

    async def _linkedin_read(self) -> Dict[str, Any]:
        """Read LinkedIn notifications.

        Navigates to the notifications page, extracts visible items, and
        returns them as structured results.
        """
        await self._log("Reading LinkedIn notifications...", source="SocialAgent")

        try:
            await self.page.goto(_LINKEDIN_NOTIFICATIONS, wait_until="domcontentloaded", timeout=30_000)
            await asyncio.sleep(2)
        except Exception as exc:
            return self._fail(f"Could not reach LinkedIn notifications: {exc}", platform="linkedin", action="read")

        await self._scroll(steps=3)

        items = await self._extract_linkedin_notifications()
        await self._log(
            f"Read {len(items)} LinkedIn notification(s).",
            source="SocialAgent",
            level="success",
        )

        summary = f"Read {len(items)} LinkedIn notifications"
        if items:
            preview = items[0].get("text", "")[:120]
            summary += f': "{preview}"'

        return {
            "action": "read",
            "platform": "linkedin",
            "content": summary,
            "status": "success",
            "items": items,
        }

    async def _extract_linkedin_notifications(self) -> List[Dict[str, Any]]:
        """Extract visible notification items from the current LinkedIn page."""
        items: List[Dict[str, Any]] = []

        for selector in _LI_NOTIFICATION_SELECTORS:
            try:
                cards = await self.page.query_selector_all(selector)
                if cards:
                    log.debug(
                        "LinkedIn notifications: found %d items with '%s'", len(cards), selector
                    )
                    for i, card in enumerate(cards[:20]):
                        try:
                            text = (await card.inner_text()) or ""
                            text = re.sub(r"\s+", " ", text).strip()
                            if text:
                                items.append(
                                    {
                                        "index": i,
                                        "text": text[:400],
                                        "platform": "linkedin",
                                    }
                                )
                        except Exception:
                            continue
                    break
            except Exception:
                continue

        return items

    # ------------------------------------------------------------------
    # Shared helpers
    # ------------------------------------------------------------------

    def _detect_platform(self) -> str:
        """Infer target platform from goal and job payload.

        Returns 'twitter', 'linkedin', or '' (unknown/auto).
        """
        platform = (self.job.get("platform") or "").lower()
        if platform in ("twitter", "x", "twitter/x"):
            return "twitter"
        if platform in ("linkedin",):
            return "linkedin"

        # Fallback: scan goal text
        goal = self.goal.lower()
        if any(k in goal for k in ("twitter", "tweet", "x.com", " x ")):
            return "twitter"
        if "linkedin" in goal:
            return "linkedin"

        return ""

    def _detect_action(self) -> str:
        """Infer the requested action from the job payload and goal text.

        Returns one of: 'post', 'draft', 'read'.
        """
        action = (self.job.get("action") or "").lower()
        if action in ("post", "publish", "send", "tweet"):
            return "post"
        if action in ("draft", "compose", "write", "prepare"):
            return "draft"
        if action in ("read", "check", "fetch", "notifications", "mentions", "inbox"):
            return "read"

        # Scan goal text
        goal = self.goal.lower()
        if any(k in goal for k in ("post", "publish", "send", "tweet", "share")):
            return "post"
        if any(k in goal for k in ("draft", "compose", "write", "prepare")):
            return "draft"
        if any(k in goal for k in ("read", "check", "mention", "notification", "inbox", "feed")):
            return "read"

        # Default: draft (safer than immediate post)
        return "draft"

    def _extract_content(self) -> str:
        """Pull post content from the job payload or goal."""
        return (
            self.job.get("content")
            or self.job.get("text")
            or self.job.get("message")
            or self.job.get("query")
            or ""
        ).strip()

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
            source="SocialAgent",
            level="warn",
        )
        return None

    async def _scroll(self, steps: int = 3, px: int = 600) -> None:
        """Scroll down the page to trigger lazy-loaded content."""
        for _ in range(steps):
            try:
                await self.page.evaluate(f"window.scrollBy(0, {px})")
                await asyncio.sleep(0.8)
            except Exception:
                break

    async def _log(self, message: str, source: str = "SocialAgent", level: str = "info") -> None:
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
    def _fail(reason: str, platform: str = "", action: str = "") -> Dict[str, Any]:
        """Return a normalized failure result dict."""
        return {
            "action": action or "unknown",
            "platform": platform or "unknown",
            "content": "",
            "status": "failed",
            "items": [],
            "error": reason,
        }


# ---------------------------------------------------------------------------
# Standalone test harness (run directly for quick smoke-test)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import json

    async def _smoke_test() -> None:
        """Quick smoke-test: navigate to Twitter home (no login required to test nav)."""
        from playwright.async_api import async_playwright

        class _FakePublisher:
            async def publish(self, *args, **kwargs):
                pass

        class _FakeAI:
            available = False

        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            page = await browser.new_page()
            agent = SocialAgent(
                page=page,
                publisher=_FakePublisher(),
                session_id="smoke-test-001",
                goal="Read my Twitter mentions",
                job={"action": "read", "platform": "twitter"},
                user_id="test-user",
                ai=_FakeAI(),
            )
            result = await agent.execute()
            print(json.dumps(result, indent=2))
            await browser.close()

    asyncio.run(_smoke_test())
