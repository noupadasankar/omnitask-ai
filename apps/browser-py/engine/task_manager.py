"""Task manager — parallel browser context management with priority queues."""

import asyncio
import heapq
import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

log = logging.getLogger("browser-py.engine.task_manager")


@dataclass
class ManagedTask:
    task_id: str
    workflow_id: str
    status: str         # pending | running | paused | completed | failed | cancelled
    priority: int       # 1-10, lower = higher priority
    context_id: str
    created_at: float
    started_at: Optional[float]
    completed_at: Optional[float]
    result: Optional[Any]
    error: Optional[str]


class TaskManager:
    """Manages parallel browser automation tasks with priorities and cancellation."""

    def __init__(self, max_concurrent: int = 3):
        self._max_concurrent = max_concurrent
        self._tasks: dict[str, ManagedTask] = {}
        self._queue: list = []          # min-heap: (priority, created_at, task_id)
        self._running: dict[str, asyncio.Task] = {}
        self._paused: set[str] = set()
        self._fns: dict[str, Callable] = {}
        self._lock = asyncio.Lock()

    def submit(
        self,
        workflow_id: str,
        fn: Callable,
        priority: int = 5,
    ) -> str:
        """Add a task to the queue. fn is an async callable. Returns task_id."""
        task_id = str(uuid.uuid4())
        now = time.time()
        task = ManagedTask(
            task_id=task_id,
            workflow_id=workflow_id,
            status="pending",
            priority=max(1, min(10, priority)),
            context_id=str(uuid.uuid4()),
            created_at=now,
            started_at=None,
            completed_at=None,
            result=None,
            error=None,
        )
        self._tasks[task_id] = task
        self._fns[task_id] = fn
        heapq.heappush(self._queue, (task.priority, now, task_id))
        log.debug("TaskManager: submitted %s (priority=%d)", task_id, priority)
        return task_id

    async def cancel(self, task_id: str) -> bool:
        """Cancel a task. Returns True if successfully cancelled."""
        task = self._tasks.get(task_id)
        if not task:
            return False
        task.status = "cancelled"
        task.completed_at = time.time()

        # If currently running, cancel the asyncio.Task
        if task_id in self._running:
            self._running[task_id].cancel()
            try:
                await self._running[task_id]
            except (asyncio.CancelledError, Exception):
                pass
            del self._running[task_id]

        self._paused.discard(task_id)
        log.info("TaskManager: cancelled %s", task_id)
        return True

    def pause(self, task_id: str) -> bool:
        """Pause a task cooperatively (fn must check is_paused())."""
        task = self._tasks.get(task_id)
        if not task or task.status not in ("pending", "running"):
            return False
        self._paused.add(task_id)
        task.status = "paused"
        return True

    def resume(self, task_id: str) -> bool:
        """Resume a paused task."""
        task = self._tasks.get(task_id)
        if not task or task.status != "paused":
            return False
        self._paused.discard(task_id)
        task.status = "running" if task_id in self._running else "pending"
        return True

    def is_paused(self, task_id: str) -> bool:
        return task_id in self._paused

    def get_status(self, task_id: str) -> Optional[ManagedTask]:
        return self._tasks.get(task_id)

    def get_queue(self) -> list[ManagedTask]:
        """Return all pending tasks sorted by priority."""
        return sorted(
            [t for t in self._tasks.values() if t.status == "pending"],
            key=lambda t: (t.priority, t.created_at),
        )

    def get_running(self) -> list[ManagedTask]:
        return [t for t in self._tasks.values() if t.status == "running"]

    async def run_all(self) -> dict[str, Any]:
        """Process all queued tasks up to max_concurrent, await all completions."""
        while self._queue or self._running:
            # Start tasks up to the concurrency limit
            while self._queue and len(self._running) < self._max_concurrent:
                _, _, task_id = heapq.heappop(self._queue)
                task = self._tasks.get(task_id)
                if not task or task.status in ("cancelled", "paused"):
                    continue
                await self._start_task(task_id)

            if not self._running:
                break

            # Wait for any running task to complete
            done, _ = await asyncio.wait(
                list(self._running.values()),
                return_when=asyncio.FIRST_COMPLETED,
            )
            for completed_task in done:
                for tid, atask in list(self._running.items()):
                    if atask is completed_task:
                        del self._running[tid]
                        break

        results = {}
        for task_id, task in self._tasks.items():
            results[task_id] = {
                "status": task.status,
                "result": task.result,
                "error": task.error,
            }
        return results

    async def _start_task(self, task_id: str) -> None:
        task = self._tasks.get(task_id)
        if not task:
            return
        fn = self._fns.get(task_id)
        if not fn:
            return

        task.status = "running"
        task.started_at = time.time()

        async def _runner():
            try:
                result = await fn()
                t = self._tasks.get(task_id)
                if t and t.status != "cancelled":
                    t.status = "completed"
                    t.result = result
                    t.completed_at = time.time()
                log.debug("TaskManager: %s completed", task_id)
            except asyncio.CancelledError:
                pass
            except Exception as exc:
                t = self._tasks.get(task_id)
                if t:
                    t.status = "failed"
                    t.error = str(exc)
                    t.completed_at = time.time()
                log.warning("TaskManager: %s failed — %s", task_id, exc)

        atask = asyncio.create_task(_runner())
        self._running[task_id] = atask

    def get_metrics(self) -> dict:
        all_tasks = list(self._tasks.values())
        durations = [
            (t.completed_at - t.started_at) * 1000
            for t in all_tasks
            if t.started_at and t.completed_at
        ]
        avg_ms = sum(durations) / len(durations) if durations else 0.0
        return {
            "queued": sum(1 for t in all_tasks if t.status == "pending"),
            "running": sum(1 for t in all_tasks if t.status == "running"),
            "completed": sum(1 for t in all_tasks if t.status == "completed"),
            "failed": sum(1 for t in all_tasks if t.status == "failed"),
            "cancelled": sum(1 for t in all_tasks if t.status == "cancelled"),
            "paused": sum(1 for t in all_tasks if t.status == "paused"),
            "avg_duration_ms": round(avg_ms, 1),
            "max_concurrent": self._max_concurrent,
        }
