"""VisionReader — capture the page and understand it visually (local models only)."""

from __future__ import annotations

import base64
import logging
from typing import Optional

from ..models.local_vision import LocalVision
from . import ocr_engine

log = logging.getLogger("browser-py.job_agent.cognition")


class VisionReader:
    def __init__(self, page, vision: LocalVision):
        self.page = page
        self.vision = vision

    async def look(self, question: str) -> str:
        """Screenshot → local vision model (+ optional OCR) → text the reasoning
        model can act on."""
        try:
            png = await self.page.screenshot(type="jpeg", quality=60, full_page=False)
        except Exception as exc:  # noqa: BLE001
            return f"(could not capture screenshot: {exc})"

        ocr_text: Optional[str] = await ocr_engine.ocr(png)
        prompt = question
        if ocr_text:
            prompt += "\n\nOCR text detected on screen:\n" + ocr_text[:1500]

        b64 = base64.b64encode(png).decode("ascii")
        desc = await self.vision.describe(b64, prompt)
        if ocr_text and desc.startswith("(vision unavailable"):
            # Vision model missing but OCR worked — still useful.
            return "Vision model unavailable; OCR text on screen:\n" + ocr_text[:1500]
        return desc
