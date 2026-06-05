"""Live browser streaming via Chrome DevTools Protocol screencast.

`Page.startScreencast` makes Chromium push JPEG frames only when the page
changes (near-video, low CPU). Each frame is published as `screenshot:frame` on
the same envelope the frontend already renders. Falls back to an interval
screenshot loop if CDP screencast is unavailable.
"""

import asyncio
import base64

from events import EventPublisher, now_ms


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
        except Exception:
            # CDP not available — degrade to interval screenshots.
            self._running = True
            self._fallback_task = asyncio.create_task(self._interval_loop())

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
                    "width": self.width,
                    "height": self.height,
                },
            )
            if self._cdp is not None:
                await self._cdp.send(
                    "Page.screencastFrameAck",
                    {"sessionId": params.get("sessionId")},
                )
        except Exception:
            pass

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
                            "width": self.width,
                            "height": self.height,
                        },
                    )
            except Exception:
                pass
            await asyncio.sleep(0.5)

    def _safe_url(self) -> str:
        try:
            return self.page.url
        except Exception:
            return ""

    async def stop(self) -> None:
        self._running = False
        if self._fallback_task is not None:
            self._fallback_task.cancel()
        if self._cdp is not None:
            try:
                await self._cdp.send("Page.stopScreencast")
            except Exception:
                pass
