"""Vision layer — the agent's eyes.

`VisionReader` captures a screenshot of the live page and asks the local vision
model what's there (optionally augmented by on-device OCR), so the agent can read
visual-only state — popups, canvas widgets, custom controls — that the DOM doesn't
expose. Fully local; no cloud OCR/vision service.
"""

from .vision_reader import VisionReader

__all__ = ["VisionReader"]
