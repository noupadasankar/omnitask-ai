"""LocalLLMClient — the single brain interface every cognition module depends on.

This is a thin SELECTOR over pluggable inference backends (see
`models/backends/`). It owns no transport itself: it picks a backend at
construction and forwards `chat` / `chat_json` / `embed` / `is_available` to it,
exposing the same `host` / `model` / `embed_model` labels for logging. So the
brain can move from a local Ollama server to fully in-process llama.cpp without
touching TaskAgent, ReasoningEngine, Critic, VectorMemory, or LocalVision.

Backend selection — env `COG_LLM_BACKEND`:
  auto      (default) → llama.cpp when LLAMACPP_MODEL_PATH points at a real GGUF,
                        otherwise Ollama. Lets you flip to in-process just by
                        setting the model path, with zero risk to existing runs.
  llamacpp           → force the in-process llama-cpp-python backend.
  ollama             → force the local Ollama server backend.

JSON-mode (`chat_json`) parsing is done HERE so both backends share the same
lenient parser (models occasionally wrap the object in prose/code fences).
"""

from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

from .backends.ollama_backend import OllamaBackend, DEFAULT_EMBED, DEFAULT_MODEL

log = logging.getLogger("browser-py.job_agent.cognition")


def _loads_lenient(raw: str) -> Dict[str, Any]:
    """Parse a JSON object, tolerating models that wrap it in prose/code fences."""
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except Exception:
        pass
    stripped = raw.strip().strip("`")
    stripped = re.sub(r"^json\s*", "", stripped, flags=re.IGNORECASE)
    try:
        return json.loads(stripped)
    except Exception:
        pass
    m = re.search(r"\{.*\}", raw, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except Exception:
            return {}
    return {}


def _registry_production_path() -> Optional[str]:
    """The registry's current production GGUF (None if disabled, unset, or the
    file is missing). Honors COG_MODEL_REGISTRY_PATH for the registry-file
    location; disable the whole mechanism with COG_MODEL_REGISTRY=false."""
    if os.environ.get("COG_MODEL_REGISTRY", "true").strip().lower() in (
        "0", "false", "no", "off",
    ):
        return None
    try:
        from .model_registry import ModelRegistry, sha256_of  # lazy: avoids import cycle
        reg_file = os.environ.get("COG_MODEL_REGISTRY_PATH")
        reg = ModelRegistry(Path(reg_file)) if reg_file else ModelRegistry()
        path = reg.production_path()
        if not (path and os.path.exists(path)):
            return None
        # Opt-in integrity check (COG_MODEL_VERIFY): hashing a multi-GB GGUF adds
        # startup latency, so it's off by default but recommended for enterprise.
        if os.environ.get("COG_MODEL_VERIFY", "false").strip().lower() in (
            "1", "true", "yes", "on",
        ):
            prod = reg.production() or {}
            expected = prod.get("sha256")
            if expected and sha256_of(path) != expected:
                log.warning(
                    "Model integrity check FAILED for %s (sha256 mismatch); falling "
                    "back to the configured base model.", path,
                )
                return None
        return path
    except Exception as exc:  # noqa: BLE001 — registry is best-effort
        log.debug("registry production lookup failed: %s", exc)
        return None


def _select_backend():
    """Choose the inference backend from COG_LLM_BACKEND (default: auto).

    The registry's PRODUCTION model (a fine-tuned GGUF promoted by the training
    loop) takes precedence over LLAMACPP_MODEL_PATH, so a freshly promoted model is
    picked up on the engine's next start — that's the boot-time half of the
    self-improvement loop. Disable with COG_MODEL_REGISTRY=false.
    """
    choice = (os.environ.get("COG_LLM_BACKEND", "auto") or "auto").strip().lower()
    reg_path = _registry_production_path()
    env_path = os.environ.get("LLAMACPP_MODEL_PATH", "")
    # Registry production wins over the env base path (that is HOW a promotion
    # takes effect); fall back to the env path before anything has been promoted.
    effective = reg_path or env_path

    def _make_llamacpp():
        from .backends.llamacpp_backend import LlamaCppBackend
        backend = LlamaCppBackend()
        if reg_path and reg_path != backend.model_path:
            backend.model_path = reg_path
            backend.model = os.path.basename(reg_path)
            log.info("Boot: using registry production model %s.", backend.model)
        return backend

    if choice == "ollama":
        return OllamaBackend()
    if choice == "llamacpp":
        return _make_llamacpp()
    # auto: prefer in-process llama.cpp when a real GGUF is available.
    if effective and os.path.exists(effective):
        log.info("COG_LLM_BACKEND=auto → using in-process llama.cpp (GGUF available).")
        return _make_llamacpp()
    return OllamaBackend()


class LocalLLMClient:
    """Backend-agnostic local reasoning client. Interface is stable; the engine
    underneath (Ollama HTTP vs in-process llama.cpp) is selected by env."""

    def __init__(self):
        self._backend = _select_backend()

    # ── logging labels (forwarded) ─────────────────────────────────────────────

    @property
    def host(self) -> str:
        return getattr(self._backend, "host", "unknown")

    @property
    def model(self) -> str:
        return getattr(self._backend, "model", DEFAULT_MODEL)

    @property
    def embed_model(self) -> str:
        return getattr(self._backend, "embed_model", DEFAULT_EMBED)

    # ── availability ────────────────────────────────────────────────────────────

    async def is_available(self) -> bool:
        return await self._backend.is_available()

    # ── inference (forwarded to the selected backend) ───────────────────────────

    async def chat(
        self,
        messages: List[Dict[str, Any]],
        *,
        model: Optional[str] = None,
        json_format: bool = False,
        temperature: float = 0.1,
    ) -> str:
        return await self._backend.chat(
            messages, model=model, json_format=json_format, temperature=temperature
        )

    async def chat_json(self, messages: List[Dict[str, Any]], **kw) -> Dict[str, Any]:
        """Chat in JSON mode and parse the result leniently (shared by backends)."""
        raw = await self.chat(messages, json_format=True, **kw)
        return _loads_lenient(raw)

    async def embed(self, text: str) -> Optional[List[float]]:
        return await self._backend.embed(text)

    # ── hot-swap (forwarded to backends that support it) ───────────────────────

    @property
    def model_path(self) -> str:
        """The active reasoning model's path (empty for server backends)."""
        return getattr(self._backend, "model_path", "")

    async def reload(self, new_path: str) -> bool:
        """Hot-swap the active reasoning model, in-flight-safe. Only the in-process
        llama.cpp backend has resident weights to swap; the Ollama backend has no
        local weights (switch models via OLLAMA_MODEL instead), so this is a no-op
        there and returns False."""
        backend = self._backend
        if hasattr(backend, "reload"):
            return await backend.reload(new_path)
        log.debug("reload: backend %s has no hot-swap; ignoring.", type(backend).__name__)
        return False

    async def reload_from_registry(self, registry) -> bool:
        """Swap to the registry's current production model, if one is set."""
        path = registry.production_path()
        if not path:
            return False
        return await self.reload(path)
