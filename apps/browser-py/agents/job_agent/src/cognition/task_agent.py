"""TaskAgent — the generic, goal-agnostic observe → reason → act → verify → learn
loop. Drives ANY web task to completion using ONLY local models.

This is the engine the job applier specializes (`applier.CognitiveApplier` builds
a job `TaskSpec` and delegates here). It is identical in spirit to the original
job loop, but every job-specific assumption now comes from the injected
`TaskSpec`:

  • the goal + the KNOWLEDGE block it may answer from,
  • the integrity rules layered onto the reasoning system prompt,
  • whether consequential actions are pre-approved upstream (`spec.pre_approved`)
    or must be gated here via the injected `approve` callback,
  • the risk threshold above which a page action is "consequential".

Safety: when `spec.pre_approved` is False and an `approve` callback is supplied,
every consequential/high-risk page action is gated (approve-before-act). Under
`dry_run`, an approved consequential action is recorded but NOT performed. The
loop never fabricates consequential answers — it escalates via request_human.
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Any, Awaitable, Callable, Dict, List, Optional

from .brain import Critic, DecisionEngine, Planner, ReasoningEngine, Reflection, hard_block
from .browser_tools import CONTROL_TOOLS, EXTRACT_TOOL, VISION_TOOL, ToolExecutor
from .learning import ExperienceStore, PatternLearning
from .learning.pattern_learning import domain_of
from .memory import LongMemory, SelectorMemory, ShortMemory, VectorMemory
from .perception import Perception
from .task_spec import TaskSpec
from .vision import VisionReader
from .vision import ocr_engine  # noqa: F401  (probed lazily inside VisionReader)
from .world_model import TaskOutcome, TaskState, WorldModel, finish_to_task_state

log = logging.getLogger("browser-py.job_agent.cognition")

_MAX_STEPS = 30

# Emit signature: await emit(kind, payload). kind in {"log", "state"}.
EmitFn = Callable[[str, Dict[str, Any]], Awaitable[None]]
# Approval signature: await approve(action_info) -> bool (proceed or not).
ApproveFn = Callable[[Dict[str, Any]], Awaitable[bool]]

# Page actions that are consequential by their very nature, regardless of the
# model's self-assessed risk (a model can under-rate a submit). These are gated.
_ALWAYS_SENSITIVE_HINT = ("submit", "send", "post", "pay", "buy", "purchase",
                          "delete", "confirm", "place order", "checkout")

# Second-opinion LLM critic on consequential actions. Default on; disable with
# COG_CRITIC=false (the numeric DecisionEngine gate + human approval still apply).
_CRITIC_ENABLED = os.environ.get("COG_CRITIC", "true").strip().lower() not in (
    "0", "false", "no", "off",
)

# Cache-first execution: on a repeat run of a stable flow, if the current subgoal
# already has a proven selector PRESENT on the page, execute it directly and skip
# the LLM turn. ON by default; set COG_CACHE_FIRST=false to disable. The latency
# win on familiar flows is large and the path is conservative — it requires a
# selector proven >= COG_CACHE_FIRST_MIN_HITS times AND uniquely present right now,
# invalidates on any stale/failed click, and NEVER fires on consequential subgoals
# (those always go through reasoning → critic → approval).
_CACHE_FIRST = os.environ.get("COG_CACHE_FIRST", "true").strip().lower() not in (
    "0", "false", "no", "off",
)
# Minimum proven-hit count before a cached selector is trusted for direct execute.
_CACHE_FIRST_MIN_HITS = int(os.environ.get("COG_CACHE_FIRST_MIN_HITS", "2"))


class TaskAgent:
    """Self-operating loop for ANY web task, running on local models."""

    def __init__(self, engine, page, *, emit: Optional[EmitFn] = None,
                 approve: Optional[ApproveFn] = None,
                 logger: Optional[logging.Logger] = None):
        # `engine` is a LocalEngine bundle (see cognition.engine.LocalEngine).
        self.engine = engine
        self.llm = engine.llm
        self.page = page
        self.emit = emit
        self.approve = approve
        self.log = logger or log

        # Perception + action.
        self.perception = Perception(page)
        self.executor = ToolExecutor(page)
        self.vision = VisionReader(page, engine.vision)

        # Brain.
        self.reasoner = ReasoningEngine(self.llm)
        self.planner = Planner(self.llm)
        self.decider = DecisionEngine()
        self.critic = Critic(self.llm)
        self.reflector = Reflection(self.llm)

        # Memory + learning (shared, durable).
        self.long_memory: LongMemory = engine.long_memory
        self.vector_memory: VectorMemory = engine.vector_memory
        self.selector_memory: SelectorMemory = engine.selector_memory
        self.experiences: ExperienceStore = engine.experiences
        self.patterns: PatternLearning = engine.patterns
        self.short = ShortMemory()

    async def _emit(self, kind: str, payload: Dict[str, Any]) -> None:
        if self.emit is None:
            return
        try:
            await self.emit(kind, payload)
        except Exception:  # noqa: BLE001 — telemetry never breaks the loop
            pass

    def _is_consequential(self, tool: str, args: Dict[str, Any], risk: float,
                          spec: TaskSpec) -> bool:
        """Decide whether an action needs an approval gate before it runs."""
        if tool in CONTROL_TOOLS or tool in (
            VISION_TOOL, EXTRACT_TOOL, "scroll", "wait", "go_back", "navigate",
        ):
            return False
        if risk >= spec.sensitive_risk_threshold:
            return True
        # A high-stakes verb anywhere in the args/label is treated as sensitive
        # even if the model under-rated the risk.
        blob = " ".join(str(v) for v in args.values()).lower()
        return any(k in blob for k in _ALWAYS_SENSITIVE_HINT)

    def _firewall_block(self, tool: str, args: Dict[str, Any], decision,
                        obs) -> Optional[str]:
        """Hardcoded data-exfiltration firewall check — PURE (no side effects).

        Returns a block reason when the proposed action would type or target
        sensitive PII (card / CVV / SSN / bank id), else None. The model's stated
        intent is combined with the TARGETED element's label/text, so a
        benign-looking `fill` into a "Credit Card Number" field is caught even
        when the thought never mentioned it. The actual patterns live in
        `brain.critic.hard_block`; this method only assembles its inputs from the
        current decision + observation. Unit-tested in test_firewall_wiring.py.
        """
        fw_intent = decision.thought or ""
        ref = args.get("ref")
        if ref is not None:
            try:
                for el in obs.elements:
                    if el.get("ref") == int(ref):
                        fw_intent = f"{fw_intent} {el.get('label', '')} {el.get('text', '')}"
                        break
            except (TypeError, ValueError):
                pass
        fw_value = str(args.get("text", "")) if tool == "fill" else ""
        return hard_block(fw_intent, fw_value)

    async def run(self, spec: TaskSpec, *, context_hint: str = "",
                  dry_run: bool = False) -> TaskOutcome:
        goal = spec.goal
        wm = WorldModel(goal=goal)
        if spec.success_hint:
            wm.target_state = spec.success_hint
        self.short.goal = goal

        # ── Plan (autonomous decomposition) + recall learned hints ────────────
        obs = await self.perception.observe()
        wm.current_url, wm.page_title = obs.url, obs.title
        self.short.current_url, self.short.page_title = obs.url, obs.title
        domain = domain_of(obs.url)

        subgoals = await self.planner.decompose(
            goal, context_hint,
            plan_system=spec.plan_system,
            fallback_subgoals=spec.fallback_subgoals,
        )
        self.short.subgoals = subgoals
        await self._emit("log", {"message": "Plan: " + " → ".join(subgoals), "level": "info"})
        await self._emit("state", wm.to_event())

        # Pull fleet-wide proven selectors for this domain into the local store
        # (best-effort; degrades to local-only when Redis is absent).
        await self.selector_memory.prime(domain)
        learned = self.patterns.render_hint_block(domain)
        selector_hints = self.selector_memory.hint_block(domain)
        known = self.selector_memory.known_selectors(domain)
        recalled = await self.vector_memory.search(f"{goal} {domain}", k=3)
        recall_block = ""
        if recalled:
            recall_block = "RELEVANT PAST NOTES:\n" + "\n".join(
                f"  - {r.get('text','')}" for r in recalled
            )

        # ── Seed the transcript ───────────────────────────────────────────────
        system = self.reasoner.system_prompt(spec)
        intro_parts = [
            f"GOAL: {goal}",
            "PLAN (subgoals): " + "; ".join(subgoals),
        ]
        if context_hint:
            intro_parts.append("CONTEXT: " + context_hint)
        if learned:
            intro_parts.append(learned)
        if selector_hints:
            intro_parts.append(selector_hints)
        if recall_block:
            intro_parts.append(recall_block)
        if spec.knowledge:
            intro_parts.append(f"{spec.knowledge_label}:\n" + spec.knowledge_text())
        intro_parts.append("CURRENT OBSERVATION:\n" + obs.render(known_selectors=known))

        messages: List[Dict[str, Any]] = [
            {"role": "system", "content": system},
            {"role": "user", "content": "\n\n".join(intro_parts)},
        ]

        # Monotonic pointer into the plan, advanced on each successful page action.
        # Used only by the (opt-in) cache-first fast-path to pick a subgoal intent.
        subgoal_idx = 0

        for step in range(1, _MAX_STEPS + 1):
            wm.step = step

            # ── CACHE-FIRST fast-path (opt-in): try a proven selector for the
            # current subgoal and skip the LLM turn entirely on a confident hit ─
            if _CACHE_FIRST and subgoal_idx < len(subgoals):
                hit = await self._cache_first(subgoals[subgoal_idx], domain, wm, obs)
                if hit is not None:
                    obs = hit  # re-observed page after the cached action
                    wm.current_url, wm.page_title = obs.url, obs.title
                    self.short.current_url, self.short.page_title = obs.url, obs.title
                    # Keep the transcript coherent so a later reasoning turn sees
                    # the post-cache page, not stale context.
                    messages.append({"role": "user", "content": (
                        f"(Completed subgoal via known control: {subgoals[subgoal_idx]})\n"
                        f"UPDATED OBSERVATION:\n{obs.render(known_selectors=known)}"
                    )})
                    subgoal_idx += 1
                    await self._emit("state", wm.to_event())
                    continue

            # ── THINK: choose the next action (local model, JSON) ─────────────
            try:
                decision = await self.reasoner.decide(messages)
            except Exception as exc:  # noqa: BLE001
                self.log.error(f"Local reasoning call failed: {exc}", exc_info=True)
                return await self._finalize(wm, TaskState.ABANDONED,
                                            f"reasoning error: {exc}", domain, "abandoned")

            if not decision.valid:
                self.log.warning("Reasoner returned no action — abandoning.")
                return await self._finalize(wm, TaskState.ABANDONED,
                                            "no action proposed", domain, "abandoned")

            wm.apply_assessment(decision.assessment)
            wm.last_action = decision.tool
            if decision.thought:
                await self._emit("log", {"message": decision.thought, "level": "info"})

            # ── Capture the (state → decision) pair for the training data lake ─
            await self._emit("trajectory", {
                "stepIndex": step,
                "goal": goal,
                "domain": domain,
                "url": wm.current_url,
                "observation": obs.render(known_selectors=known)[:6000],
                "decision": decision.raw,
                "tool": decision.tool,
                "confidence": round(wm.confidence, 3),
                "risk": round(wm.risk, 3),
            })

            tool, args = decision.tool, decision.args

            # ── Confidence / risk gate ────────────────────────────────────────
            verdict = self.decider.evaluate(tool, decision.assessment)
            if not verdict.proceed:
                self.log.warning(f"Decision gate blocked '{tool}': {verdict.reason}")
                await self._emit("log", {
                    "message": f"Holding back '{tool}' — {verdict.reason}. Re-evaluating.",
                    "level": "warn",
                })
                messages.append({"role": "assistant", "content": _action_echo(decision.raw)})
                messages.append({"role": "user", "content": (
                    f"That action was gated ({verdict.reason}). If it is a consequential "
                    f"required input you cannot ground in KNOWLEDGE, use request_human "
                    f"then finish(status=\"blocked\"). Otherwise choose a safer next action."
                )})
                continue

            # ── Control-flow tools ────────────────────────────────────────────
            if tool == "finish":
                status = str(args.get("status", "abandoned"))
                state = finish_to_task_state(status)
                return await self._finalize(wm, state, str(args.get("summary", status)),
                                            domain, status)

            if tool == "request_human":
                question = str(args.get("question", "")).strip()
                if question and question not in wm.missing_information:
                    wm.missing_information.append(question[:300])
                await self._emit("log", {"message": f"Needs human input: {question}",
                                         "level": "warn"})
                await self._emit("state", wm.to_event())
                messages.append({"role": "assistant", "content": _action_echo(decision.raw)})
                messages.append({"role": "user", "content": (
                    "No live human channel answers free-text here. If this input is "
                    "required and cannot be grounded in KNOWLEDGE, call "
                    "finish(status=\"blocked\"). Otherwise continue."
                )})
                continue

            # ── EXTRACT tool: capture structured data, no page change ─────────
            if tool == EXTRACT_TOOL:
                data = args.get("data", args)
                wm.extracted.append(data if isinstance(data, dict) else {"value": data})
                self.short.record_action(f"extract: {str(data)[:160]}")
                await self._emit("state", wm.to_event())
                messages.append({"role": "assistant", "content": _action_echo(decision.raw)})
                messages.append({"role": "user", "content": (
                    f"Recorded ({len(wm.extracted)} item(s) so far). Continue, or "
                    f"finish(status=\"done\") when the goal is satisfied."
                )})
                continue

            # ── VISION tool ───────────────────────────────────────────────────
            if tool == VISION_TOOL:
                question = str(args.get("question", "Describe the current screen and any forms, errors, or dialogs."))
                self.short.record_action(f"look: {question}")
                await self._emit("state", wm.to_event())
                desc = await self.vision.look(question)
                messages.append({"role": "assistant", "content": _action_echo(decision.raw)})
                messages.append({"role": "user", "content": "VISION OBSERVATION:\n" + desc})
                continue

            # ── HARDCODED data-exfiltration firewall (absolute, fail-closed) ──
            # Runs before the critic, approval, and execution — and regardless of
            # COG_CRITIC. The agent may NEVER type a card/CVV/SSN/bank id into a
            # field, even if a page or a hallucinated step demands it. The pure
            # check lives in `_firewall_block` (unit-tested in test_firewall_wiring.py).
            block_reason = self._firewall_block(tool, args, decision, obs)
            if block_reason:
                self.log.warning(f"Hardcoded firewall {block_reason} — refusing '{tool}'.")
                await self._emit("log", {
                    "message": f"🛑 Safety firewall {block_reason} — action refused.",
                    "level": "error",
                })
                messages.append({"role": "assistant", "content": _action_echo(decision.raw)})
                messages.append({"role": "user", "content": (
                    f"SECURITY FIREWALL: that action was hard-blocked ({block_reason}). "
                    f"NEVER enter payment-card, CVV, SSN, or bank-identifier data. Choose a "
                    f"different action, or finish(status=\"blocked\") if the task truly "
                    f"requires such data."
                )})
                continue

            # ── Consequential action: second-opinion critic, then approval ────
            sensitive = self._is_consequential(tool, args, wm.risk, spec)

            if sensitive and _CRITIC_ENABLED:
                critique = await self.critic.review(
                    goal=goal, tool=tool, args=args,
                    observation_text=obs.render(), thought=decision.thought,
                )
                if not critique.allow:
                    self.log.warning(f"Critic blocked '{tool}': {critique.reason}")
                    await self._emit("log", {
                        "message": f"Critic blocked '{tool}' — {critique.reason}. Reconsidering.",
                        "level": "warn",
                    })
                    messages.append({"role": "assistant", "content": _action_echo(decision.raw)})
                    messages.append({"role": "user", "content": (
                        f"A safety reviewer BLOCKED that action: {critique.reason}. "
                        f"Do not repeat it. Verify required fields/targets first, or "
                        f"choose a safer next action; use finish(status=\"blocked\") if "
                        f"you cannot proceed safely."
                    )})
                    continue

            # ── Approval gate for consequential page actions ──────────────────
            if sensitive and not spec.pre_approved and self.approve is not None:
                wm.state = TaskState.REVIEWING
                await self._emit("state", wm.to_event())
                ok = await self.approve({
                    "tool": tool, "args": args,
                    "description": decision.thought or f"{tool} (consequential)",
                    "risk": round(wm.risk, 2),
                })
                if not ok:
                    await self._emit("log", {
                        "message": f"Approval denied/timed out for '{tool}' — stopping.",
                        "level": "warn",
                    })
                    return await self._finalize(wm, TaskState.BLOCKED,
                                                "user declined a consequential action",
                                                domain, "blocked")

            if sensitive and dry_run:
                # Approved (or pre-approved) but dry-run: record, don't perform.
                await self._emit("log", {
                    "message": f"[DRY RUN] Skipped consequential action '{tool}'.",
                    "level": "info",
                })
                return await self._finalize(wm, TaskState.DONE,
                                            f"dry-run: stopped before '{tool}'",
                                            domain, "done")

            # ── PAGE action: ACT → re-OBSERVE → VERIFY ────────────────────────
            wm.state = TaskState.ACTING
            await self._emit("state", wm.to_event())

            # Capture the acted element's stable selector + label BEFORE acting
            # (refs are invalidated by the next observation).
            ref = args.get("ref")
            acted_selector = ""
            acted_label = ""
            if ref is not None:
                try:
                    acted_selector = obs.selector_for(int(ref))
                    for _el in obs.elements:
                        if _el.get("ref") == int(ref):
                            acted_label = _el.get("label") or _el.get("text") or ""
                            break
                except (TypeError, ValueError):
                    pass

            result_text = await self.executor.execute(tool, args)
            self.short.record_action(f"{tool} {args} -> {result_text}")

            # Remember a control that worked (ERROR results start with "ERROR").
            if acted_selector and not str(result_text).startswith("ERROR"):
                self.selector_memory.remember(
                    domain, acted_label or tool, acted_selector, tool
                )
                # Also key it by the CURRENT SUBGOAL so the cache-first fast-path
                # can find it by subgoal intent on a later run of the same flow.
                if subgoal_idx < len(subgoals):
                    self.selector_memory.remember(
                        domain, subgoals[subgoal_idx], acted_selector, tool
                    )
                # Publish to the global (Redis) wisdom cache, fire-and-forget.
                asyncio.create_task(self.selector_memory.push_global(
                    domain, acted_label or tool, acted_selector, tool
                ))
                known = self.selector_memory.known_selectors(domain)
                # Advance the plan pointer so the fast-path tracks progress
                # whether a step came from cache or from reasoning.
                if subgoal_idx < len(subgoals) - 1:
                    subgoal_idx += 1

            obs = await self.perception.observe()
            wm.current_url, wm.page_title = obs.url, obs.title
            self.short.current_url, self.short.page_title = obs.url, obs.title

            messages.append({"role": "assistant", "content": _action_echo(decision.raw)})
            messages.append({"role": "user", "content": (
                f"ACTION RESULT: {result_text}\n\nUPDATED OBSERVATION:\n"
                + obs.render(known_selectors=known)
            )})
            await self._emit("state", wm.to_event())

        self.log.warning("Cognitive loop hit step budget without finishing.")
        return await self._finalize(wm, TaskState.ABANDONED,
                                    "step budget exhausted", domain, "abandoned")

    async def _cache_first(self, subgoal: str, domain: str, wm, obs):
        """Try a proven selector for `subgoal` directly, skipping the LLM turn.

        Returns the re-observed page (Observation) on a confident hit, or None to
        fall through to full reasoning. Conservative by design: only benign,
        NON-consequential actions take this path; submit/pay/delete-style subgoals
        always reason (so the critic + approval gates run). A stale cached
        selector is invalidated and we fall through.
        """
        intent = subgoal.lower()
        if any(k in intent for k in _ALWAYS_SENSITIVE_HINT):
            return None  # consequential → always reason (gates must run)
        if hard_block(subgoal):
            return None  # sensitive-data subgoal → never fast-path; reason + firewall

        entry = self.selector_memory.lookup(domain, subgoal)
        if not entry:
            return None
        if int(entry.get("hits", 0)) < _CACHE_FIRST_MIN_HITS:
            return None
        selector = entry.get("selector")
        tool = entry.get("tool", "click")
        if tool not in ("click", "fill") or not selector:
            return None
        # fill needs a value we can't synthesize without the model/profile here.
        if tool == "fill":
            return None
        if not await self.executor.present(selector):
            return None

        await self._emit("log", {
            "message": f"Cache-first: '{subgoal}' → {selector} (hits={entry.get('hits')}), skipping LLM.",
            "level": "info",
        })
        wm.last_action = f"cache:{tool}"
        result_text = await self.executor.exec_by_selector(tool, selector)
        self.short.record_action(f"cache {tool} {selector} -> {result_text}")

        if str(result_text).startswith("ERROR"):
            # Stale/changed — drop it from the local store and fall through.
            self.selector_memory.forget(domain, subgoal)
            await self._emit("log", {
                "message": f"Cache-first miss (stale selector) for '{subgoal}' — reasoning instead.",
                "level": "warn",
            })
            return None

        return await self.perception.observe()

    async def _finalize(self, wm, state: TaskState, summary: str, domain: str,
                        status: str) -> TaskOutcome:
        """Set terminal state, reflect, and persist learning (LEARN step)."""
        wm.state = state
        await self._emit("log", {
            "message": f"Task finished: {state.value} — {summary}",
            "level": "success" if state == TaskState.DONE else "info",
        })
        await self._emit("state", wm.to_event())

        # Reflect → lessons → long-term + pattern + vector memory.
        try:
            lessons = await self.reflector.reflect(
                goal=wm.goal, outcome=state.value.lower(), steps=wm.step,
                actions=self.short.recent_actions, summary=summary,
            )
        except Exception:  # noqa: BLE001
            lessons = []

        episode = {
            "domain": domain,
            "goal": wm.goal,
            "outcome": state.value.lower(),
            "steps": wm.step,
            "summary": summary,
            "lessons": lessons,
            "missing_information": wm.missing_information,
            "extracted": len(wm.extracted),
        }
        try:
            self.experiences.record(episode)
            for lesson in lessons:
                self.long_memory.add_lesson(lesson, domain=domain)
            if lessons:
                await self.vector_memory.add(
                    f"[{domain}] {wm.goal}: " + " ".join(lessons),
                    metadata={"domain": domain, "outcome": state.value.lower()},
                )
        except Exception as exc:  # noqa: BLE001
            self.log.debug(f"Learning persistence failed: {exc}")

        return TaskOutcome(state=state, status=status, summary=summary, steps=wm.step,
                           data=list(wm.extracted),
                           missing_information=wm.missing_information)


def _action_echo(raw: Dict[str, Any]) -> str:
    """Compact echo of the model's own JSON decision, appended as the assistant
    turn so the transcript stays coherent across turns."""
    import json
    try:
        return json.dumps(raw, ensure_ascii=False)[:1200]
    except Exception:
        return str(raw)[:1200]
