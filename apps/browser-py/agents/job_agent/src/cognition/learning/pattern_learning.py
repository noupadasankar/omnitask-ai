"""Pattern learning — distil episodes into per-domain hints for future attempts.

Aggregates the ExperienceStore log into success/failure tallies and recurring
lessons per site domain, and renders a short hint block injected into the
reasoning prompt. Pure local computation — the "agent gets better over time"
loop without any training or cloud service.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Dict, List
from urllib.parse import urlparse

from .experience_store import ExperienceStore


def domain_of(url: str) -> str:
    try:
        return (urlparse(url).hostname or "").replace("www.", "")
    except Exception:
        return ""


class PatternLearning:
    def __init__(self, store: ExperienceStore):
        self.store = store

    def stats_for(self, domain: str) -> Dict[str, int]:
        succ = fail = 0
        for ep in self.store.all():
            if ep.get("domain") != domain:
                continue
            if ep.get("outcome") in ("submitted", "already_applied"):
                succ += 1
            elif ep.get("outcome") in ("abandoned", "blocked"):
                fail += 1
        return {"successes": succ, "failures": fail}

    def hints_for(self, domain: str, *, limit: int = 6) -> List[str]:
        """Recurring lessons recorded on this domain, most-recent first."""
        lessons: List[str] = []
        seen = set()
        for ep in reversed(self.store.all()):
            if ep.get("domain") != domain:
                continue
            for lesson in ep.get("lessons", []) or []:
                key = lesson.strip().lower()
                if key and key not in seen:
                    seen.add(key)
                    lessons.append(lesson.strip())
                if len(lessons) >= limit:
                    return lessons
        return lessons

    def render_hint_block(self, domain: str) -> str:
        if not domain:
            return ""
        stats = self.stats_for(domain)
        hints = self.hints_for(domain)
        if not hints and stats["successes"] + stats["failures"] == 0:
            return ""
        lines = [f"LEARNED EXPERIENCE for {domain} "
                 f"(prior: {stats['successes']} ok / {stats['failures']} failed):"]
        for h in hints:
            lines.append(f"  - {h}")
        return "\n".join(lines)
