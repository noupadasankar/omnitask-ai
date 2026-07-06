"""rollback.py — restore the previous production model.

Re-promotes the model that was production before the current one (from the
registry's promotion history). Used when a freshly promoted model regresses in
the live browser despite passing the pre-promotion smoke check:

    python -m src.training.rollback

The engine picks up the restored model on its next start, or immediately via
`await engine.llm.reload_from_registry(ModelRegistry())`.
"""

from __future__ import annotations

import sys
from typing import List, Optional


def main(argv: Optional[List[str]] = None) -> int:
    import argparse

    argparse.ArgumentParser(description="Roll back to the previous production model.") \
        .parse_args(argv if argv is not None else sys.argv[1:])

    from ..cognition.models.model_registry import ModelRegistry

    reg = ModelRegistry()
    current = reg.production_path()
    entry = reg.rollback()
    if not entry:
        print("Nothing to roll back to (no prior production model in history).", file=sys.stderr)
        return 1
    print(f"Rolled back: {current} → {entry['path']} (version {entry['version']}).")
    print("The engine uses it on its next start, or call reload_from_registry() for a live swap.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
