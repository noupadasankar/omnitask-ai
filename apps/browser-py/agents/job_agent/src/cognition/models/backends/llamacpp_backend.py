"""llama.cpp backend — fully in-process inference, no server, no HTTP, no key.

This is the end-state brain: TaskAgent → ReasoningEngine → LocalLLMClient →
LlamaCppBackend → llama-cpp-python → GGUF, all inside the browser-py process.
A blocking `Llama` call runs in a worker thread so the async loop stays
responsive, mirroring the Ollama backend's threading.

Models are loaded LAZILY on first use and cached per (path) as process-wide
singletons, so concurrent sessions share one resident model instead of each
loading its own multi-GB weights. Because that one instance is shared, inference
is serialized per model (a `Llama` is not reentrant) — see `_infer_lock_for`.

Scope (per the chosen Increment-3 slice): text reasoning (chat / chat-json) +
optional text embeddings. VISION is NOT supported here — `chat(images=…)` returns
a clean "(vision unavailable)" marker and the cognitive loop degrades to DOM-only
reasoning (it already handles an absent vision model). Add an mmproj/vision GGUF
later to close that gap.

Env:
  LLAMACPP_MODEL_PATH         path to the reasoning .gguf (REQUIRED to enable)
  LLAMACPP_EMBED_MODEL_PATH   path to an embedding .gguf (optional)
  LLAMACPP_N_CTX              context window      (default 8192)
  LLAMACPP_N_GPU_LAYERS       layers offloaded to GPU (default 0 = CPU; -1 = all)
  LLAMACPP_N_THREADS          CPU threads         (default: library default)
  LLAMACPP_CHAT_FORMAT        optional chat template name for the model
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import threading
from typing import Any, Dict, List, Optional

log = logging.getLogger("browser-py.job_agent.cognition")

# Process-wide model cache: { model_path: Llama }. Guarded by a lock so two
# sessions racing on first use don't both pay the multi-GB load.
_MODELS: Dict[str, Any] = {}
_MODELS_LOCK = threading.Lock()

# Per-model INFERENCE locks. A llama-cpp-python `Llama` is NOT reentrant: two
# threads calling create_chat_completion / create_embedding on the SAME instance
# concurrently corrupt its KV cache (or crash). Since one resident model is shared
# across every session (see _MODELS), concurrent sessions WOULD race on it. We
# serialize inference per resident model — one lock keyed by model path — so calls
# queue instead of colliding. Different models (reasoning vs embeddings) hold
# different locks and still run concurrently. (The Ollama backend needs none of
# this: the Ollama server serializes requests itself.)
_INFER_LOCKS: Dict[str, threading.Lock] = {}
_INFER_LOCKS_GUARD = threading.Lock()


def _infer_lock_for(path: str) -> threading.Lock:
    """Return the process-wide inference lock for a given resident model path."""
    with _INFER_LOCKS_GUARD:
        lock = _INFER_LOCKS.get(path)
        if lock is None:
            lock = threading.Lock()
            _INFER_LOCKS[path] = lock
        return lock


def _strip_json(raw: str) -> str:
    """llama.cpp JSON-grammar output is usually clean, but be defensive about
    models that wrap the object in prose/code fences."""
    if not raw:
        return raw
    try:
        json.loads(raw)
        return raw
    except Exception:
        pass
    m = re.search(r"\{.*\}", raw, re.DOTALL)
    return m.group(0) if m else raw


class LlamaCppBackend:
    """In-process llama-cpp-python backend (text + optional embeddings)."""

    def __init__(self):
        self.model_path = os.environ.get("LLAMACPP_MODEL_PATH", "")
        self.embed_model_path = os.environ.get("LLAMACPP_EMBED_MODEL_PATH", "")
        self.num_ctx = int(os.environ.get("LLAMACPP_N_CTX", "8192"))
        self.n_gpu_layers = int(os.environ.get("LLAMACPP_N_GPU_LAYERS", "0"))
        self.n_threads = os.environ.get("LLAMACPP_N_THREADS")
        self.chat_format = os.environ.get("LLAMACPP_CHAT_FORMAT") or None
        # Interface parity with the Ollama backend (used for logging labels).
        self.host = "in-process:llama.cpp"
        self.model = os.path.basename(self.model_path) or "(no GGUF configured)"
        self.embed_model = os.path.basename(self.embed_model_path) or ""
        self._available: Optional[bool] = None

    # ── lazy model loading ────────────────────────────────────────────────────

    def _load_sync(self, path: str, *, embedding: bool) -> Any:
        """Load (or return cached) a Llama model. Raises if llama_cpp is missing
        or the GGUF can't be loaded — callers turn that into is_available=False."""
        with _MODELS_LOCK:
            cached = _MODELS.get(path)
            if cached is not None:
                return cached
            from llama_cpp import Llama  # local import: optional dependency
            kwargs: Dict[str, Any] = {
                "model_path": path,
                "n_ctx": self.num_ctx,
                "n_gpu_layers": self.n_gpu_layers,
                "verbose": False,
            }
            if embedding:
                kwargs["embedding"] = True
            if self.n_threads:
                try:
                    kwargs["n_threads"] = int(self.n_threads)
                except ValueError:
                    pass
            if self.chat_format and not embedding:
                kwargs["chat_format"] = self.chat_format
            model = Llama(**kwargs)
            _MODELS[path] = model
            return model

    # ── availability ──────────────────────────────────────────────────────────

    async def is_available(self) -> bool:
        """True only when a reasoning GGUF is configured AND actually loads.
        Cached after the first probe (the load itself is the probe)."""
        if self._available is not None:
            return self._available
        if not self.model_path or not os.path.exists(self.model_path):
            if self.model_path:
                log.warning("LLAMACPP_MODEL_PATH set but file not found: %s", self.model_path)
            self._available = False
            return False
        try:
            await asyncio.to_thread(self._load_sync, self.model_path, embedding=False)
            self._available = True
            log.info("llama.cpp backend ready (model=%s, n_gpu_layers=%s).",
                     self.model, self.n_gpu_layers)
        except Exception as exc:  # noqa: BLE001
            log.warning(
                "llama.cpp backend unavailable (%s). Install with "
                "`pip install llama-cpp-python` and set LLAMACPP_MODEL_PATH to a .gguf. "
                "Falling back.", exc,
            )
            self._available = False
        return self._available

    # ── inference ─────────────────────────────────────────────────────────────

    def _chat_sync(self, messages: List[Dict[str, Any]], json_format: bool,
                   temperature: float) -> str:
        # Capture the active path ONCE so a concurrent reload() can't load one
        # model but lock a different one (a single call is atomic w.r.t. a swap).
        path = self.model_path
        model = self._load_sync(path, embedding=False)
        kwargs: Dict[str, Any] = {
            "messages": messages,
            "temperature": temperature,
            "max_tokens": 1024,
        }
        if json_format:
            # Constrain output to a JSON object via llama.cpp's built-in grammar.
            kwargs["response_format"] = {"type": "json_object"}
        # Serialize inference on this resident model (Llama is not reentrant).
        with _infer_lock_for(path):
            out = model.create_chat_completion(**kwargs)
        return (out["choices"][0]["message"].get("content") or "") if out.get("choices") else ""

    async def chat(
        self,
        messages: List[Dict[str, Any]],
        *,
        model: Optional[str] = None,  # ignored — single in-process model
        json_format: bool = False,
        temperature: float = 0.1,
    ) -> str:
        # Vision (image messages) is not supported by this text backend; degrade
        # gracefully so the loop reasons DOM-only instead of crashing.
        if any("images" in m for m in messages):
            return "(vision unavailable: llama.cpp text backend has no vision model)"
        # Strip any image keys defensively (a text GGUF rejects them).
        clean = [{k: v for k, v in m.items() if k != "images"} for m in messages]
        raw = await asyncio.to_thread(self._chat_sync, clean, json_format, temperature)
        return _strip_json(raw) if json_format else raw

    def _embed_sync(self, text: str) -> Optional[List[float]]:
        path = self.embed_model_path
        model = self._load_sync(path, embedding=True)
        with _infer_lock_for(path):
            out = model.create_embedding(text[:8000])
        data = out.get("data") if isinstance(out, dict) else None
        if data and isinstance(data, list):
            vec = data[0].get("embedding")
            if isinstance(vec, list) and vec:
                return vec
        return None

    async def embed(self, text: str) -> Optional[List[float]]:
        if not self.embed_model_path or not os.path.exists(self.embed_model_path):
            return None  # VectorMemory degrades to keyword overlap
        try:
            return await asyncio.to_thread(self._embed_sync, text)
        except Exception as exc:  # noqa: BLE001
            log.debug("llama.cpp embedding failed: %s", exc)
            return None

    # ── hot-swap (lock-coordinated) ────────────────────────────────────────────

    def _evict(self, path: str) -> None:
        """Free a resident model once its in-flight inference drains.

        Acquiring the model's inference lock blocks until any running
        create_chat_completion on it finishes; only then do we drop it from the
        cache so its weights can be freed. New calls already target the new model,
        so nothing fresh waits on this lock."""
        with _infer_lock_for(path):
            with _MODELS_LOCK:
                _MODELS.pop(path, None)

    async def reload(self, new_path: str) -> bool:
        """Hot-swap the resident reasoning model to `new_path`, safely.

        In-flight inference is NEVER interrupted: the new model is pre-loaded, the
        active path is swapped atomically (subsequent calls capture it — see
        `_chat_sync`), and the OLD model is evicted only after its inference lock
        drains. Returns True on success, False (keeping the current model) on a
        missing path or load failure.
        """
        if not new_path or not os.path.exists(new_path):
            log.warning("reload: model path missing or not found: %s", new_path)
            return False
        old_path = self.model_path
        if new_path == old_path:
            return True
        try:
            # Pre-load (or cache-hit) the new model BEFORE swapping, off the loop,
            # so a load failure leaves the current model fully intact.
            await asyncio.to_thread(self._load_sync, new_path, embedding=False)
        except Exception as exc:  # noqa: BLE001
            log.warning("reload: failed to load %s (%s); keeping current model.", new_path, exc)
            return False
        # Atomic swap: from here, new calls use new_path; in-flight calls that
        # already captured old_path keep running the old model under its own lock.
        self.model_path = new_path
        self.model = os.path.basename(new_path)
        self._available = True
        if old_path:
            await asyncio.to_thread(self._evict, old_path)
        log.info("reload: active reasoning model is now %s.", self.model)
        return True
