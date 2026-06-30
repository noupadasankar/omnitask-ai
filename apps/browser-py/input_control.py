"""Remote input forwarding — lets the dashboard drive the live browser.

When the user clicks/types/scrolls inside the live view (LiveBrowserView) with
"Take Control" on, the frontend emits `browser:input`; the backend publishes it to
the Redis channel `omnitask:worker:input`; this controller (running next to the
CDP screencast for the active page) dispatches it onto the real Chromium page via
Playwright's input API. Coordinates arrive already scaled to the frame's CSS
pixels (e.g. 1280x800), so they map 1:1 onto the viewport.
"""

import asyncio
import base64
import json
import logging
import os
import tempfile

log = logging.getLogger("browser-py.input")

INPUT_CHANNEL = "omnitask:worker:input"


class InputController:
    def __init__(self, page, redis_client, session_id: str):
        self.page = page
        self.client = redis_client
        self.session_id = session_id
        self._task: asyncio.Task | None = None
        self._pubsub = None
        # Holds the pending Playwright FileChooser when the page opens a file
        # dialog. Set by executor.py via page.on("filechooser", ...) and cleared
        # here once the upload completes.
        self.pending_file_chooser = None

    async def start(self) -> None:
        try:
            self._pubsub = self.client.pubsub()
            await self._pubsub.subscribe(INPUT_CHANNEL)
            self._task = asyncio.create_task(self._loop())
            log.info("Input control ready for %s", self.session_id)
        except Exception as exc:  # noqa: BLE001 — input is optional, never fatal
            log.warning("Input control unavailable for %s: %s", self.session_id, exc)

    def rebind(self, page) -> None:
        """Point remote input at a NEW page after crash recovery. The Redis
        subscription is unchanged — only the target page swaps, and a stale
        pending file chooser (tied to the dead page) is cleared."""
        self.page = page
        self.pending_file_chooser = None
        log.info("Input control rebound to recovered page for %s", self.session_id)

    async def _loop(self) -> None:
        try:
            async for msg in self._pubsub.listen():
                if msg.get("type") != "message":
                    continue
                try:
                    data = json.loads(msg["data"])
                except Exception:
                    continue
                if data.get("sessionId") != self.session_id:
                    continue
                await self._dispatch(data)
        except asyncio.CancelledError:
            pass
        except Exception as exc:  # noqa: BLE001
            log.warning("Input loop error for %s: %s", self.session_id, exc)

    async def _dispatch(self, d: dict) -> None:
        if self.page.is_closed():
            return
        t = d.get("type")
        try:
            if t == "click":
                await self.page.mouse.click(float(d["x"]), float(d["y"]))
            elif t == "mousemove":
                await self.page.mouse.move(float(d["x"]), float(d["y"]))
            elif t == "mousedown":
                await self.page.mouse.move(float(d["x"]), float(d["y"]))
                await self.page.mouse.down()
            elif t == "mouseup":
                await self.page.mouse.up()
            elif t == "wheel":
                await self.page.mouse.wheel(float(d.get("deltaX", 0)), float(d.get("deltaY", 0)))
            elif t == "type":
                await self.page.keyboard.type(str(d.get("text", "")))
            elif t == "key":
                key = str(d.get("key", ""))
                if key:
                    await self.page.keyboard.press(key)
            elif t == "navigate":
                url = str(d.get("url", "")).strip()
                if url:
                    await self.page.goto(url, wait_until="domcontentloaded", timeout=30_000)
            elif t == "back":
                await self.page.go_back()
            elif t == "forward":
                await self.page.go_forward()
            elif t == "reload":
                await self.page.reload()
            elif t == "rightclick":
                await self.page.mouse.click(float(d["x"]), float(d["y"]), button="right")
            elif t == "dblclick":
                await self.page.mouse.dblclick(float(d["x"]), float(d["y"]))
            elif t == "file_upload":
                await self._handle_file_upload(d)
        except Exception as exc:  # noqa: BLE001 — a bad input must not crash the run
            log.debug("Input dispatch failed (%s): %s", t, exc)

    async def _handle_file_upload(self, d: dict) -> None:
        b64 = d.get("base64", "")
        filename = d.get("filename", "upload.bin")
        if not b64:
            log.warning("file_upload received with no base64 payload")
            return
        raw = base64.b64decode(b64)
        suffix = os.path.splitext(filename)[1] or ".bin"
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        try:
            tmp.write(raw)
            tmp.flush()
            tmp.close()
            chooser = self.pending_file_chooser
            if chooser is not None:
                self.pending_file_chooser = None
                await chooser.set_files(tmp.name)
                log.info("File uploaded via chooser: %s (%d bytes)", filename, len(raw))
            else:
                log.warning("file_upload received but no pending file chooser — dropped")
        finally:
            try:
                os.unlink(tmp.name)
            except OSError:
                pass

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
        if self._pubsub is not None:
            try:
                await self._pubsub.unsubscribe(INPUT_CHANNEL)
                # aclose() on redis>=5.0.1, close() on 5.0.0 — support both.
                closer = getattr(self._pubsub, "aclose", None) or self._pubsub.close
                await closer()
            except Exception:  # noqa: BLE001
                pass
