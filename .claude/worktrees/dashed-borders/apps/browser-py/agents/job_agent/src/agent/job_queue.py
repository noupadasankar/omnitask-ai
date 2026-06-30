"""In-process job queue with an explicit state machine.

Realizes the "Job Queue → Worker" stage of the architecture inside the single
orchestrator process (one shared browser / one live view). Each candidate job
moves through PENDING → PROCESSING → COMPLETED / SKIPPED / FAILED, with bounded
retries on failure. Dedup is by a stable per-job key (portal + role + company),
NOT by fragile card position, so a re-applied job is never re-queued.

The queue is deliberately storage-free: durable per-job records live in Postgres
(via the `application:result` relay) and the live mirror is emitted by the caller
through `on_change`. This keeps the queue a pure, testable state machine.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Callable, Dict, List, Optional


class JobState(str, Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    SKIPPED = "SKIPPED"


_WS = re.compile(r"\s+")


def normalize(text: object) -> str:
    """Lowercase + collapse whitespace for stable matching/fingerprints."""
    return _WS.sub(" ", str(text or "").strip().lower())


def card_key(job: Dict) -> str:
    """Stable fingerprint for a job, independent of its position in the list.

    Prefer an explicit external id; otherwise portal + role + company. This is
    what makes dedup and card re-location reliable when the listing reorders
    after each apply.
    """
    portal = normalize(job.get("portal") or job.get("portal_name"))
    explicit = job.get("external_job_id") or job.get("job_id")
    if explicit and not str(explicit).lower().startswith(("linkedin_", "naukri_", "instahyre_")):
        # A real portal id (not our positional placeholder) is the best key.
        return f"{portal}:{normalize(explicit)}"
    return f"{portal}:{normalize(job.get('role'))}|{normalize(job.get('company'))}"


@dataclass
class QueuedJob:
    """A candidate job plus its state-machine bookkeeping."""

    job: Dict
    key: str
    state: JobState = JobState.PENDING
    attempts: int = 0
    max_attempts: int = 2
    error: Optional[str] = None


class JobQueue:
    """Ordered, de-duplicated work queue with retry.

    Args:
        max_attempts: how many times a FAILED job is retried before it stays FAILED.
        on_change: optional callback invoked with `counts()` after every transition
            (used by the orchestrator to mirror live queue state to the dashboard).
    """

    def __init__(self, max_attempts: int = 2,
                 on_change: Optional[Callable[[Dict[str, int]], None]] = None):
        self._items: List[QueuedJob] = []
        self._seen: set = set()
        self.max_attempts = max_attempts
        self._on_change = on_change

    # ── mutation ──────────────────────────────────────────────────────────────
    def add(self, job: Dict) -> bool:
        """Enqueue a job as PENDING. Returns False if it's a duplicate."""
        key = card_key(job)
        if key in self._seen:
            return False
        self._seen.add(key)
        self._items.append(QueuedJob(job=job, key=key, max_attempts=self.max_attempts))
        self._changed()
        return True

    def next_pending(self) -> Optional[QueuedJob]:
        """Claim the next PENDING job, flipping it to PROCESSING."""
        for qj in self._items:
            if qj.state == JobState.PENDING:
                qj.state = JobState.PROCESSING
                qj.attempts += 1
                self._changed()
                return qj
        return None

    def complete(self, qj: QueuedJob) -> None:
        qj.state = JobState.COMPLETED
        self._changed()

    def skip(self, qj: QueuedJob, reason: Optional[str] = None) -> None:
        qj.state = JobState.SKIPPED
        qj.error = reason
        self._changed()

    def requeue_or_fail(self, qj: QueuedJob, error: Optional[str] = None) -> JobState:
        """Send a PROCESSING job back to PENDING if it has retries left, else FAIL it.

        Returns the resulting state so the caller can log/emit accordingly.
        """
        qj.error = error
        if qj.attempts < qj.max_attempts:
            qj.state = JobState.PENDING
        else:
            qj.state = JobState.FAILED
        self._changed()
        return qj.state

    # ── queries ───────────────────────────────────────────────────────────────
    def has_pending(self) -> bool:
        return any(qj.state == JobState.PENDING for qj in self._items)

    def is_known(self, job: Dict) -> bool:
        return card_key(job) in self._seen

    def counts(self) -> Dict[str, int]:
        c = {s.value: 0 for s in JobState}
        for qj in self._items:
            c[qj.state.value] += 1
        c["total"] = len(self._items)
        return c

    # ── internal ──────────────────────────────────────────────────────────────
    def _changed(self) -> None:
        if self._on_change is not None:
            try:
                self._on_change(self.counts())
            except Exception:
                pass
