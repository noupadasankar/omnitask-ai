"""Working memory — volatile state for the current application attempt."""

from __future__ import annotations

from collections import deque
from typing import Any, Deque, Dict, List, Optional


class ShortMemory:
    """Holds the agent's immediate context: goal, current page, recent actions."""

    def __init__(self, max_actions: int = 12):
        self.goal: str = ""
        self.current_url: str = ""
        self.page_title: str = ""
        self.subgoals: List[str] = []
        self.facts: Dict[str, Any] = {}
        self._actions: Deque[str] = deque(maxlen=max_actions)

    def record_action(self, action: str) -> None:
        self._actions.append(action)

    @property
    def recent_actions(self) -> List[str]:
        return list(self._actions)

    def remember(self, key: str, value: Any) -> None:
        self.facts[key] = value

    def recall(self, key: str, default: Optional[Any] = None) -> Any:
        return self.facts.get(key, default)

    def snapshot(self) -> Dict[str, Any]:
        return {
            "goal": self.goal,
            "currentUrl": self.current_url,
            "pageTitle": self.page_title,
            "subgoals": self.subgoals,
            "recentActions": self.recent_actions,
        }
