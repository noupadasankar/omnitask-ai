"""Pre-promotion validation (canary) test — runs inline, no test runner.

Proves validate_model() / gate() correctly classify a candidate model as
passed / failed / skipped, using an injected fake backend so no GPU, no
llama_cpp, and no real GGUF are needed. A real broken GGUF would surface the same
way (won't load → failed; empty/gibberish → failed).
"""

import asyncio
import pathlib
import sys
import tempfile

# Ensure the cognition package is on sys.path (mirrors test_firewall.py).
_HERE = pathlib.Path(__file__).parent          # .../src/cognition
sys.path.insert(0, str(_HERE.parent))          # .../src

from cognition.models.model_validation import gate, validate_model  # noqa: E402


class FakeBackend:
    """Stand-in for LlamaCppBackend: scripts load state + chat output."""

    def __init__(self, available=True, responder=None):
        self._available = available
        self._responder = responder or (lambda prompt: "OK hello 4")

    async def is_available(self):
        return self._available

    async def chat(self, messages, **kwargs):
        return self._responder(messages[-1]["content"])


def run():
    fails = 0

    def check(label, cond):
        nonlocal fails
        print(("  [PASS] " if cond else "  [FAIL] ") + label)
        if not cond:
            fails += 1

    with tempfile.TemporaryDirectory() as d:
        tmp = pathlib.Path(d)
        model = tmp / "candidate.gguf"; model.write_bytes(b"x")

        print("\n-- validate_model: outcomes ------------------------")
        good = FakeBackend(responder=lambda p: "OK hello 4")
        r = asyncio.run(validate_model(str(model), backend=good))
        check("healthy model → passed (3/3)", r.status == "passed" and r.passed == 3)

        garbage = FakeBackend(responder=lambda p: "banana")
        r = asyncio.run(validate_model(str(model), backend=garbage))
        check("incoherent output → failed", r.status == "failed")

        empty = FakeBackend(responder=lambda p: "")
        r = asyncio.run(validate_model(str(model), backend=empty))
        check("empty output → failed", r.status == "failed")

        r = asyncio.run(validate_model(str(model), backend=FakeBackend(available=False)))
        check("model won't load → failed", r.status == "failed")

        r = asyncio.run(validate_model(str(tmp / "missing.gguf"), backend=good))
        check("missing file → failed", r.status == "failed")

        print("\n-- gate(): promotion decision ----------------------")
        check("gate passes a healthy model", gate(str(model), backend=good) is True)
        check("gate refuses a broken model", gate(str(model), backend=garbage) is False)
        check("gate --skip-validation bypasses", gate(str(model), skip=True) is True)

        # The 'skipped' path only happens with NO injected backend AND no llama_cpp.
        try:
            import llama_cpp  # noqa: F401
            have_llamacpp = True
        except Exception:
            have_llamacpp = False
        if not have_llamacpp:
            print("\n-- skipped path (no llama-cpp here) ----------------")
            r = asyncio.run(validate_model(str(model)))
            check("no backend + no llama-cpp → skipped", r.status == "skipped")
            check("gate skipped → True (warn, proceed)", gate(str(model)) is True)
            check("gate skipped + require → False", gate(str(model), require=True) is False)
        else:
            print("  [skip] llama-cpp present; 'skipped' path not exercised here")

    print("\n" + "=" * 54)
    if fails:
        print(f"MODEL-VALIDATION TEST FAILED — {fails} check(s) wrong")
        sys.exit(1)
    print("MODEL-VALIDATION TEST PASSED -- canary gate works [OK]")


if __name__ == "__main__":
    run()
