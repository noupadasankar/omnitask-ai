"""Model registry + lock-coordinated hot-swap test — runs inline, no test runner.

Two things under test:
  1. ModelRegistry — register / promote / production pointer / persistence / rollback.
  2. LlamaCppBackend.reload — an in-flight-SAFE hot-swap: while a call is mid-
     inference on model A, reload(B) must let A's call finish cleanly (drain), then
     evict A and route subsequent calls to B. This is the crux of "zero-downtime"
     model swapping on a non-reentrant resident model.

No GPU, no llama_cpp, no real GGUF: fake models are seeded into the process-wide
cache, and tiny temp files satisfy the on-disk path checks.
"""

import asyncio
import os
import pathlib
import sys
import tempfile
import threading
import time

# Ensure the cognition package is on sys.path (mirrors test_firewall.py).
_HERE = pathlib.Path(__file__).parent          # .../src/cognition
sys.path.insert(0, str(_HERE.parent))          # .../src

from cognition.models.model_registry import ModelRegistry  # noqa: E402


class FakeLlama:
    """Stand-in for llama_cpp.Llama; records call count and peak concurrency."""

    def __init__(self, name: str, hold: float):
        self.name = name
        self.hold = hold
        self.active = 0
        self.peak = 0
        self.calls = 0
        self._l = threading.Lock()

    def create_chat_completion(self, **kwargs):
        with self._l:
            self.active += 1
            self.calls += 1
            self.peak = max(self.peak, self.active)
        if self.hold:
            time.sleep(self.hold)
        with self._l:
            self.active -= 1
        return {"choices": [{"message": {"content": "{}"}}]}


def _registry_part(tmp: pathlib.Path) -> dict:
    a = tmp / "v1.gguf"; a.write_bytes(b"a")
    b = tmp / "v2.gguf"; b.write_bytes(b"b")
    reg_path = tmp / "registry.json"

    reg = ModelRegistry(path=reg_path)
    out = {}
    out["register_a"] = reg.register(str(a)) is not None
    promoted = reg.promote(str(b), notes="nightly QLoRA")
    out["promote_b"] = bool(promoted) and promoted["path"] == str(b)
    out["production_is_b"] = reg.production_path() == str(b)
    out["two_versions_tracked"] = len(reg.versions()) == 2
    out["promote_missing_refused"] = reg.promote(str(tmp / "nope.gguf")) is None
    out["production_unchanged_after_bad"] = reg.production_path() == str(b)

    # Persistence: a fresh instance reads the same production + history from disk.
    reg2 = ModelRegistry(path=reg_path)
    out["persisted_across_instances"] = (
        reg2.production_path() == str(b) and len(reg2.versions()) == 2
    )
    # Rollback is just another promote() of a known-good predecessor.
    reg2.promote(str(a))
    out["rollback_to_a"] = reg2.production_path() == str(a)
    return out


async def _reload_part(a_path: str, b_path: str) -> dict:
    os.environ["LLAMACPP_MODEL_PATH"] = a_path
    from cognition.models.backends.llamacpp_backend import LlamaCppBackend, _MODELS

    fake_a = FakeLlama("A", hold=0.20)
    fake_b = FakeLlama("B", hold=0.0)
    _MODELS[a_path] = fake_a
    _MODELS[b_path] = fake_b

    backend = LlamaCppBackend()

    # Baseline call routes to A.
    await backend.chat([{"role": "user", "content": "x"}])

    # Start an in-flight call on A, let it get mid-inference (holding A's lock)...
    inflight = asyncio.create_task(backend.chat([{"role": "user", "content": "y"}]))
    await asyncio.sleep(0.10)  # > thread-scheduling jitter, < A's 0.20s hold
    # ...then hot-swap to B WHILE A is still running.
    swapped = await backend.reload(b_path)
    inflight_result = await inflight

    # A subsequent call must route to the new model B.
    await backend.chat([{"role": "user", "content": "z"}])

    return {
        "swapped": swapped,
        "model_path": backend.model_path,
        "model_label": backend.model,
        "a_calls": fake_a.calls,
        "b_calls": fake_b.calls,
        "a_peak": fake_a.peak,
        "a_evicted": a_path not in _MODELS,
        "b_resident": b_path in _MODELS,
        "inflight_ok": inflight_result == "{}",
    }


def _boot_part(tmp: pathlib.Path) -> dict:
    """Boot-time backend selection picks up the registry's production model."""
    from cognition.models.local_llm import LocalLLMClient
    from cognition.models.model_registry import ModelRegistry

    base = tmp / "base.gguf"; base.write_bytes(b"base")
    promoted = tmp / "promoted.gguf"; promoted.write_bytes(b"prm")
    reg_file = tmp / "boot_registry.json"
    ModelRegistry(path=reg_file).promote(str(promoted), notes="boot test")

    out = {}
    os.environ["COG_LLM_BACKEND"] = "auto"
    os.environ["LLAMACPP_MODEL_PATH"] = str(base)
    os.environ["COG_MODEL_REGISTRY_PATH"] = str(reg_file)
    os.environ.pop("COG_MODEL_REGISTRY", None)
    c1 = LocalLLMClient()
    out["boot_uses_promoted_over_env"] = (
        c1.model_path == str(promoted) and c1.model == "promoted.gguf"
    )

    # Disabling the registry falls back to the env base model.
    os.environ["COG_MODEL_REGISTRY"] = "false"
    c2 = LocalLLMClient()
    out["disabled_falls_back_to_env"] = c2.model_path == str(base)

    for k in ("COG_LLM_BACKEND", "COG_MODEL_REGISTRY", "COG_MODEL_REGISTRY_PATH"):
        os.environ.pop(k, None)
    return out


