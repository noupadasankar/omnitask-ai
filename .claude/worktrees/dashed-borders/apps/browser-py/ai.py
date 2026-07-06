"""Optional LLM helper for the browser engine.

Powers the "AI" in AI automation: structured extraction from page text,
summarization, and next-action decisions. Degrades gracefully — if the `openai`
package or OPENAI_API_KEY is missing, callers get None and fall back to pure
DOM heuristics, so the engine always runs.
"""

import json
import logging
import os

log = logging.getLogger("browser-py.ai")


class AIClient:
    def __init__(self):
        self.api_key = os.environ.get("OPENAI_API_KEY")
        self.model = os.environ.get("PY_LLM_MODEL", "gpt-4o-mini")
        self._client = None
        self._openai_ok: bool | None = None

    @property
    def available(self) -> bool:
        # Needs both a key AND the openai package installed. The package is
        # optional (the platform runs LLM-free by default), so probe it once and
        # cache — this keeps AI-using skills from retrying a doomed import per call.
        if not self.api_key:
            return False
        if self._openai_ok is None:
            try:
                import openai  # noqa: F401
                self._openai_ok = True
            except Exception:
                log.info("openai package not installed — AI features disabled, using DOM heuristics.")
                self._openai_ok = False
        return self._openai_ok

    def _ensure(self):
        if self._client is None:
            from openai import AsyncOpenAI  # lazy import

            self._client = AsyncOpenAI(api_key=self.api_key)
        return self._client

    async def extract_json(self, system: str, user: str) -> dict | None:
        """Return a parsed JSON object from the model, or None on any failure."""
        if not self.available:
            return None
        try:
            client = self._ensure()
            resp = await client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user[:12000]},
                ],
                temperature=0.1,
                response_format={"type": "json_object"},
            )
            return json.loads(resp.choices[0].message.content or "{}")
        except Exception as err:  # noqa: BLE001
            log.warning("AI extract_json failed: %s", err)
            return None

    async def summarize(self, text: str, instruction: str) -> str | None:
        if not self.available:
            return None
        try:
            client = self._ensure()
            resp = await client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": instruction},
                    {"role": "user", "content": text[:14000]},
                ],
                temperature=0.2,
            )
            return (resp.choices[0].message.content or "").strip()
        except Exception as err:  # noqa: BLE001
            log.warning("AI summarize failed: %s", err)
            return None
