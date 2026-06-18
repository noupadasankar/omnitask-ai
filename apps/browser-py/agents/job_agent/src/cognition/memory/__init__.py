"""Memory architecture — working, long-term, and semantic memory (all local).

  • ShortMemory  — volatile working memory for the current attempt.
  • LongMemory   — durable JSON store: user profile, lessons, application history.
  • VectorMemory — semantic memory via local embeddings (degrades to keyword search).

Everything persists to local files under data/memory/. No external store.
"""

from .short_memory import ShortMemory
from .long_memory import LongMemory
from .vector_memory import VectorMemory
from .selector_memory import SelectorMemory

__all__ = ["ShortMemory", "LongMemory", "VectorMemory", "SelectorMemory"]
