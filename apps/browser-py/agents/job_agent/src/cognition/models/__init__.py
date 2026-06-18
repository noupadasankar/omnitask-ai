"""Local AI model layer — runs entirely on the user's machine, no API key.

`local_llm.LocalLLMClient` is a backend-agnostic reasoning client: it selects an
inference backend (see `backends/`) by the `COG_LLM_BACKEND` env var — a local
Ollama server (loopback HTTP, stdlib only) or fully in-process llama-cpp-python
(no server, no HTTP). `local_vision.LocalVision` runs a local vision-language
model for screenshot understanding (Ollama path; the llama.cpp text backend
degrades to DOM-only). Nothing here calls out to a paid service.
"""

from .local_llm import LocalLLMClient
from .local_vision import LocalVision

__all__ = ["LocalLLMClient", "LocalVision"]
