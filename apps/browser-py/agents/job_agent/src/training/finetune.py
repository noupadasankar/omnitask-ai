"""finetune.py — offline QLoRA fine-tuning of the local brain (no cloud, no API).

Consumes the ChatML JSONL produced by the backend `train:export` (GOLD +
DEMONSTRATION trajectories) and trains a LoRA adapter on a 4-bit-quantized base
model, so the brain gets better at YOUR sites/forms over time.

IMPORTANT — you do NOT train a `.gguf`. GGUF is llama.cpp's inference format and
is not trainable. The real pipeline is:

    HF base model (safetensors)  --QLoRA-->  LoRA adapter
                                 --merge-->  merged HF model
                          --convert_hf_to_gguf.py-->  new .gguf   (llama.cpp tool)
                          point LLAMACPP_MODEL_PATH at the new .gguf + restart engine

This script does the train + (optional) merge. The GGUF conversion is a separate,
documented manual step (printed at the end) because it ships with llama.cpp, not
with this repo.

Heavy ML deps (torch/transformers/peft/trl/bitsandbytes) are intentionally NOT in
the engine's requirements and are imported LAZILY here — so importing the engine
never pulls them. Install them only on the training box:

    pip install -r agents/job_agent/requirements-training.txt

Run:
    python -m src.training.finetune \\
        --data data/training/trajectories.jsonl \\
        --base-model Qwen/Qwen2.5-7B-Instruct \\
        --out data/training/adapter --epochs 1 --merge

VERIFY/VERSION NOTE: this targets the standard QLoRA stack (transformers + peft +
trl SFTTrainer/SFTConfig). TRL's API drifts across versions; if SFTConfig/
SFTTrainer kwargs error, pin to the versions in requirements-training.txt. This
script has NOT been run here (no GPU / deps); expect to adjust kwargs on first run.
"""

from __future__ import annotations

import argparse
import logging
import os
import subprocess
import sys
from pathlib import Path
from typing import List

from .dataloader import ChatMLExample, load_examples

log = logging.getLogger("browser-py.job_agent.training")

_PIP_HINT = (
    "Training deps missing. On the training machine run:\n"
    "    pip install -r agents/job_agent/requirements-training.txt\n"
    "(needs a CUDA GPU for 4-bit QLoRA; CPU-only training is impractical for 7B.)"
)

# LoRA target modules for Llama/Qwen/Mistral-family attention+MLP projections.
_DEFAULT_LORA_TARGETS = [
    "q_proj", "k_proj", "v_proj", "o_proj",
    "gate_proj", "up_proj", "down_proj",
]


