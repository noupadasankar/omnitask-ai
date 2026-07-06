"""Semantic (vector) memory — local embeddings, no external vector DB.

Stores `(text, vector, metadata)` rows in a local JSONL file and retrieves by
cosine similarity computed in pure Python. Embeddings come from the local Ollama
embedding model; if embeddings are unavailable, it degrades to keyword overlap so
recall still works without a vector backend.
"""

from __future__ import annotations

import json
import logging
import math
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional

log = logging.getLogger("browser-py.job_agent.cognition")

_DEFAULT_PATH = Path("data") / "memory" / "vector_memory.jsonl"


def _cosine(a: List[float], b: List[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


def _keyword_score(query: str, text: str) -> float:
    q = {w for w in query.lower().split() if len(w) > 2}
    t = {w for w in text.lower().split() if len(w) > 2}
    if not q or not t:
        return 0.0
    return len(q & t) / len(q)


class VectorMemory:
    def __init__(self, llm, path: Path = _DEFAULT_PATH):
        self.llm = llm  # LocalLLMClient (provides embed())
        self.path = Path(path)
        self._lock = threading.Lock()
        self._rows: List[Dict[str, Any]] = []
        self._load()

    def _load(self) -> None:
        try:
            if self.path.exists():
                with self.path.open("r", encoding="utf-8") as f:
                    self._rows = [json.loads(line) for line in f if line.strip()]
        except Exception as exc:  # noqa: BLE001
            log.debug("VectorMemory load failed (%s); starting empty.", exc)
            self._rows = []

    def _append_row(self, row: Dict[str, Any]) -> None:
        with self._lock:
            self._rows.append(row)
            try:
                self.path.parent.mkdir(parents=True, exist_ok=True)
                with self.path.open("a", encoding="utf-8") as f:
                    f.write(json.dumps(row, ensure_ascii=False, default=str) + "\n")
            except Exception as exc:  # noqa: BLE001
                log.debug("VectorMemory append failed: %s", exc)

    async def add(self, text: str, metadata: Optional[Dict[str, Any]] = None) -> None:
        if not text:
            return
        vec = await self.llm.embed(text)
        self._append_row({"text": text[:2000], "vector": vec, "metadata": metadata or {}})

    async def search(self, query: str, *, k: int = 4) -> List[Dict[str, Any]]:
        if not self._rows or not query:
            return []
        qvec = await self.llm.embed(query)
        scored: List[tuple[float, Dict[str, Any]]] = []
        for row in self._rows:
            rv = row.get("vector")
            if qvec and rv:
                score = _cosine(qvec, rv)
            else:
                score = _keyword_score(query, row.get("text", ""))
            scored.append((score, row))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [r for s, r in scored[:k] if s > 0.05]
