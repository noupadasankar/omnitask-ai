"""The brain — reasoning, planning, decision, and reflection (local models).

  • reasoning_engine — picks the next action as a JSON object each turn.
  • planner          — decomposes a goal into ordered subgoals (autonomous task
                       decomposition), no hardcoded workflow.
  • decision_engine  — the confidence/risk gate (proceed vs. escalate).
  • reflection       — post-attempt "what worked / what to improve" → lessons.
"""

from .reasoning_engine import ReasoningEngine, NextAction
from .planner import Planner
from .decision_engine import DecisionEngine
from .reflection import Reflection
from .critic import Critic, Critique, hard_block

__all__ = ["ReasoningEngine", "NextAction", "Planner", "DecisionEngine",
           "Reflection", "Critic", "Critique", "hard_block"]
