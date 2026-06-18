"""LocalEngine — the fully self-contained cognitive engine (no API key, no cloud).

Bundles the shared, durable pieces the agent reuses across every application:
  • llm           — local reasoning model (Ollama)
  • vision        — local vision-language model
  • long_memory   — durable profile / lessons / history
  • vector_memory — semantic recall via local embeddings
  • selector_memory — per-site "wisdom cache" of known-good control selectors
  • experiences   — episodic log of attempts
  • patterns      — per-site learned hints distilled from experience

The orchestrator builds ONE of these and hands it to every portal; each
application attempt gets its own `CognitiveApplier` that borrows these shared
stores so learning accumulates across jobs and runs.
"""

from __future__ import annotations

import logging

from .learning import ExperienceStore, PatternLearning
from .memory import LongMemory, SelectorMemory, VectorMemory
from .models.local_llm import LocalLLMClient
from .models.local_vision import LocalVision

log = logging.getLogger("browser-py.job_agent.cognition")


class LocalEngine:
    def __init__(self):
        self.llm = LocalLLMClient()
        self.vision = LocalVision(self.llm)
        self.long_memory = LongMemory()
        self.vector_memory = VectorMemory(self.llm)
        self.selector_memory = SelectorMemory()
        self.experiences = ExperienceStore()
        self.patterns = PatternLearning(self.experiences)

    @property
    def host(self) -> str:
        return self.llm.host

    @property
    def model(self) -> str:
        return self.llm.model

    async def is_available(self) -> bool:
        """True when the local model server (Ollama) is reachable."""
        return await self.llm.is_available()