def _robustness_part(tmp: pathlib.Path) -> dict:
    """Corruption is non-fatal; writes are atomic; audit fields are recorded."""
    import json as _json
    from cognition.models.model_registry import ModelRegistry

    out = {}

    # A malformed registry must not raise — it degrades to an empty registry.
    corrupt = tmp / "corrupt_registry.json"
    corrupt.write_text("{ this is not valid json", encoding="utf-8")
    reg = ModelRegistry(path=corrupt)
    out["corrupt_is_non_fatal"] = reg.production_path() is None and reg.versions() == []

    # A subsequent valid promote recovers, overwrites atomically, and records audit.
    g = tmp / "ok.gguf"; g.write_bytes(b"g")
    rec = reg.promote(str(g), source="Qwen/Qwen2.5-7B-Instruct", notes="recovery")
    out["recovers_after_corruption"] = reg.production_path() == str(g)
    out["audit_source_recorded"] = bool(rec) and rec.get("source") == "Qwen/Qwen2.5-7B-Instruct"
    out["no_tmp_file_left_behind"] = not (tmp / (corrupt.name + ".tmp")).exists()
    try:
        out["file_is_valid_json_after_write"] = isinstance(
            _json.loads(corrupt.read_text(encoding="utf-8")), dict)
    except Exception:
        out["file_is_valid_json_after_write"] = False

    # Boot-time selection tolerates a corrupt registry → falls back to env base.
    from cognition.models.local_llm import LocalLLMClient
    base = tmp / "rb_base.gguf"; base.write_bytes(b"b")
    bad = tmp / "corrupt2.json"; bad.write_text("garbage", encoding="utf-8")
    os.environ["COG_LLM_BACKEND"] = "auto"
    os.environ["LLAMACPP_MODEL_PATH"] = str(base)
    os.environ["COG_MODEL_REGISTRY_PATH"] = str(bad)
    os.environ.pop("COG_MODEL_REGISTRY", None)
    c = LocalLLMClient()
    out["boot_tolerates_corrupt_registry"] = c.model_path == str(base)
    for k in ("COG_LLM_BACKEND", "COG_MODEL_REGISTRY_PATH"):
        os.environ.pop(k, None)
    return out


def _sha_and_rollback_part(tmp: pathlib.Path) -> dict:
    """SHA256 fingerprinting, promotion history, rollback, and boot-time
    integrity verification (COG_MODEL_VERIFY)."""
    from cognition.models.model_registry import ModelRegistry, sha256_of
    from cognition.models.local_llm import _registry_production_path

    out = {}
    a = tmp / "m_a.gguf"; a.write_bytes(b"AAAA")
    b = tmp / "m_b.gguf"; b.write_bytes(b"BBBB")
    reg_file = tmp / "sr_registry.json"
    reg = ModelRegistry(path=reg_file)

    pa = reg.promote(str(a), source="base-x")
    out["sha256_recorded"] = (
        bool(pa) and pa.get("sha256") == sha256_of(str(a)) and len(pa["sha256"]) == 64
    )
    reg.promote(str(b))
    out["history_grows"] = len(reg.history()) == 2
    out["previous_is_a"] = (reg.previous() or {}).get("path") == str(a)

    rb = reg.rollback()  # B → A
    out["rollback_restores_a"] = bool(rb) and reg.production_path() == str(a)
    out["rollback_logged"] = len(reg.history()) == 3  # A, B, A

    # Tamper the file: its hash now differs from what was recorded at promotion.
    a.write_bytes(b"TAMPERED")
    out["tamper_changes_sha"] = sha256_of(str(a)) != pa["sha256"]

    # Boot integrity check: with verification ON, a tampered production model is
    # rejected (fall back); with it OFF, it's accepted (verification is opt-in).
    os.environ["COG_MODEL_REGISTRY_PATH"] = str(reg_file)
    os.environ.pop("COG_MODEL_REGISTRY", None)
    os.environ["COG_MODEL_VERIFY"] = "true"
    out["boot_verify_rejects_tampered"] = _registry_production_path() is None
    os.environ["COG_MODEL_VERIFY"] = "false"
    out["boot_no_verify_accepts"] = _registry_production_path() == str(a)
    for k in ("COG_MODEL_REGISTRY_PATH", "COG_MODEL_VERIFY"):
        os.environ.pop(k, None)
    return out


