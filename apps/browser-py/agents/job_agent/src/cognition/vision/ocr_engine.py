"""On-device OCR — optional, fully local.

Uses Tesseract via `pytesseract` + Pillow when installed. If they're not present
(or the Tesseract binary is missing), OCR degrades to a no-op and the agent simply
relies on the vision model + DOM. No cloud OCR.

To enable: pip install pytesseract pillow  +  install the Tesseract binary.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

log = logging.getLogger("browser-py.job_agent.cognition")

_PROBED: Optional[bool] = None


def available() -> bool:
    global _PROBED
    if _PROBED is None:
        try:
            import pytesseract  # noqa: F401
            from PIL import Image  # noqa: F401
            _PROBED = True
        except Exception:
            _PROBED = False
    return _PROBED


def _ocr_sync(image_bytes: bytes) -> str:
    import io
    import pytesseract
    from PIL import Image

    img = Image.open(io.BytesIO(image_bytes))
    return pytesseract.image_to_string(img) or ""


async def ocr(image_bytes: bytes) -> Optional[str]:
    """Return extracted text, or None if OCR isn't available/failed."""
    if not available():
        return None
    try:
        text = await asyncio.to_thread(_ocr_sync, image_bytes)
        text = (text or "").strip()
        return text or None
    except Exception as exc:  # noqa: BLE001
        log.debug("OCR failed: %s", exc)
        return None
