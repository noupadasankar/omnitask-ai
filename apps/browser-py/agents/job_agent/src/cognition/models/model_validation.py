"""Pre-promotion model validation — a health check that a candidate GGUF is
actually loadable and coherent BEFORE it becomes production.

This is the canary step: convert → **validate** → promote. It loads the candidate
through the same in-process llama.cpp backend the engine serves with, runs a tiny
smoke suite, and reports one of three outcomes:

  • passed  — model loaded and answered the smoke prompts coherently → safe to promote.
  • failed  — model would not load (corrupt / wrong quant / bad export) or produced
              empty/incoherent output → MUST NOT promote.
  • skipped — llama.cpp isn't installed in THIS environment (e.g. a training box
              that has torch but not llama-cpp-python), so we can't validate here.
              The caller decides whether to proceed (warn) or block (--require).

`gate()` wraps this into a yes/no promotion decision for the CLIs, so a broken
artifact never becomes the production pointer.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from dataclasses import dataclass, field
from typing import Any, Callable, List, Optional, Tuple

log = logging.getLogger("browser-py.job_agent.cognition")

# (prompt, predicate-on-output). Lenient by design: the goal is to catch a BROKEN
# model (won't load / empty / gibberish), not to grade instruction-following — so a
# good model clears the bar even if one answer is phrased oddly (see min_pass).
Check = Tuple[str, Callable[[str], bool]]
_DEFAULT_CHECKS: List[Check] = [
    ("Reply with exactly: OK", lambda o: "ok" in o.lower()),
    ("Respond with the single word: hello", lambda o: "hello" in o.lower()),
    ("What is 2+2? Reply with just the number.", lambda o: "4" in o),
]


@dataclass
class ValidationResult:
    status: str  # "passed" | "failed" | "skipped"
    passed: int = 0
    total: int = 0
    failures: List[str] = field(default_factory=list)
    detail: str = ""
    time_ms: int = 0

    @property
    def ok(self) -> bool:
        return self.status == "passed"

    def summary(self) -> dict:
        """Compact, JSON-serializable record for the registry's audit trail."""
        return {
            "status": self.status,
            "passed": self.passed,
            "total": self.total,
            "time_ms": self.time_ms,
            "backend": "llama.cpp",
        }


async def validate_model(
    path: str,
    *,
    checks: Optional[List[Check]] = None,
    backend: Any = None,
    min_pass: Optional[int] = None,
    evict_after: bool = True,
) -> ValidationResult:
    """Load `path` and run the smoke suite. Pass `backend` to validate against an
    already-built backend (used by tests); otherwise a dedicated llama.cpp backend
    pointed at `path` is created and evicted afterwards."""
    started = time.monotonic()

    def _done(r: ValidationResult) -> ValidationResult:
        r.time_ms = int((time.monotonic() - started) * 1000)
        return r

    if not path or not os.path.exists(path):
        return _done(ValidationResult("failed", detail=f"file not found: {path}"))

    own_backend = backend is None
    if own_backend:
        try:
            import llama_cpp  # noqa: F401 — presence probe only
        except Exception:
            return _done(ValidationResult(
                "skipped", detail="llama-cpp-python not installed in this environment"
            ))
        from .backends.llamacpp_backend import LlamaCppBackend
        backend = LlamaCppBackend()
        backend.model_path = path
        backend.model = os.path.basename(path)
        backend._available = None  # force a fresh load against THIS candidate

    # Load check — this alone catches corrupt / incompatible-quant GGUFs.
    try:
        loaded = await backend.is_available()
    except Exception as exc:  # noqa: BLE001
        return _done(ValidationResult("failed", detail=f"load error: {exc}"))
    if not loaded:
        return _done(ValidationResult("failed", detail="model failed to load (corrupt/incompatible GGUF?)"))

    suite = checks if checks is not None else _DEFAULT_CHECKS
    total = len(suite)
    if min_pass is None:
        min_pass = max(1, (total + 1) // 2)  # majority by default

    passed = nonempty = 0
    failures: List[str] = []
    for prompt, predicate in suite:
        try:
            out = await backend.chat([{"role": "user", "content": prompt}])
        except Exception as exc:  # noqa: BLE001
            failures.append(f"{prompt!r}: error {exc}")
            continue
        if out and out.strip():
            nonempty += 1
            if predicate(out):
                passed += 1
            else:
                failures.append(f"{prompt!r}: unexpected output {out.strip()[:60]!r}")
        else:
            failures.append(f"{prompt!r}: empty output")

    if own_backend and evict_after:
        try:
            backend._evict(path)
        except Exception:  # noqa: BLE001
            pass

    ok = (nonempty == total) and (passed >= min_pass)
    return _done(ValidationResult(
        "passed" if ok else "failed", passed=passed, total=total, failures=failures
    ))


def gate_detailed(
    path: str,
    *,
    require: bool = False,
    skip: bool = False,
    backend: Any = None,
    logger: Optional[logging.Logger] = None,
) -> Tuple[bool, ValidationResult]:
    """Like gate(), but also returns the ValidationResult so the caller can store
    its summary() in the registry audit trail."""
    lg = logger or log
    if skip:
        lg.warning("Pre-promotion validation BYPASSED (--skip-validation) for %s.", path)
        return True, ValidationResult("skipped", detail="bypassed (--skip-validation)")
    result = asyncio.run(validate_model(path, backend=backend))
    if result.status == "failed":
        lg.error("Pre-promotion validation FAILED for %s — refusing to promote. %s",
                 path, "; ".join(result.failures) or result.detail)
        return False, result
    if result.status == "skipped":
        if require:
            lg.error("Validation could not run here (%s) and --require-validation is set; "
                     "not promoting.", result.detail)
            return False, result
        lg.warning("Validation SKIPPED (%s); promoting unvalidated — validate on a box "
                   "with llama-cpp-python.", result.detail)
        return True, result
    lg.info("Pre-promotion validation PASSED (%d/%d, %dms) for %s.",
            result.passed, result.total, result.time_ms, path)
    return True, result


def gate(
    path: str,
    *,
    require: bool = False,
    skip: bool = False,
    backend: Any = None,
    logger: Optional[logging.Logger] = None,
) -> bool:
    """Decide whether `path` may be promoted. failed → False; passed → True;
    skipped → True unless `require`; `skip` → True (bypass). Synchronous wrapper."""
    ok, _ = gate_detailed(path, require=require, skip=skip, backend=backend, logger=logger)
    return ok
