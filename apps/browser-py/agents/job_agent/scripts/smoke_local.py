"""Standalone smoke test for the fully-local cognitive engine.

Proves the on-device brain works end-to-end WITHOUT the full OmniTask stack, a
login, or any API key:
  1. Reaches the local Ollama server.
  2. Runs the JSON-action reasoning protocol against your pulled model.
  3. Exercises the embedding model used by semantic memory.

Run from the job_agent directory:
    python scripts/smoke_local.py
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

# Make `src...` importable when run as a script.
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.cognition.engine import LocalEngine  # noqa: E402
from src.cognition.brain.reasoning_engine import ReasoningEngine  # noqa: E402

# A tiny fake observation so the model has something concrete to act on.
_FAKE_OBSERVATION = """URL: https://example.com/apply
TITLE: Apply - Senior Engineer

INTERACTIVE ELEMENTS:
  [0] input:text label="Full name" value=""
  [1] input:email label="Email" value=""
  [2] button text="Next"

PAGE TEXT (excerpt):
Step 1 of 3 - Contact information."""

_FAKE_PROFILE = {"name": "Ada Lovelace", "email": "ada@example.com",
                 "years_of_experience": 7}


async def main() -> int:
    engine = LocalEngine()
    print(f"[1/3] Ollama host : {engine.host}")
    print(f"      reasoning   : {engine.model}")
    print(f"      embeddings  : {engine.llm.embed_model}")

    if not await engine.is_available():
        print("\nFAIL: Local model server not reachable.")
        print("Fix: install Ollama (https://ollama.com), then run:")
        print("     ollama serve")
        print(f"     ollama pull {engine.model}")
        return 1
    print("      reachable   : YES")

    # ── Reasoning (JSON-action protocol) ──────────────────────────────────────
    reasoner = ReasoningEngine(engine.llm)
    messages = [
        {"role": "system", "content": reasoner.system_prompt()},
        {"role": "user", "content": (
            "GOAL: Complete this application.\n\n"
            f"APPLICANT PROFILE:\n{_FAKE_PROFILE}\n\n"
            f"CURRENT OBSERVATION:\n{_FAKE_OBSERVATION}"
        )},
    ]
    print("\n[2/3] Asking the model for its next action...")
    decision = await reasoner.decide(messages)
    if not decision.valid:
        print("FAIL: model did not return a usable JSON action.")
        print("      (Try a stronger instruct model, e.g. OLLAMA_MODEL=qwen2.5:14b-instruct)")
        return 2
    print(f"      tool        : {decision.tool}")
    print(f"      args        : {decision.args}")
    print(f"      assessment  : {decision.assessment}")
    print(f"      thought     : {decision.thought[:160]}")

    # ── Embeddings (semantic memory) ──────────────────────────────────────────
    print("\n[3/3] Testing local embeddings...")
    vec = await engine.llm.embed("software engineer python remote")
    if vec:
        print(f"      embedding   : OK ({len(vec)} dims)")
    else:
        print(f"      embedding   : unavailable (run: ollama pull {engine.llm.embed_model})")
        print("      (semantic memory will fall back to keyword search — non-fatal)")

    print("\nSMOKE_OK — the local cognitive engine is working.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
