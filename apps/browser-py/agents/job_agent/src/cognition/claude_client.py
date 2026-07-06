"""DEPRECATED — the cloud client has been removed.

The agent is now fully local: it uses on-device models via Ollama and requires NO
ANTHROPIC_API_KEY (or any cloud LLM key). This module imports nothing from the
cloud SDK; it only re-exports the local client under the old name so any stale
`from ...claude_client import ClaudeClient` keeps importing cleanly. New code
should use `cognition.models.local_llm.LocalLLMClient` or `cognition.LocalEngine`.

Safe to delete once no imports reference it.
"""

from .models.local_llm import LocalLLMClient

# Back-compat alias — points at the local client (no API key, no network egress).
ClaudeClient = LocalLLMClient

__all__ = ["ClaudeClient", "LocalLLMClient"]
