"""promote.py — register + promote a converted GGUF as the production model.

The one manual seam in the self-improvement loop. `finetune.py --promote` auto-
promotes when llama.cpp's converter is configured (LLAMACPP_CONVERT); on boxes
without it you convert the merged HF model to GGUF yourself, then run:

    python -m src.training.promote /abs/path/new-model.gguf --notes "nightly v3"

The engine picks up the new production model on its next start (LocalLLMClient
backend selection consults the registry), or immediately via
`await engine.llm.reload_from_registry(ModelRegistry())`.
"""

from __future__ import annotations

import argparse
import sys
from typing import List, Optional


def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser(description="Promote a GGUF to the production model.")
    p.add_argument("gguf", help="path to the converted .gguf to promote")
    p.add_argument("--version", default=None, help="version label (defaults to the file stem)")
    p.add_argument("--notes", default="", help="free-text provenance note")
    p.add_argument("--source", default="", help="provenance (base model / checkpoint)")
    p.add_argument("--reason", default="manual", help="why this promotion happened (audit)")
    p.add_argument("--promoted-by", default="", help="operator/automation id (audit)")
    p.add_argument("--skip-validation", action="store_true",
                   help="bypass the pre-promotion health check (NOT recommended)")
    p.add_argument("--require-validation", action="store_true",
                   help="treat an un-runnable validation (no llama-cpp here) as a failure")
    args = p.parse_args(argv if argv is not None else sys.argv[1:])

    # Health-check the GGUF BEFORE it can become production.
    import os
    from ..cognition.models.model_validation import gate_detailed
    ok, vresult = gate_detailed(args.gguf, require=args.require_validation,
                                skip=args.skip_validation)
    if not ok:
        print(f"REFUSED: {args.gguf} did not pass pre-promotion validation.", file=sys.stderr)
        return 3

    from ..cognition.models.model_registry import ModelRegistry

    entry = ModelRegistry().promote(
        args.gguf, version=args.version, notes=args.notes, source=args.source,
        promoted_by=args.promoted_by or os.environ.get("USER") or os.environ.get("USERNAME") or "",
        reason=args.reason, validation=vresult.summary(),
    )
    if not entry:
        print(f"FAILED: GGUF not found: {args.gguf}", file=sys.stderr)
        return 2
    print(f"Promoted to production: {entry['path']} (version {entry['version']}).")
    print("The engine uses it on its next start, or call reload_from_registry() for a live swap.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