def _parse_args(argv: List[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="QLoRA SFT for the local brain.")
    p.add_argument("--data", required=True, help="ChatML JSONL from train:export")
    p.add_argument("--base-model", required=True,
                   help="HF base model id or local path (e.g. Qwen/Qwen2.5-7B-Instruct)")
    p.add_argument("--out", default="data/training/adapter", help="output dir for the adapter")
    p.add_argument("--grades", default="GOLD,DEMONSTRATION",
                   help="comma list of trajectory grades to train on")
    p.add_argument("--epochs", type=float, default=1.0)
    p.add_argument("--batch-size", type=int, default=1)
    p.add_argument("--grad-accum", type=int, default=8)
    p.add_argument("--lr", type=float, default=2e-4)
    p.add_argument("--max-seq-len", type=int, default=4096)
    p.add_argument("--lora-r", type=int, default=16)
    p.add_argument("--lora-alpha", type=int, default=32)
    p.add_argument("--lora-dropout", type=float, default=0.05)
    p.add_argument("--eval-frac", type=float, default=0.1,
                   help="held-out fraction for eval loss (0 disables)")
    p.add_argument("--min-examples", type=int, default=50,
                   help="refuse to train on fewer than this many examples")
    p.add_argument("--merge", action="store_true",
                   help="also merge the adapter into the base and save a merged HF model")
    p.add_argument("--promote", action="store_true",
                   help="after a successful merge, convert to GGUF (needs LLAMACPP_CONVERT) "
                        "and promote it to production in the ModelRegistry")
    p.add_argument("--gguf-outtype", default="q4_k_m",
                   help="llama.cpp GGUF quantization type used when --promote converts")
    p.add_argument("--skip-validation", action="store_true",
                   help="bypass the pre-promotion health check (NOT recommended)")
    p.add_argument("--require-validation", action="store_true",
                   help="treat an un-runnable validation (no llama-cpp here) as a failure")
    return p.parse_args(argv)


def _to_text(examples: List[ChatMLExample], tokenizer) -> List[str]:
    """Render each ChatML example to a single training string via the model's own
    chat template, so training matches the format used at inference."""
    texts: List[str] = []
    for ex in examples:
        try:
            text = tokenizer.apply_chat_template(
                ex.messages, tokenize=False, add_generation_prompt=False
            )
        except Exception:
            # Fallback: a minimal manual ChatML rendering.
            text = "\n".join(f"<|{m['role']}|>\n{m['content']}" for m in ex.messages)
        texts.append(text)
    return texts


def main(argv: List[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [finetune] %(message)s")
    args = _parse_args(argv if argv is not None else sys.argv[1:])

    # Validate the --promote preconditions UP FRONT (before the multi-hour train),
    # so a missing converter is surfaced now, not hours later at promotion time.
    if args.promote:
        _validate_promote_preconditions(args)

    # ── Load data first (cheap, no ML deps) so we fail fast on empty/bad input ──
    grades = [g.strip() for g in args.grades.split(",") if g.strip()]
    examples = load_examples(args.data, grades=grades)
    if len(examples) < args.min_examples:
        log.error(
            "Only %d examples (need >= %d). Run more agent sessions to accumulate "
            "GOLD/DEMONSTRATION trajectories before training.",
            len(examples), args.min_examples,
        )
        return 2
    log.info("Loaded %d training examples (grades=%s).", len(examples), grades)

    # ── Lazy-import the heavy stack ─────────────────────────────────────────────
    try:
        import torch  # noqa: F401
        from datasets import Dataset
        from transformers import (
            AutoModelForCausalLM,
            AutoTokenizer,
            BitsAndBytesConfig,
        )
        from peft import LoraConfig, prepare_model_for_kbit_training
        from trl import SFTConfig, SFTTrainer
    except Exception as exc:  # noqa: BLE001
        log.error("%s\n(import error: %s)", _PIP_HINT, exc)
        return 1

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    # ── Tokenizer + 4-bit base model ────────────────────────────────────────────
    tokenizer = AutoTokenizer.from_pretrained(args.base_model, use_fast=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    bnb = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True,
        bnb_4bit_compute_dtype=torch.bfloat16,
    )
    model = AutoModelForCausalLM.from_pretrained(
        args.base_model,
        quantization_config=bnb,
        device_map="auto",
        torch_dtype=torch.bfloat16,
    )
    model.config.use_cache = False
    model = prepare_model_for_kbit_training(model)

    lora = LoraConfig(
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        lora_dropout=args.lora_dropout,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=_DEFAULT_LORA_TARGETS,
    )

    # ── Build the dataset (rendered text) + optional eval split ─────────────────
    texts = _to_text(examples, tokenizer)
    full = Dataset.from_dict({"text": texts})
    eval_ds = None
    train_ds = full
    if args.eval_frac and 0 < args.eval_frac < 0.5 and len(full) >= 20:
        split = full.train_test_split(test_size=args.eval_frac, seed=7)
        train_ds, eval_ds = split["train"], split["test"]

    sft_config = SFTConfig(
        output_dir=str(out_dir),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.grad_accum,
        learning_rate=args.lr,
        max_seq_length=args.max_seq_len,
        logging_steps=10,
        save_strategy="epoch",
        bf16=True,
        gradient_checkpointing=True,
        dataset_text_field="text",
        report_to=[],
        eval_strategy="epoch" if eval_ds is not None else "no",
    )

    trainer = SFTTrainer(
        model=model,
        args=sft_config,
        train_dataset=train_ds,
        eval_dataset=eval_ds,
        peft_config=lora,
        processing_class=tokenizer,
    )

    log.info("Starting QLoRA SFT (%d train / %s eval) …",
             len(train_ds), len(eval_ds) if eval_ds is not None else 0)
    trainer.train()

    if eval_ds is not None:
        metrics = trainer.evaluate()
        log.info("Held-out eval: %s", metrics)
        log.info(
            "NOTE: eval loss measures next-token fit, NOT task success. True "
            "validation = run the new model on held-out goals in the live browser "
            "and compare GOLD rate before promoting it."
        )

    adapter_dir = out_dir / "adapter"
    trainer.save_model(str(adapter_dir))
    tokenizer.save_pretrained(str(adapter_dir))
    log.info("Saved LoRA adapter → %s", adapter_dir)

    # ── Optional merge → a standalone HF model ready for GGUF conversion ────────
    if args.merge:
        try:
            from peft import PeftModel
            log.info("Merging adapter into base for GGUF conversion …")
            base = AutoModelForCausalLM.from_pretrained(
                args.base_model, torch_dtype=torch.bfloat16, device_map="cpu",
            )
            merged = PeftModel.from_pretrained(base, str(adapter_dir)).merge_and_unload()
            merged_dir = out_dir / "merged"
            merged.save_pretrained(str(merged_dir), safe_serialization=True)
            tokenizer.save_pretrained(str(merged_dir))
            log.info("Saved merged HF model → %s", merged_dir)
            _print_gguf_next_steps(merged_dir)
        except Exception as exc:  # noqa: BLE001
            log.error("Merge failed (%s). The adapter is still saved at %s.", exc, adapter_dir)
            return 1
    else:
        log.info("Skipped merge (pass --merge to produce a GGUF-convertible model).")

    _promote_after_train(args, len(examples), grades)

    return 0


def _validate_promote_preconditions(args: argparse.Namespace) -> None:
    """Warn EARLY (right after arg-parse, before the expensive train) if --promote
    cannot complete, so the operator can fix it or Ctrl-C now. Non-fatal: training
    still produces the artifacts, which can be promoted later via
    `python -m src.training.promote <gguf>`."""
    if not args.merge:
        log.warning("--promote needs --merge to produce a GGUF-convertible model; "
                    "auto-promotion will be skipped.")
    converter = os.environ.get("LLAMACPP_CONVERT", "")
    if not converter:
        log.warning("--promote set but LLAMACPP_CONVERT is unset; auto-promotion will be "
                    "skipped. Set it to llama.cpp's convert_hf_to_gguf.py, or promote "
                    "manually after converting.")
    elif not os.path.exists(converter):
        log.warning("--promote set but LLAMACPP_CONVERT=%s does not exist; auto-promotion "
                    "will be skipped.", converter)


def _promote_after_train(args: argparse.Namespace, example_count: int,
                         grades: List[str]) -> None:
    """Close the self-improvement loop: convert the merged HF model to GGUF and
    promote it to production in the ModelRegistry, so the engine picks it up on its
    next start (or via a live reload_from_registry). Opt-in via --promote.

    GGUF conversion needs llama.cpp's convert_hf_to_gguf.py, which ships with
    llama.cpp (not this repo): point LLAMACPP_CONVERT at it. Without it we do NOT
    fabricate a promotion — we print the manual step (`python -m src.training.promote
    <gguf>`) so the model is never silently "promoted" without a loadable artifact.
    """
    if not args.promote:
        return
    out_dir = Path(args.out)
    merged_dir = out_dir / "merged"
    if not merged_dir.exists():
        log.warning("--promote needs --merge (no merged model at %s); skipping promotion.",
                    merged_dir)
        return
    converter = os.environ.get("LLAMACPP_CONVERT", "")
    if not converter or not os.path.exists(converter):
        log.warning(
            "--promote set but LLAMACPP_CONVERT is not configured. Convert the merged "
            "model to GGUF (steps above), then promote it with:\n"
            "    python -m src.training.promote <new-model.gguf>"
        )
        return
    gguf_out = out_dir / "model.gguf"
    log.info("Converting merged model → GGUF (%s) via %s ...", args.gguf_outtype, converter)
    try:
        subprocess.run(
            [sys.executable, converter, str(merged_dir),
             "--outfile", str(gguf_out), "--outtype", args.gguf_outtype],
            check=True,
        )
    except (subprocess.CalledProcessError, OSError) as exc:
        log.error("GGUF conversion failed (%s); not promoting.", exc)
        return
    # Health-check the freshly converted GGUF BEFORE it can become production.
    from ..cognition.models.model_validation import gate_detailed
    ok, vresult = gate_detailed(str(gguf_out), require=args.require_validation,
                                skip=args.skip_validation, logger=log)
    if not ok:
        log.error("Candidate %s did not pass validation; leaving production unchanged.", gguf_out)
        return
    try:
        from ..cognition.models.model_registry import ModelRegistry
        entry = ModelRegistry().promote(
            str(gguf_out),
            notes=f"QLoRA SFT on {example_count} examples (grades={','.join(grades)})",
            source=getattr(args, "base_model", ""),
            promoted_by=os.environ.get("USER") or os.environ.get("USERNAME") or "finetune",
            reason="nightly-finetune",
            validation=vresult.summary(),
        )
    except Exception as exc:  # noqa: BLE001
        log.error("Promotion failed (%s); the GGUF is saved at %s.", exc, gguf_out)
        return
    if entry:
        log.info(
            "PROMOTED to production: %s (version %s). The engine uses it on its next "
            "start; for a live, in-flight-safe swap call "
            "`await engine.llm.reload_from_registry(ModelRegistry())`.",
            entry["path"], entry["version"],
        )
    else:
        log.error("Promotion did not take effect (GGUF missing at %s?).", gguf_out)


def _print_gguf_next_steps(merged_dir: Path) -> None:
    log.info(
        "\nNEXT — convert the merged model to GGUF for the LocalBrainEngine "
        "(uses llama.cpp, not this repo):\n"
        "  1) git clone https://github.com/ggerganov/llama.cpp\n"
        "  2) python llama.cpp/convert_hf_to_gguf.py %s --outfile new-model.gguf "
        "--outtype q4_k_m\n"
        "  3) set LLAMACPP_MODEL_PATH=/abs/path/new-model.gguf  and restart the "
        "engine (the llama.cpp backend's model cache is per-process).\n"
        "  4) Validate on held-out goals BEFORE keeping it (compare GOLD rate).",
        merged_dir,
    )


if __name__ == "__main__":
    raise SystemExit(main())
