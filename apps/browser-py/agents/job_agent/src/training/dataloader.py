"""dataloader.py — stream the exported ChatML JSONL into training examples.

Pure standard library: it never touches the database (the backend `train:export`
script already did that) and pulls no ML deps, so it stays importable and unit-
testable without a GPU or `transformers`. The future `finetune.py` imports
`load_examples`/`batched` to feed QLoRA.

Each input line (produced by apps/backend/src/training/export-trajectories.ts):
    {"messages":[{"role":"system",...},{"role":"user",...},{"role":"assistant",...}],
     "meta":{"sessionId":...,"stepIndex":...,"domain":...,"grade":"GOLD"}}

We validate the ChatML shape, drop malformed lines (logged, not fatal), and yield
typed examples. A line is valid only if it has a non-empty assistant turn whose
content parses as JSON (the action label the agent must learn to produce).
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, Iterator, List, Optional

log = logging.getLogger("browser-py.job_agent.training")

_REQUIRED_ROLES = ("system", "user", "assistant")


@dataclass
class ChatMLExample:
    """One validated training example: a ChatML message list + its metadata."""

    messages: List[Dict[str, str]]
    meta: Dict[str, Any] = field(default_factory=dict)

    @property
    def grade(self) -> str:
        return str(self.meta.get("grade", ""))

    @property
    def domain(self) -> str:
        return str(self.meta.get("domain", "") or "")

    @property
    def target(self) -> str:
        """The assistant turn — the action JSON the model must learn to output."""
        for m in reversed(self.messages):
            if m.get("role") == "assistant":
                return m.get("content", "")
        return ""


def _validate(obj: Any) -> Optional[ChatMLExample]:
    if not isinstance(obj, dict):
        return None
    messages = obj.get("messages")
    if not isinstance(messages, list) or not messages:
        return None
    roles = {m.get("role") for m in messages if isinstance(m, dict)}
    if not all(r in roles for r in _REQUIRED_ROLES):
        return None
    # Every message needs a string content.
    for m in messages:
        if not isinstance(m, dict) or not isinstance(m.get("content"), str):
            return None
    # The assistant turn must be valid JSON (it's the action label).
    assistant = next(
        (m["content"] for m in reversed(messages) if m.get("role") == "assistant"), ""
    )
    if not assistant.strip():
        return None
    try:
        json.loads(assistant)
    except Exception:
        return None
    meta = obj.get("meta") if isinstance(obj.get("meta"), dict) else {}
    return ChatMLExample(messages=messages, meta=meta)


def iter_examples(
    path: str | Path,
    *,
    grades: Optional[Iterable[str]] = None,
    domains: Optional[Iterable[str]] = None,
) -> Iterator[ChatMLExample]:
    """Stream validated examples from a JSONL file, optionally filtered by grade
    and/or domain. Malformed lines are skipped (counted in the log), not fatal."""
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"Trajectory JSONL not found: {p}")
    grade_set = {g.upper() for g in grades} if grades else None
    domain_set = set(domains) if domains else None

    total = kept = bad = 0
    with p.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            total += 1
            try:
                obj = json.loads(line)
            except Exception:
                bad += 1
                continue
            ex = _validate(obj)
            if ex is None:
                bad += 1
                continue
            if grade_set and ex.grade.upper() not in grade_set:
                continue
            if domain_set and ex.domain not in domain_set:
                continue
            kept += 1
            yield ex
    log.info("dataloader: %d lines, %d valid kept, %d skipped (%s)", total, kept, bad, p)


def load_examples(path: str | Path, **kw) -> List[ChatMLExample]:
    """Eagerly load all (filtered) examples into a list."""
    return list(iter_examples(path, **kw))


def batched(examples: Iterable[ChatMLExample], size: int) -> Iterator[List[ChatMLExample]]:
    """Yield fixed-size batches (the last batch may be smaller)."""
    if size < 1:
        raise ValueError("batch size must be >= 1")
    batch: List[ChatMLExample] = []
    for ex in examples:
        batch.append(ex)
        if len(batch) >= size:
            yield batch
            batch = []
    if batch:
        yield batch


if __name__ == "__main__":
    # Tiny CLI for eyeballing an export: `python -m src.training.dataloader file.jsonl`
    import sys

    logging.basicConfig(level=logging.INFO)
    if len(sys.argv) < 2:
        print("usage: python -m src.training.dataloader <trajectories.jsonl>")
        raise SystemExit(2)
    exs = load_examples(sys.argv[1])
    by_grade: Dict[str, int] = {}
    for e in exs:
        by_grade[e.grade] = by_grade.get(e.grade, 0) + 1
    print(f"Loaded {len(exs)} examples. By grade: {by_grade}")
    if exs:
        print("First target action:", exs[0].target[:200])
