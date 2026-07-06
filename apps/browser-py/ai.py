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
        self.api_key = os.environ.get("GROQ_API_KEY") or os.environ.get("OPENAI_API_KEY")
        self.base_url = os.environ.get("LLM_BASE_URL") or (
            "https://api.groq.com/openai/v1" if os.environ.get("GROQ_API_KEY") else None
        )
        self.model = os.environ.get("PY_LLM_MODEL", "llama-3.3-70b-versatile")
        self.vision_model = os.environ.get("PY_VISION_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct")
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

            self._client = AsyncOpenAI(api_key=self.api_key, base_url=self.base_url)
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

    @property
    def vision_available(self) -> bool:
        """True when we have an OpenAI key AND the openai package is installed."""
        return self.available

    async def decide_action(
        self,
        screenshot_b64: str,
        dom_nodes: list,
        goal: str,
        history: list[dict],
        *,
        url: str = "",
        title: str = "",
    ) -> dict:
        """Vision-based next-action decision.

        Returns:
            {
              "thought": str,          # agent's reasoning
              "action": str,           # navigate|click|type|select|scroll|wait|done|extract
              "target": str | None,    # CSS selector
              "value": str | None,     # URL / text / key / pixels
              "consequential": bool,   # true = needs approval gate
              "done": bool,            # true = goal achieved
              "result": str,           # summary when done=true
            }
        """
        if not self.available:
            return {"done": True, "result": "AI unavailable", "action": "done",
                    "thought": "", "target": None, "value": None, "consequential": False}

        # Compact DOM: only visible interactive nodes, truncated
        visible = [
            n for n in dom_nodes
            if n.get("visible") and (n.get("text") or n.get("ariaLabel"))
        ][:60]
        dom_text = "\n".join(
            f"[{n['selector']}] {n['role']} text={n['text']!r} aria={n['ariaLabel']!r}"
            for n in visible
        )

        history_text = ""
        if history:
            history_text = "PREVIOUS ACTIONS (most recent last):\n" + "\n".join(
                f"  step {i+1}: {h.get('action')} target={h.get('target')!r} "
                f"value={h.get('value')!r} → {h.get('thought','')}"
                for i, h in enumerate(history[-8:])
            )

        system = (
            "You are an expert browser automation agent. "
            "You see the current page screenshot and interactive elements. "
            "Choose ONE next action to make progress toward the goal.\n\n"
            "Respond ONLY with a JSON object:\n"
            "{\n"
            '  "thought": "brief reasoning",\n'
            '  "action": "navigate|click|type|select|scroll|wait|extract|done",\n'
            '  "target": "css_selector_or_null",\n'
            '  "value": "url_or_text_or_pixels_or_null",\n'
            '  "consequential": false,\n'
            '  "done": false,\n'
            '  "result": "summary when done=true else empty"\n'
            "}\n\n"
            "consequential=true for: form submit, purchase, send message, delete, login.\n"
            'Set done=true and fill result when the goal is fully achieved.\n'
            'action="extract" to collect data from page (no browser action).'
        )

        user_parts: list = [
            {
                "type": "text",
                "text": (
                    f"GOAL: {goal}\n\n"
                    f"PAGE URL: {url}\nPAGE TITLE: {title}\n\n"
                    f"INTERACTIVE ELEMENTS:\n{dom_text or '(none visible)'}\n\n"
                    f"{history_text}"
                ),
            },
            {
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{screenshot_b64}", "detail": "high"},
            },
        ]

        try:
            client = self._ensure()
            resp = await client.chat.completions.create(
                model=self.vision_model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user_parts},
                ],
                temperature=0.1,
                response_format={"type": "json_object"},
                max_tokens=512,
            )
            raw = json.loads(resp.choices[0].message.content or "{}")
            return {
                "thought": str(raw.get("thought", "")),
                "action": str(raw.get("action", "done")),
                "target": raw.get("target") or None,
                "value": str(raw.get("value")) if raw.get("value") is not None else None,
                "consequential": bool(raw.get("consequential", False)),
                "done": bool(raw.get("done", False)),
                "result": str(raw.get("result", "")),
            }
        except Exception as err:  # noqa: BLE001
            log.warning("AI decide_action failed: %s", err)
            return {"done": True, "result": f"AI error: {err}", "action": "done",
                    "thought": "", "target": None, "value": None, "consequential": False}
