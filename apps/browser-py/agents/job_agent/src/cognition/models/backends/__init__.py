"""Pluggable inference backends behind LocalLLMClient.

The whole cognition layer depends on ONE interface (see `LLMBackend`): a small
async surface for chat / chat-json / embed / availability, plus `host`/`model`
labels for logging. `LocalLLMClient` selects a concrete backend at construction:

  • OllamaBackend   — local Ollama server over loopback HTTP (the original path).
  • LlamaCppBackend — fully in-process llama-cpp-python (no server, no HTTP).

Swapping the brain is therefore a backend choice, not a change to TaskAgent /
ReasoningEngine / Critic / memory — they only ever see LocalLLMClient.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Protocol, runtime_checkable


@runtime_checkable
class LLMBackend(Protocol):
    """Minimal contract every inference backend must satisfy."""

    host: str
    model: str
    embed_model: str

    async def is_available(self) -> bool: ...

    async def chat(
        self,
        messages: List[Dict[str, Any]],
        *,
        model: Optional[str] = None,
        json_format: bool = False,
        temperature: float = 0.1,
    ) -> str: ...

    async def embed(self, text: str) -> Optional[List[float]]: ...
