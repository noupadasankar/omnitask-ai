"""Offline training utilities for the local brain (no cloud, no API key).

The data lake is filled live: every (state -> decision) reasoning step is logged
to Postgres (TrajectoryStep) and graded GOLD/DEMONSTRATION on completion
(TrajectoryRun). The backend `train:export` script turns graded trajectories into
a ChatML JSONL file; `dataloader.py` here loads/validates/batches that file for an
offline QLoRA run.

Deliberately split: this package is the *read* side (pure stdlib, always
importable). The actual `finetune.py` (peft/transformers/QLoRA + GPU) is added
LATER — only once real trajectory volume exists and the llama.cpp base model is
verified — so no heavy training deps are imported here.
"""

from .dataloader import ChatMLExample, iter_examples, load_examples, batched

__all__ = ["ChatMLExample", "iter_examples", "load_examples", "batched"]
