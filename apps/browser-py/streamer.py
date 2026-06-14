"""Live browser streaming via Chrome DevTools Protocol screencast.

`Page.startScreencast` makes Chromium push JPEG frames only when the page
changes (near-video, low CPU). Each frame is published as `screenshot:frame` on
the same envelope the frontend already renders. Falls back to an interval
screenshot loop if CDP screencast is unavailable.
"""

import asyncio
import base64
import logging

from events import EventPublisher, now_ms

log = logging.getLogger("browser-py.stream")


class Screencaster:
    def __init__(
        self,
        page,
        publisher: EventPublisher,
        session_id: str,
        width: int,
        height: int,
        quality: int = 60,
    ):
        self.page = page
        self.publisher = publisher
        self.session_id = session_id
        self.width = width
        self.height = height
        self.quality = quality
        self._cdp = None
        self._running = False
        self._fallback_task: asyncio.Task | None = None
        self._title_task: asyncio.Task | None = None
        # Throttle publish-failure logging so a dead Redis doesn't spam per-frame.
        self._publish_errors = 0
        # Cached page title — refreshed in the interval loop, not per CDP frame
        # (page.title() is async/costly), and surfaced in the live view tab.
        self._title = ""

    async def start(self) -> None:
        try:
            self._cdp = await self.page.context.new_cdp_session(self.page)
            self._cdp.on("Page.screencastFrame", self._on_frame)
            await self._cdp.send(
                "Page.startScreencast",
                {
                    "format": "jpeg",
                    "quality": self.quality,
                    "maxWidth": self.width,
                    "maxHeight": self.height,
                    "everyNthFrame": 1,
                },
            )
            self._running = True
            log.info("Screencast started for %s (CDP, %dx%d q%d)", self.session_id, self.width, self.height, self.quality)
        except Exception as exc:
            # CDP not available — degrade to interval screenshots. Log the reason
            # so a silent stream failure is debuggable from the worker logs.
            log.warning("CDP screencast unavailable for %s (%s) — falling back to interval screenshots", self.session_id, exc)
            self._running = True
            self._fallback_task = asyncio.create_task(self._interval_loop())
        # Refresh the live-view tab title alongside whichever frame path is active.
        self._title_task = asyncio.create_task(self._title_loop())

    async def rebind(self, page) -> None:
        """Point the stream at a NEW page after a crash-recovery relaunch, without
        tearing down the run. Stops the old CDP session and starts a fresh one so
        the live view keeps flowing on the recovered page."""
        # Tear down the old CDP screencast (the old page is dead/closed).
        if self._cdp is not None:
            try:
                await self._cdp.send("Page.stopScreencast")
            except Exception:
                pass
            self._cdp = None
        if self._fallback_task is not None:
            self._fallback_task.cancel()
            self._fallback_task = None
        self.page = page
        # Restart capture on the new page (CDP, with interval fallback).
        try:
            self._cdp = await self.page.context.new_cdp_session(self.page)
            self._cdp.on("Page.screencastFrame", self._on_frame)
            await self._cdp.send(
                "Page.startScreencast",
                {
                    "format": "jpeg",
                    "quality": self.quality,
                    "maxWidth": self.width,
                    "maxHeight": self.height,
                    "everyNthFrame": 1,
                },
            )
            log.info("Screencast rebound to recovered page for %s", self.session_id)
        except Exception as exc:
            log.warning("Rebind CDP failed for %s (%s) — interval fallback", self.session_id, exc)
            self._fallback_task = asyncio.create_task(self._interval_loop())

    async def _title_loop(self) -> None:
        while self._running:
            try:
                if not self.page.is_closed():
                    self._title = await self.page.title()
            except Exception:
                pass
            await asyncio.sleep(1.0)

    def _on_frame(self, params: dict) -> None:
        # Sync CDP callback → schedule async publish + ack on the running loop.
        asyncio.create_task(self._handle_frame(params))

    async def _handle_frame(self, params: dict) -> None:
        try:
            await self.publisher.publish(
                self.session_id,
                "screenshot:frame",
                {
                    "sessionId": self.session_id,
                    "stepIndex": -1,
                    "timestamp": now_ms(),
                    "base64": params.get("data", ""),
                    "url": self._safe_url(),
                    "title": self._title,
                    "width": self.width,
                    "height": self.height,
                },
            )
            if self._cdp is not None:
                await self._cdp.send(
                    "Page.screencastFrameAck",
                    {"sessionId": params.get("sessionId")},
                )
        except Exception as exc:
            self._note_publish_error(exc)

    async def _interval_loop(self) -> None:
        while self._running:
            try:
                if not self.page.is_closed():
                    buf = await self.page.screenshot(type="jpeg", quality=self.quality)
                    await self.publisher.publish(
                        self.session_id,
                        "screenshot:frame",
                        {
                            "sessionId": self.session_id,
                            "stepIndex": -1,
                            "timestamp": now_ms(),
                            "base64": base64.b64encode(buf).decode(),
                            "url": self._safe_url(),
                            "title": self._title,
                            "width": self.width,
                            "height": self.height,
                        },
                    )
            except Exception as exc:
                self._note_publish_error(exc)
            await asyncio.sleep(0.5)

    def _note_publish_error(self, exc: Exception) -> None:
        # Surface the first failure immediately, then every 20th, so a blank
        # live view always has a corresponding worker-log explanation without
        # flooding the logs when (e.g.) Redis is unreachable for the whole run.
        if self._publish_errors == 0 or self._publish_errors % 20 == 0:
            log.warning(
                "Failed to publish screenshot:frame for %s (%s) — live view will be blank (count=%d)",
                self.session_id,
                exc,
                self._publish_errors + 1,
            )
        self._publish_errors += 1

    def _safe_url(self) -> str:
        try:
            return self.page.url
        except Exception:
            return ""

    async def stop(self) -> None:
        self._running = False
        if self._fallback_task is not None:
            self._fallback_task.cancel()
        if self._title_task is not None:
            self._title_task.cancel()
        if self._cdp is not None:
            try:
                await self._cdp.send("Page.stopScreencast")
            except Exception:
                pass
