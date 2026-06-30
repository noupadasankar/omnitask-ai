"""Cognitive core for the job agent — fully local, no API key, no cloud.

A self-operating observe → reason → act → verify loop that runs ANY recruitment
site by perception and reasoning (not site-specific scripts), powered entirely by
local models (Ollama: reasoning + vision + embeddings). It maintains a world
model, plans, gates risky actions, escalates instead of fabricating, and learns
from every attempt.

Structure (the spec's architecture):
  models/      local LLM + vision clients (no API key)
  perception   DOM reader (perception.py) + vision/ (screenshot + OCR)
  browser      action executor (browser_tools.py) — universal computer-use layer
  brain/       reasoning, planning, decision (confidence/risk), reflection
  memory/      short / long / vector (semantic) memory
  learning/    experience store + pattern learning

LLM-first with rule-based fallback: when the local engine is unreachable, portals
fall back to their deterministic flow, so the platform still runs.
"""

from .engine import LocalEngine
from .models import LocalLLMClient
from .applier import CognitiveApplier
from .task_agent import TaskAgent
from .task_spec import TaskSpec

__all__ = ["LocalEngine", "LocalLLMClient", "CognitiveApplier", "TaskAgent", "TaskSpec"]
