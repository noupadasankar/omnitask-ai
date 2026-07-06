"""llama.cpp inference-serialization test — runs inline, no test runner required.

A llama-cpp-python `Llama` is NOT reentrant, yet one resident instance is shared
across every session (see llamacpp_backend._MODELS). This test proves the backend
serializes inference on that shared instance: 6 concurrent `chat()` calls must
enter the model ONE AT A TIME (peak concurrency == 1), or the KV cache would
corrupt under real multi-session load.

It injects a fake `Llama` into the process-wide model cache, so it needs no GPU,
no `llama_cpp`, and no GGUF on disk — only the lock logic under test runs.
"""

import asyncio
import os
import pathlib
import sys
import threading
import time

# Ensure the cognition package is on sys.path (mirrors test_firewall.py).
_HERE = pathlib.Path(__file__).parent          # .../src/cognition
sys.path.insert(0, str(_HERE.parent))          # .../src

# A configured model path is required before the backend reads the env.
os.environ.setdefault("LLAMACPP_MODEL_PATH", "/tmp/fake-reasoning.gguf")

from cognition.models.backends.llamacpp_backend import (  # noqa: E402
    LlamaCppBackend,
    _MODELS,
)


class FakeLlama:
    """Stand-in for llama_cpp.Llama that records peak concurrent entry."""

    def __init__(self):
        self.active = 0
        self.peak = 0
        self.calls = 0
        self._l = threading.Lock()

    def _enter(self):
        with self._l:
            self.active += 1
            self.calls += 1
            self.peak = max(self.peak, self.active)

    def _exit(self):
        with self._l:
            self.active -= 1

    def create_chat_completion(self, **kwargs):
        self._enter()
        time.sleep(0.05)  # hold the "model" so any overlap is observable
        self._exit()
        return {"choices": [{"message": {"content": "{}"}}]}


async def _drive(n: int):
    backend = LlamaCppBackend()
    fake = FakeLlama()
    # Inject the fake as the resident model so _load_sync never imports llama_cpp.
    _MODELS[backend.model_path] = fake
    out = await asyncio.gather(
        *[backend.chat([{"role": "user", "content": "hi"}]) for _ in range(n)]
    )
    return fake, out


def run():
    fails = 0

    def check(label, cond):
        nonlocal fails
        print(("  [PASS] " if cond else "  [FAIL] ") + label)
        if not cond:
            fails += 1

    N = 6
    fake, out = asyncio.run(_drive(N))

    print("\n-- concurrent inference on one shared model ---------")
    check(f"all {N} concurrent calls completed", len(out) == N and all(o == "{}" for o in out))
    check(f"model was entered exactly {N} times", fake.calls == N)
    check("inference NEVER overlapped (peak concurrency == 1)", fake.peak == 1)

    print("\n" + "=" * 54)
    print(f"(observed peak concurrency = {fake.peak}, calls = {fake.calls})")
    if fails:
        print(f"LLAMACPP CONCURRENCY TEST FAILED — {fails} check(s) wrong")
        sys.exit(1)
    print("LLAMACPP CONCURRENCY TEST PASSED -- inference is serialized [OK]")


if __name__ == "__main__":
    run()
