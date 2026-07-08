"""Metrics — observability for the browser engine. Tracks all KPIs."""

import logging
import math
import statistics
import time
from dataclasses import dataclass, field
from typing import Optional

log = logging.getLogger("browser-py.engine.metrics")


@dataclass
class MetricPoint:
    name: str
    value: float
    labels: dict
    timestamp: float
    metric_type: str    # counter | gauge | histogram


class EngineMetrics:
    """Collects and exposes all engine observability metrics."""

    _shared: Optional["EngineMetrics"] = None

    @classmethod
    def instance(cls) -> "EngineMetrics":
        if cls._shared is None:
            cls._shared = cls()
        return cls._shared

    def __init__(self):
        # Counters
        self.tasks_total: int = 0
        self.tasks_succeeded: int = 0
        self.tasks_failed: int = 0
        self.steps_total: int = 0
        self.steps_succeeded: int = 0
        self.steps_failed: int = 0
        self.recovery_attempts: int = 0
        self.recovery_successes: int = 0
        self.retries_total: int = 0

        # Gauges
        self.queue_depth: float = 0.0
        self.active_browsers: float = 0.0

        # Histograms (capped at 10000 entries each)
        self._task_durations: list[float] = []
        self._step_durations: list[float] = []
        self._network_latencies: list[float] = []

        # Per-task tracking
        self._task_starts: dict[str, float] = {}   # task_id -> start_time

        # Per-agent step counts
        self._agent_counts: dict[str, int] = {}

    # ── Record methods ───────────────────────────────────────────────────────

    def record_task_start(self, task_id: str, domain: str = "") -> None:
        self.tasks_total += 1
        self._task_starts[task_id] = time.time()

    def record_task_complete(self, task_id: str, duration_ms: float, success: bool) -> None:
        if success:
            self.tasks_succeeded += 1
        else:
            self.tasks_failed += 1
        self._task_starts.pop(task_id, None)
        self._task_durations.append(duration_ms)
        if len(self._task_durations) > 10000:
            self._task_durations.pop(0)

    def record_step(
        self, step_id: str, duration_ms: float, success: bool, agent: str = ""
    ) -> None:
        self.steps_total += 1
        if success:
            self.steps_succeeded += 1
        else:
            self.steps_failed += 1
        self._step_durations.append(duration_ms)
        if len(self._step_durations) > 10000:
            self._step_durations.pop(0)
        if agent:
            self._agent_counts[agent] = self._agent_counts.get(agent, 0) + 1

    def record_recovery(self, task_id: str, strategy: str, success: bool) -> None:
        self.recovery_attempts += 1
        if success:
            self.recovery_successes += 1

    def record_retry(self) -> None:
        self.retries_total += 1

    def record_network_latency(self, url: str, latency_ms: float) -> None:
        self._network_latencies.append(latency_ms)
        if len(self._network_latencies) > 10000:
            self._network_latencies.pop(0)

    def set_queue_depth(self, depth: int) -> None:
        self.queue_depth = float(depth)

    def set_active_browsers(self, count: int) -> None:
        self.active_browsers = float(count)

    # ── Query methods ────────────────────────────────────────────────────────

    def get_success_rate(self) -> float:
        return self.tasks_succeeded / max(self.tasks_total, 1)

    def get_recovery_rate(self) -> float:
        return self.recovery_successes / max(self.recovery_attempts, 1)

    def get_step_success_rate(self) -> float:
        return self.steps_succeeded / max(self.steps_total, 1)

    def get_percentile(self, histogram_name: str, pct: float) -> float:
        """Return the pct-th percentile of a histogram. pct: 0-100."""
        data = getattr(self, f"_{histogram_name}s", None)
        if not data:
            return 0.0
        sorted_data = sorted(data)
        idx = math.ceil(pct / 100 * len(sorted_data)) - 1
        idx = max(0, min(idx, len(sorted_data) - 1))
        return sorted_data[idx]

    def get_summary(self) -> dict:
        return {
            "tasks": {
                "total": self.tasks_total,
                "succeeded": self.tasks_succeeded,
                "failed": self.tasks_failed,
                "success_rate": round(self.get_success_rate(), 3),
                "p50_duration_ms": self.get_percentile("task_duration", 50),
                "p95_duration_ms": self.get_percentile("task_duration", 95),
            },
            "steps": {
                "total": self.steps_total,
                "succeeded": self.steps_succeeded,
                "failed": self.steps_failed,
                "success_rate": round(self.get_step_success_rate(), 3),
                "p50_duration_ms": self.get_percentile("step_duration", 50),
                "p95_duration_ms": self.get_percentile("step_duration", 95),
                "by_agent": dict(self._agent_counts),
            },
            "recovery": {
                "attempts": self.recovery_attempts,
                "successes": self.recovery_successes,
                "rate": round(self.get_recovery_rate(), 3),
            },
            "retries_total": self.retries_total,
            "network": {
                "p50_latency_ms": self.get_percentile("network_latency", 50),
                "p95_latency_ms": self.get_percentile("network_latency", 95),
            },
            "gauges": {
                "queue_depth": self.queue_depth,
                "active_browsers": self.active_browsers,
            },
        }

    def to_prometheus_text(self) -> str:
        """Emit metrics in Prometheus text exposition format."""
        lines = []
        ts = int(time.time() * 1000)

        def counter(name, value, help_text=""):
            if help_text:
                lines.append(f"# HELP {name} {help_text}")
            lines.append(f"# TYPE {name} counter")
            lines.append(f"{name} {value} {ts}")

        def gauge(name, value, help_text=""):
            if help_text:
                lines.append(f"# HELP {name} {help_text}")
            lines.append(f"# TYPE {name} gauge")
            lines.append(f"{name} {value} {ts}")

        counter("engine_tasks_total", self.tasks_total, "Total tasks executed")
        counter("engine_tasks_succeeded_total", self.tasks_succeeded)
        counter("engine_tasks_failed_total", self.tasks_failed)
        counter("engine_steps_total", self.steps_total)
        counter("engine_steps_succeeded_total", self.steps_succeeded)
        counter("engine_recovery_attempts_total", self.recovery_attempts)
        counter("engine_recovery_successes_total", self.recovery_successes)
        gauge("engine_success_rate", round(self.get_success_rate(), 4), "Task success rate")
        gauge("engine_recovery_rate", round(self.get_recovery_rate(), 4))
        gauge("engine_queue_depth", self.queue_depth)
        gauge("engine_active_browsers", self.active_browsers)
        gauge("engine_task_duration_p95_ms", self.get_percentile("task_duration", 95))
        gauge("engine_step_duration_p95_ms", self.get_percentile("step_duration", 95))

        return "\n".join(lines) + "\n"

    def reset(self) -> None:
        """Zero all metrics (for testing)."""
        self.__init__()
