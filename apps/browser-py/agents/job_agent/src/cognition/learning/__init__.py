"""Learning system — turn experience into reusable knowledge (all local).

  • ExperienceStore — append-only JSONL log of every application attempt.
  • PatternLearning — distills episodes into per-domain success/failure patterns
    and surfaces them as hints for future attempts.
"""

from .experience_store import ExperienceStore
from .pattern_learning import PatternLearning

__all__ = ["ExperienceStore", "PatternLearning"]