def _audit_lock_part(tmp: pathlib.Path) -> dict:
    """Audit fields (promoted_by/reason/validation), cross-process promotion lock
    (mutual exclusion + stale steal), and rollback re-verification."""
    from cognition.models.model_registry import ModelRegistry

    out = {}
    a = tmp / "al_a.gguf"; a.write_bytes(b"AAerr")
    b = tmp / "al_b.gguf"; b.write_bytes(b"BBerr")
    reg_file = tmp / "al_registry.json"
    reg = ModelRegistry(path=reg_file)

    rec = reg.promote(str(a), promoted_by="ci-bot", reason="nightly-finetune",
                      validation={"status": "passed", "passed": 3, "total": 3})
    out["audit_fields_recorded"] = (
        bool(rec) and rec.get("promoted_by") == "ci-bot"
        and rec.get("reason") == "nightly-finetune"
        and (rec.get("validation") or {}).get("status") == "passed"
    )
    # Audit survives a reload from disk.
    reg2 = ModelRegistry(path=reg_file)
    prod = reg2.production() or {}
    out["audit_persists"] = prod.get("promoted_by") == "ci-bot" and \
        (prod.get("validation") or {}).get("total") == 3

    # Mutual exclusion: hold the lock file, a promote must time out (not corrupt).
    lock_path = reg_file.parent / (reg_file.name + ".lock")
    os.environ["COG_PROMOTE_LOCK_TIMEOUT"] = "1"
    os.environ["COG_PROMOTE_LOCK_STALE"] = "1000"
    fd = os.open(str(lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    try:
        blocked = reg2.promote(str(b))  # someone else holds the lock
        out["lock_blocks_concurrent_promote"] = blocked is None
        out["production_unchanged_when_locked"] = reg2.production_path() == str(a)
    finally:
        os.close(fd)
        try:
            os.unlink(lock_path)
        except OSError:
            pass

    # Stale-steal: an old lock is treated as orphaned and stolen.
    os.environ["COG_PROMOTE_LOCK_STALE"] = "0"  # any existing lock is instantly stale
    fd2 = os.open(str(lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    os.close(fd2)
    time.sleep(0.05)
    stolen = reg2.promote(str(b))  # should steal the stale lock and succeed
    out["stale_lock_is_stolen"] = bool(stolen) and reg2.production_path() == str(b)
    for k in ("COG_PROMOTE_LOCK_TIMEOUT", "COG_PROMOTE_LOCK_STALE"):
        os.environ.pop(k, None)

    # Rollback re-verification: tamper the previous model → rollback refuses.
    # History so far: A, B. previous() == A. Corrupt A on disk.
    a.write_bytes(b"TAMPERED-DIFFERENT-BYTES")
    out["rollback_refuses_tampered_prev"] = reg2.rollback() is None
    out["rollback_force_overrides"] = bool(reg2.rollback(verify=False)) and \
        reg2.production_path() == str(a)
    return out


def run():
    fails = 0

    def check(label, cond):
        nonlocal fails
        print(("  [PASS] " if cond else "  [FAIL] ") + label)
        if not cond:
            fails += 1

    with tempfile.TemporaryDirectory() as d:
        tmp = pathlib.Path(d)

        print("\n-- ModelRegistry: register / promote / persist -----")
        for label, ok in _registry_part(tmp).items():
            check(label, ok)

        print("\n-- LlamaCppBackend.reload: in-flight-safe hot-swap -")
        a = tmp / "reason_a.gguf"; a.write_bytes(b"a")
        b = tmp / "reason_b.gguf"; b.write_bytes(b"b")
        res = asyncio.run(_reload_part(str(a), str(b)))
        check("reload returned True", res["swapped"])
        check("active path swapped to B", res["model_path"] == str(b))
        check("model label updated to B", res["model_label"] == "reason_b.gguf")
        check("in-flight call on A completed cleanly (drained)", res["inflight_ok"])
        check("A was called twice (baseline + in-flight)", res["a_calls"] == 2)
        check("A inference never overlapped (peak == 1)", res["a_peak"] == 1)
        check("old model A evicted from the cache", res["a_evicted"])
        check("new model B resident in the cache", res["b_resident"])
        check("post-swap call routed to B", res["b_calls"] == 1)

        print("\n-- Boot-time selection: registry wins over env -----")
        for label, ok in _boot_part(tmp).items():
            check(label, ok)

        print("\n-- Robustness: corrupt registry + atomic writes ----")
        for label, ok in _robustness_part(tmp).items():
            check(label, ok)

        print("\n-- SHA256 integrity + rollback + boot verify -------")
        for label, ok in _sha_and_rollback_part(tmp).items():
            check(label, ok)

        print("\n-- Audit trail + promotion lock + rollback verify --")
        for label, ok in _audit_lock_part(tmp).items():
            check(label, ok)

    print("\n" + "=" * 54)
    if fails:
        print(f"MODEL-REGISTRY/HOT-SWAP TEST FAILED — {fails} check(s) wrong")
        sys.exit(1)
    print("MODEL-REGISTRY/HOT-SWAP TEST PASSED -- safe hot-swap [OK]")


if __name__ == "__main__":
    run()
