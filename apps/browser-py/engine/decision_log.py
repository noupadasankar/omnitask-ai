"""AI decision log — records every AI-assisted decision for debugging and fine-tuning."""

import json
import logging
import time
import uuid
from collections import deque
from dataclasses import dataclass, field, asdict
from typing import Optional

log = logging.getLogger("browser-py.engine.decision_log")


@dataclass
class CandidateAction:
    action_type: str
    selector: str
    description: str
    confidence: float
    reasoning: str


@dataclass
class AIDecision:
    decision_id: str
    timestamp: float
    session_id: str
    step_id: str
    user_intent: str
    context_summary: str
    page_url: str
    dom_node_count: int
    candidates_considered: list
    chosen_action: dict
    confidence_score: float
    model_used: str
    prompt_tokens: int
    completion_tokens: int
    verification_outcome: str   # success | failure | unknown
    verification_details: dict


class AIDecisionLog:
    """Records all AI-assisted decisions with full context."""

    def __init__(self, max_entries: int = 2000):
        self._decisions: deque = deque(maxlen=max_entries)
        self._index: dict[str, AIDecision] = {}

    def record(
        self,
        session_id: str,
        step_id: str,
        user_intent: str,
        context_summary: str,
        page_url: str,
        dom_node_count: int,
        candidates: list,           # list of CandidateAction or dicts
        chosen: "CandidateAction | dict",
        confidence: float,
        model: str,
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
    ) -> str:
        """Record a decision and return its ID."""
        decision_id = str(uuid.uuid4())

        # Normalize candidates
        cands = []
        for c in candidates:
            if isinstance(c, CandidateAction):
                cands.append(asdict(c))
            elif isinstance(c, dict):
                cands.append(c)

        # Normalize chosen
        chosen_dict = asdict(chosen) if isinstance(chosen, CandidateAction) else dict(chosen)

        decision = AIDecision(
            decision_id=decision_id,
            timestamp=time.time(),
            session_id=session_id,
            step_id=step_id,
            user_intent=user_intent,
            context_summary=context_summary,
            page_url=page_url,
            dom_node_count=dom_node_count,
            candidates_considered=cands,
            chosen_action=chosen_dict,
            confidence_score=confidence,
            model_used=model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            verification_outcome="unknown",
            verification_details={},
        )

        self._decisions.append(decision)
        self._index[decision_id] = decision
        return decision_id

    def complete(
        self,
        decision_id: str,
        verification_outcome: str,
        verification_details: dict = {},
    ) -> None:
        """Fill in post-action verification for a recorded decision."""
        decision = self._index.get(decision_id)
        if not decision:
            log.debug("complete: decision_id %s not found", decision_id)
            return
        decision.verification_outcome = verification_outcome
        decision.verification_details = verification_details

    def get_decisions(self, session_id: Optional[str] = None) -> list[AIDecision]:
        decisions = list(self._decisions)
        if session_id:
            decisions = [d for d in decisions if d.session_id == session_id]
        return decisions

    def get_by_id(self, decision_id: str) -> Optional[AIDecision]:
        return self._index.get(decision_id)

    def get_accuracy_rate(self, session_id: Optional[str] = None) -> float:
        """Return success / total for decisions with known outcomes."""
        decisions = self.get_decisions(session_id)
        known = [d for d in decisions if d.verification_outcome != "unknown"]
        if not known:
            return 0.0
        successes = sum(1 for d in known if d.verification_outcome == "success")
        return successes / len(known)

    def export_jsonl(self) -> str:
        """Export all decisions as newline-delimited JSON."""
        lines = []
        for d in self._decisions:
            lines.append(json.dumps(asdict(d)))
        return "\n".join(lines)

    def export_chatml(self) -> str:
        """Export decisions as ChatML format for fine-tuning."""
        blocks = []
        for d in self._decisions:
            system = f"Browser automation context. URL: {d.page_url}. {d.context_summary}"
            user = d.user_intent
            assistant = json.dumps(d.chosen_action)
            block = (
                f"<|im_start|>system\n{system}<|im_end|>\n"
                f"<|im_start|>user\n{user}<|im_end|>\n"
                f"<|im_start|>assistant\n{assistant}<|im_end|>"
            )
            blocks.append(block)
        return "\n\n".join(blocks)

    def get_summary(self) -> dict:
        decisions = list(self._decisions)
        known = [d for d in decisions if d.verification_outcome != "unknown"]
        successes = [d for d in known if d.verification_outcome == "success"]
        models: dict[str, int] = {}
        for d in decisions:
            models[d.model_used] = models.get(d.model_used, 0) + 1
        avg_conf = (
            sum(d.confidence_score for d in decisions) / len(decisions)
            if decisions else 0.0
        )
        return {
            "total": len(decisions),
            "success_count": len(successes),
            "fail_count": len(known) - len(successes),
            "unknown_count": len(decisions) - len(known),
            "accuracy": round(self.get_accuracy_rate(), 3),
            "avg_confidence": round(avg_conf, 3),
            "top_models": sorted(models.items(), key=lambda x: -x[1])[:5],
        }
