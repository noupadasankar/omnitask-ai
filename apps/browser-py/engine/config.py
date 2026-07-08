"""Engine configuration — all tunables with env var loading and validation."""

import copy
import logging
import os
from dataclasses import dataclass, field
from typing import Any, Optional

log = logging.getLogger("browser-py.engine.config")

_PREFIX = "BROWSER_ENGINE_"


def _env(key: str, default: Any) -> Any:
    """Read env var with prefix, casting to default's type."""
    raw = os.environ.get(_PREFIX + key.upper())
    if raw is None:
        return default
    try:
        if isinstance(default, bool):
            return raw.lower() in ("1", "true", "yes")
        if isinstance(default, int):
            return int(raw)
        if isinstance(default, float):
            return float(raw)
        return raw
    except (ValueError, TypeError):
        return default


@dataclass
class EngineConfig:
    """All engine configuration with sensible defaults."""

    timeouts: dict = field(default_factory=lambda: {
        "navigate_ms": 30000,
        "click_ms": 10000,
        "type_ms": 5000,
        "wait_ms": 15000,
        "form_fill_ms": 30000,
        "network_idle_ms": 10000,
        "animation_ms": 5000,
    })

    retry: dict = field(default_factory=lambda: {
        "max_attempts": 3,
        "base_delay_ms": 1000,
        "max_delay_ms": 30000,
        "backoff_factor": 2.0,
    })

    scroll: dict = field(default_factory=lambda: {
        "pause_ms": 350,
        "max_scrolls": 60,
        "expand_collapsible": True,
        "smooth": True,
    })

    risk: dict = field(default_factory=lambda: {
        "auto_approve_below": "low_risk",
        "require_confirmation_above": "high_risk",
        "critical_always_confirm": True,
    })

    confirmation: dict = field(default_factory=lambda: {
        "timeout_s": 300,
        "default_policy": "ask",
    })

    logging: dict = field(default_factory=lambda: {
        "level": "INFO",
        "redact_secrets": True,
        "log_screenshots": False,
        "log_dom_snapshots": False,
    })

    screenshots: dict = field(default_factory=lambda: {
        "on_each_step": False,
        "on_failure": True,
        "on_completion": True,
        "quality": 75,
        "format": "jpeg",
    })

    recovery: dict = field(default_factory=lambda: {
        "max_recoveries": 2,
        "strategies": ["retry", "alternate_selector", "refresh", "checkpoint_restore", "escalate"],
    })

    browser: dict = field(default_factory=lambda: {
        "headless": True,
        "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "viewport_width": 1280,
        "viewport_height": 800,
        "slow_mo_ms": 0,
    })

    metrics: dict = field(default_factory=lambda: {
        "enabled": True,
        "export_prometheus": True,
        "flush_interval_s": 60,
    })

    features: dict = field(default_factory=lambda: {
        "parallel_contexts": False,
        "dom_tracking": True,
        "network_monitoring": True,
        "ai_decision_logging": True,
        "smart_waiting": True,
    })

    _instance: Optional["EngineConfig"] = field(default=None, init=False, repr=False, compare=False)

    @classmethod
    def from_env(cls) -> "EngineConfig":
        """Load config from environment variables, applying over defaults."""
        cfg = cls()
        # Override individual known vars
        cfg.timeouts["navigate_ms"] = _env("TIMEOUT_NAVIGATE_MS", cfg.timeouts["navigate_ms"])
        cfg.timeouts["click_ms"] = _env("TIMEOUT_CLICK_MS", cfg.timeouts["click_ms"])
        cfg.retry["max_attempts"] = _env("RETRY_MAX_ATTEMPTS", cfg.retry["max_attempts"])
        cfg.browser["headless"] = _env("HEADLESS", cfg.browser["headless"])
        cfg.browser["slow_mo_ms"] = _env("SLOW_MO_MS", cfg.browser["slow_mo_ms"])
        cfg.screenshots["quality"] = _env("SCREENSHOT_QUALITY", cfg.screenshots["quality"])
        cfg.logging["level"] = _env("LOG_LEVEL", cfg.logging["level"])
        cfg.logging["redact_secrets"] = _env("REDACT_SECRETS", cfg.logging["redact_secrets"])
        cfg.recovery["max_recoveries"] = _env("MAX_RECOVERIES", cfg.recovery["max_recoveries"])
        cfg.features["dom_tracking"] = _env("DOM_TRACKING", cfg.features["dom_tracking"])
        cfg.features["network_monitoring"] = _env("NETWORK_MONITORING", cfg.features["network_monitoring"])
        return cfg

    @classmethod
    def from_dict(cls, data: dict) -> "EngineConfig":
        """Create config by merging provided dict over defaults."""
        cfg = cls()
        for key, value in data.items():
            if hasattr(cfg, key) and isinstance(value, dict):
                current = getattr(cfg, key)
                current.update(value)
            elif hasattr(cfg, key):
                setattr(cfg, key, value)
        return cfg

    def validate(self) -> list[str]:
        """Return list of validation errors. Empty list = valid."""
        errors = []
        for name, val in self.timeouts.items():
            if not isinstance(val, (int, float)) or val <= 0:
                errors.append(f"timeouts.{name} must be > 0, got {val}")
        max_att = self.retry.get("max_attempts", 0)
        if not (1 <= max_att <= 10):
            errors.append(f"retry.max_attempts must be 1-10, got {max_att}")
        quality = self.screenshots.get("quality", 0)
        if not (1 <= quality <= 100):
            errors.append(f"screenshots.quality must be 1-100, got {quality}")
        return errors

    def to_dict(self) -> dict:
        return {
            "timeouts": dict(self.timeouts),
            "retry": dict(self.retry),
            "scroll": dict(self.scroll),
            "risk": dict(self.risk),
            "confirmation": dict(self.confirmation),
            "logging": dict(self.logging),
            "screenshots": dict(self.screenshots),
            "recovery": dict(self.recovery),
            "browser": dict(self.browser),
            "metrics": dict(self.metrics),
            "features": dict(self.features),
        }

    def get(self, path: str, default: Any = None) -> Any:
        """Dot-notation access e.g. 'timeouts.navigate_ms'."""
        parts = path.split(".")
        obj = self.to_dict()
        for part in parts:
            if isinstance(obj, dict) and part in obj:
                obj = obj[part]
            else:
                return default
        return obj


# Module-level singleton
_config: Optional[EngineConfig] = None


def get_config() -> EngineConfig:
    global _config
    if _config is None:
        _config = EngineConfig.from_env()
    return _config


def set_config(cfg: EngineConfig) -> None:
    global _config
    _config = cfg
