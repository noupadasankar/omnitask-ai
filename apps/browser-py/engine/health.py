"""Production readiness — health checks, graceful shutdown, structured logging, version info."""

import asyncio
import json
import logging
import os
import signal
import time
from typing import Callable, Optional

log = logging.getLogger("browser-py.engine.health")


class HealthChecker:
    """Async health checks for all engine dependencies."""

    async def check_browser(self, page) -> dict:
        """Verify the Playwright page is alive and responsive."""
        t0 = time.time()
        try:
            result = await page.evaluate("1 + 1")
            latency = (time.time() - t0) * 1000
            return {"healthy": result == 2, "latency_ms": round(latency, 1), "error": None}
        except Exception as exc:
            return {"healthy": False, "latency_ms": 0, "error": str(exc)}

    async def check_redis(self, redis_client) -> dict:
        """Ping the Redis client."""
        if redis_client is None:
            return {"healthy": False, "latency_ms": 0, "error": "not configured"}
        t0 = time.time()
        try:
            await redis_client.ping()
            latency = (time.time() - t0) * 1000
            return {"healthy": True, "latency_ms": round(latency, 1), "error": None}
        except Exception as exc:
            return {"healthy": False, "latency_ms": 0, "error": str(exc)}

    async def check_ai_client(self, ai_client) -> dict:
        """Verify AI client is configured."""
        if ai_client is None:
            return {"healthy": False, "latency_ms": 0, "error": "not configured"}
        t0 = time.time()
        try:
            # Just check it has the expected interface without making a real API call
            has_method = hasattr(ai_client, "decide_action") or hasattr(ai_client, "complete")
            latency = (time.time() - t0) * 1000
            return {"healthy": has_method, "latency_ms": round(latency, 1), "error": None if has_method else "missing interface"}
        except Exception as exc:
            return {"healthy": False, "latency_ms": 0, "error": str(exc)}

    async def check_all(
        self,
        page=None,
        redis_client=None,
        ai_client=None,
    ) -> dict:
        """Run all health checks and return a combined status."""
        checks = {}

        if page:
            checks["browser"] = await self.check_browser(page)
        if redis_client:
            checks["redis"] = await self.check_redis(redis_client)
        if ai_client:
            checks["ai_client"] = await self.check_ai_client(ai_client)

        healthy_count = sum(1 for c in checks.values() if c.get("healthy"))
        total = len(checks)

        if total == 0:
            overall = "unknown"
        elif healthy_count == total:
            overall = "healthy"
        elif healthy_count > 0:
            overall = "degraded"
        else:
            overall = "unhealthy"

        return {
            "status": overall,
            "checks": checks,
            "timestamp": time.time(),
        }


class GracefulShutdown:
    """Handles SIGTERM/SIGINT for graceful engine shutdown."""

    def __init__(self):
        self._shutting_down = False
        self._cleanup_fns: list[Callable] = []

        # Register signal handlers
        try:
            signal.signal(signal.SIGTERM, self._handle_signal)
            signal.signal(signal.SIGINT, self._handle_signal)
        except (OSError, ValueError):
            pass  # In non-main threads, signal registration is not allowed

    def _handle_signal(self, signum, frame) -> None:
        log.info("GracefulShutdown: received signal %d — initiating shutdown", signum)
        self._shutting_down = True

    def is_shutting_down(self) -> bool:
        return self._shutting_down

    def register_cleanup(self, fn: Callable) -> None:
        """Register an async cleanup callback to run on shutdown."""
        self._cleanup_fns.append(fn)

    async def shutdown(self) -> None:
        """Set shutdown flag and run all cleanup callbacks."""
        self._shutting_down = True
        log.info("GracefulShutdown: running %d cleanup callbacks", len(self._cleanup_fns))
        for fn in self._cleanup_fns:
            try:
                if asyncio.iscoroutinefunction(fn):
                    await fn()
                else:
                    fn()
            except Exception as exc:
                log.warning("Cleanup callback failed: %s", exc)
        log.info("GracefulShutdown: complete")


def setup_structured_logging(
    level: str = "INFO",
    service_name: str = "browser-py-engine",
) -> None:
    """Configure structured JSON logging for the engine."""

    class JsonFormatter(logging.Formatter):
        def format(self, record: logging.LogRecord) -> str:
            entry = {
                "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
                "level": record.levelname,
                "service": service_name,
                "logger": record.name,
                "message": record.getMessage(),
            }
            if record.exc_info:
                entry["exception"] = self.formatException(record.exc_info)
            # Include any extra fields
            for key, val in record.__dict__.items():
                if key not in ("args", "created", "exc_info", "exc_text", "filename",
                               "funcName", "id", "levelname", "levelno", "lineno",
                               "module", "msecs", "message", "msg", "name",
                               "pathname", "process", "processName", "relativeCreated",
                               "stack_info", "thread", "threadName"):
                    try:
                        json.dumps(val)
                        entry[key] = val
                    except (TypeError, ValueError):
                        entry[key] = str(val)
            return json.dumps(entry)

    root = logging.getLogger()
    root.setLevel(getattr(logging, level.upper(), logging.INFO))

    if not root.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(JsonFormatter())
        root.addHandler(handler)
    else:
        for handler in root.handlers:
            handler.setFormatter(JsonFormatter())


class VersionInfo:
    """Engine version and capability manifest."""

    VERSION = "2.0.0"
    BUILD_DATE = "2026-07-08"

    CAPABILITIES = [
        "universal_page_understanding",
        "advanced_element_intelligence",
        "browser_context_memory",
        "network_monitoring",
        "intelligent_waiting",
        "dynamic_dom_tracking",
        "full_visual_analysis",
        "smart_workflow_planner",
        "risk_assessment",
        "comprehensive_verification",
        "error_classification",
        "recovery_strategy",
        "parallel_task_management",
        "workflow_checkpoints",
        "comprehensive_audit_trail",
        "observability_metrics",
        "security",
        "ai_decision_logging",
        "configuration_management",
        "production_readiness",
    ]

    @classmethod
    def to_dict(cls) -> dict:
        return {
            "version": cls.VERSION,
            "build_date": cls.BUILD_DATE,
            "capability_count": len(cls.CAPABILITIES),
            "capabilities": cls.CAPABILITIES,
        }


class FeatureFlags:
    """In-memory feature flag store."""

    _DEFAULTS = {
        "dom_tracking": True,
        "network_monitoring": True,
        "ai_decision_logging": True,
        "smart_waiting": True,
        "parallel_contexts": False,
        "visual_regression": True,
        "auto_dismiss_popups": True,
        "approval_gates": True,
        "metrics_export": True,
        "structured_logging": True,
    }

    def __init__(self):
        self._flags = dict(self._DEFAULTS)

    def set(self, name: str, enabled: bool) -> None:
        self._flags[name] = enabled

    def is_enabled(self, name: str) -> bool:
        return self._flags.get(name, True)

    def get_all(self) -> dict:
        return dict(self._flags)
