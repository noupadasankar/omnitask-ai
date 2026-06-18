"""Local vision-language model — screenshot understanding, fully on-device.

Runs a local multimodal model (default `qwen2.5vl:7b`) via the same Ollama server
as the reasoning model. It returns a *text* description, which the reasoning model
(which may be text-only) consumes — so the two compose without needing a single
multimodal brain. No API key, no cloud.

Env: OLLAMA_VISION_MODEL (default qwen2.5vl:7b).
"""

from __future__ import annotations

import logging
import os
from typing import Optional

from .local_llm import LocalLLMClient

log = logging.getLogger("browser-py.job_agent.cognition")

DEFAULT_VISION_MODEL = "qwen2.5vl:7b"


class LocalVision:
    def __init__(self, llm: LocalLLMClient, model: Optional[str] = None):
        self.llm = llm
        self.model = model or os.environ.get("OLLAMA_VISION_MODEL", DEFAULT_VISION_MODEL)

    async def describe(self, image_b64: str, question: str) -> str:
        """Answer a question about a screenshot. Returns a text description, or a
        short '(vision unavailable …)' marker the loop can reason around."""
        messages = [{
            "role": "user",
            "content": (
                "You are a precise UI-vision assistant for a web automation agent. "
                "Describe only what is visible and relevant. Question: " + question
            ),
            "images": [image_b64],
        }]
        try:
            out = await self.llm.chat(messages, model=self.model, temperature=0.1)
            return (out or "").strip() or "(vision returned no description)"
        except Exception as exc:  # noqa: BLE001
            log.info("Local vision model '%s' unavailable: %s", self.model, exc)
            return f"(vision unavailable: pull a vision model with 'ollama pull {self.model}')"
