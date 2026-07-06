"""Ollama backend — local Ollama server over the loopback, no API key.

Extracted verbatim from the original LocalLLMClient. Uses only the Python
standard library (`urllib`): no SDK, no cloud. Runs whatever model you've pulled
into Ollama (Qwen / Llama / DeepSeek / Mistral …). Blocking HTTP runs in a worker
thread so the async loop stays responsive. JSON-mode (`format: json`) is used
rather than native function-calling for portability across the local model zoo.

Env:
  OLLAMA_HOST         default http://localhost:11434
  OLLAMA_MODEL        default qwen2.5:7b-instruct   (reasoning)
  OLLAMA_EMBED_MODEL  default nomic-embed-text      (semantic memory)
  OLLAMA_NUM_CTX      default 8192
  OLLAMA_TIMEOUT_S    default 180
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import urllib.request
from typing import Any, Dict, List, Optional

log = logging.getLogger("browser-py.job_agent.cognition")

DEFAULT_MODEL = "qwen2.5:7b-instruct"
DEFAULT_EMBED = "nomic-embed-text"


class OllamaBackend:
    """Thin async wrapper over a local Ollama server."""

    def __init__(self):
        self.host = os.environ.get("OLLAMA_HOST", "http://localhost:11434").rstrip("/")
        self.model = os.environ.get("OLLAMA_MODEL", DEFAULT_MODEL)
        self.embed_model = os.environ.get("OLLAMA_EMBED_MODEL", DEFAULT_EMBED)
        self.num_ctx = int(os.environ.get("OLLAMA_NUM_CTX", "8192"))
        self.timeout = float(os.environ.get("OLLAMA_TIMEOUT_S", "180"))
        self._available: Optional[bool] = None

    # ── transport (stdlib only) ───────────────────────────────────────────────

    def _post_sync(self, path: str, payload: Dict[str, Any], timeout: float) -> Dict[str, Any]:
        req = urllib.request.Request(
            self.host + path,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def _get_sync(self, path: str, timeout: float) -> Dict[str, Any]:
        req = urllib.request.Request(self.host + path, method="GET")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))

    # ── availability ──────────────────────────────────────────────────────────

    async def is_available(self) -> bool:
        """True when the local Ollama server is reachable. Cached after first probe."""
        if self._available is not None:
            return self._available
        try:
            tags = await asyncio.to_thread(self._get_sync, "/api/tags", 4.0)
            names = [m.get("name", "") for m in tags.get("models", [])]
            self._available = True
            base = self.model.split(":")[0]
            if self.model not in names and not any(n.split(":")[0] == base for n in names):
                log.warning(
                    "Ollama is up but model '%s' is not pulled. Run: ollama pull %s",
                    self.model, self.model,
                )
        except Exception as exc:  # noqa: BLE001
            log.info(
                "Ollama not reachable at %s (%s). Start it with 'ollama serve' "
                "and 'ollama pull %s'. Falling back to the rule-based flow.",
                self.host, exc, self.model,
            )
            self._available = False
        return self._available

    # ── inference ─────────────────────────────────────────────────────────────

    async def chat(
        self,
        messages: List[Dict[str, Any]],
        *,
        model: Optional[str] = None,
        json_format: bool = False,
        temperature: float = 0.1,
    ) -> str:
        """One chat completion. `messages` are Ollama-native dicts; a user message
        may carry an `images` list (base64) for vision models."""
        payload: Dict[str, Any] = {
            "model": model or self.model,
            "messages": messages,
            "stream": False,
            "options": {"temperature": temperature, "num_ctx": self.num_ctx},
        }
        if json_format:
            payload["format"] = "json"
        resp = await asyncio.to_thread(self._post_sync, "/api/chat", payload, self.timeout)
        return (resp.get("message", {}) or {}).get("content", "") or ""

    async def embed(self, text: str) -> Optional[List[float]]:
        """Embed text with the local embedding model (None if unavailable)."""
        try:
            resp = await asyncio.to_thread(
                self._post_sync, "/api/embeddings",
                {"model": self.embed_model, "prompt": text[:8000]}, 30.0,
            )
            vec = resp.get("embedding")
            return vec if isinstance(vec, list) and vec else None
        except Exception as exc:  # noqa: BLE001
            log.debug("Local embedding failed: %s", exc)
            return None
