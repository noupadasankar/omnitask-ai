"""Firewall WIRING test — runs inline, no test runner required.

`test_firewall.py` proves `hard_block` blocks the right patterns in isolation.
This test proves the firewall is actually WIRED INTO the agent loop: that a
malicious/hallucinated `fill` into an SSN or credit-card field is refused by
`TaskAgent.run()` BEFORE `ToolExecutor.execute` is ever called — and, critically,
that a BENIGN `fill` still executes (so the firewall isn't just blocking
everything).

It drives the real `TaskAgent.run()` with fakes for the engine's collaborators
(reasoner / planner / perception / memory / executor), so it needs no browser, no
local model, and no engine — pure control-flow verification. The reasoner is
scripted to propose the action under test, then `finish`.

Also direct-tests the extracted `TaskAgent._firewall_block` helper.
"""

import asyncio
import logging
import pathlib
import sys

# Ensure the cognition package is on sys.path (mirrors test_firewall.py).
_HERE = pathlib.Path(__file__).parent          # .../src/cognition
sys.path.insert(0, str(_HERE.parent))          # .../src — makes `from cognition...` work

from cognition.task_agent import TaskAgent                       # noqa: E402
from cognition.perception import Observation                     # noqa: E402
from cognition.brain.reasoning_engine import NextAction          # noqa: E402
from cognition.brain.decision_engine import DecisionEngine       # noqa: E402
from cognition.brain.critic import Critique                      # noqa: E402
from cognition.task_spec import TaskSpec                          # noqa: E402


# ── Scripted reasoner decisions ──────────────────────────────────────────────
def _fill(ref, text, thought):
    return NextAction(
        thought=thought, tool="fill",
        args={"ref": ref, "text": text},
        assessment={"confidence": 0.9, "risk": 0.1},
        raw={"action": {"tool": "fill", "ref": ref, "text": text}},
    )


def _finish():
    return NextAction(
        thought="done", tool="finish",
        args={"status": "done", "summary": "stop"},
        assessment={"confidence": 0.9, "risk": 0.0},
        raw={"action": {"tool": "finish", "status": "done"}},
    )


def _element(ref, label, selector):
    return {"ref": ref, "tag": "input", "type": "text", "role": None,
            "label": label, "text": "", "selector": selector, "disabled": False}


# ── Fakes for the loop's collaborators ───────────────────────────────────────
class FakePerception:
    def __init__(self, obs):
        self._obs = obs
    async def observe(self):
        return self._obs


class FakeShort:
    def __init__(self):
        self.goal = None
        self.current_url = None
        self.page_title = None
        self.subgoals = []
        self.recent_actions = []
    def record_action(self, s):
        self.recent_actions.append(s)


class FakePlanner:
    async def decompose(self, goal, context_hint="", *, plan_system=None,
                        fallback_subgoals=None):
        return ["complete the task"]


class FakeSelectorMemory:
    async def prime(self, domain):
        return None
    def hint_block(self, domain, **kw):
        return ""
    def known_selectors(self, domain):
        return set()
    def lookup(self, domain, intent):
        return None
    def remember(self, *a, **k):
        return None
    async def push_global(self, *a, **k):
        return None
    def forget(self, *a, **k):
        return None


class FakePatterns:
    def render_hint_block(self, domain):
        return ""


class FakeVector:
    async def search(self, q, k=3):
        return []
    async def add(self, *a, **k):
        return None


class FakeReasoner:
    def __init__(self, script):
        self._script = list(script)
        self._i = 0
    def system_prompt(self, spec=None):
        return "SYS"
    async def decide(self, messages):
        d = self._script[min(self._i, len(self._script) - 1)]
        self._i += 1
        return d


class FakeCritic:
    async def review(self, **kw):
        return Critique(allow=True, reason="ok", confidence=1.0)


class FakeExecutor:
    """Records every execute() so we can assert the firewall blocked it."""
    def __init__(self):
        self.execute_calls = []
    async def execute(self, tool, args):
        self.execute_calls.append((tool, dict(args)))
        return f"Did {tool}."
    async def present(self, selector):
        return False        # keep the cache-first fast-path inert in this test
    async def exec_by_selector(self, tool, selector, text=""):
        return "ERROR (unused)"


class FakeReflector:
    async def reflect(self, **kw):
        return []


class FakeExperiences:
    def record(self, episode):
        return None


class FakeLong:
    def add_lesson(self, *a, **k):
        return None


def _build_agent(elements, script):
    """A TaskAgent wired with fakes for everything run() touches."""
    agent = TaskAgent.__new__(TaskAgent)
    obs = Observation(url="https://jobs.example.com/apply", title="Apply",
                      text="", elements=elements)
    agent.perception = FakePerception(obs)
    agent.short = FakeShort()
    agent.planner = FakePlanner()
    agent.selector_memory = FakeSelectorMemory()
    agent.patterns = FakePatterns()
    agent.vector_memory = FakeVector()
    agent.reasoner = FakeReasoner(script)
    agent.decider = DecisionEngine()           # real numeric gate
    agent.critic = FakeCritic()
    agent.executor = FakeExecutor()
    agent.long_memory = FakeLong()
    agent.experiences = FakeExperiences()
    agent.reflector = FakeReflector()
    agent.vision = None
    agent.emit = None                          # makes _emit a no-op
    agent.approve = None
    agent.log = logging.getLogger("test_firewall_wiring")
    return agent


def _run_loop(elements, script):
    agent = _build_agent(elements, script)
    spec = TaskSpec(goal="Complete the application form", knowledge={})
    outcome = asyncio.run(agent.run(spec))
    return agent, outcome


# ── Tests ────────────────────────────────────────────────────────────────────
def run():
    fails = 0

    def check(label, cond):
        nonlocal fails
        if cond:
            print(f"  [PASS] {label}")
        else:
            print(f"  [FAIL] {label}")
            fails += 1

    # 1) Direct unit checks of the extracted pure helper.
    print("\n-- _firewall_block (pure helper) --------------------")
    agent = TaskAgent.__new__(TaskAgent)
    obs_cc = Observation(url="u", title="t", text="",
                         elements=[_element(0, "Credit Card Number", "#cc")])
    obs_name = Observation(url="u", title="t", text="",
                           elements=[_element(0, "Full Name", "#name")])
    d = _fill(0, "Jane Doe", "Fill the field")  # benign value, but field label is sensitive
    check("blocks fill into a Credit Card field (by element label)",
          agent._firewall_block("fill", d.args, d, obs_cc) is not None)
    d2 = _fill(0, "123-45-6789", "Enter the number")  # SSN-shaped value
    check("blocks fill of an SSN-shaped value",
          agent._firewall_block("fill", d2.args, d2, obs_name) is not None)
    d3 = _fill(0, "Jane Doe", "Enter the applicant name")
    check("allows a benign fill (name → name)",
          agent._firewall_block("fill", d3.args, d3, obs_name) is None)
    dc = NextAction(thought="open the menu", tool="click", args={"ref": 0},
                    assessment={}, raw={})
    check("allows a benign click",
          agent._firewall_block("click", dc.args, dc, obs_name) is None)

    # 2) Loop wiring: malicious SSN fill is refused before execution.
    print("\n-- run(): SSN fill is blocked, never executed -------")
    agent, outcome = _run_loop(
        [_element(0, "Social Security Number", "#ssn")],
        [_fill(0, "123-45-6789", "Enter the requested number"), _finish()],
    )
    check("executor.execute was NEVER called", agent.executor.execute_calls == [])
    check("loop still terminated cleanly", outcome is not None)

    # 3) Loop wiring: malicious credit-card fill is refused before execution.
    print("\n-- run(): credit-card fill is blocked, never run ----")
    agent, _ = _run_loop(
        [_element(0, "Credit Card Number", "#cc")],
        [_fill(0, "4111 1111 1111 1111", "Fill the payment field"), _finish()],
    )
    check("executor.execute was NEVER called", agent.executor.execute_calls == [])

    # 4) Control: a benign fill DOES execute (firewall isn't blocking everything).
    print("-- run(): benign fill passes through and executes ---")
    agent, _ = _run_loop(
        [_element(0, "Full Name", "#name")],
        [_fill(0, "Jane Doe", "Enter the applicant name"), _finish()],
    )
    check("executor.execute ran exactly the benign fill",
          agent.executor.execute_calls == [("fill", {"ref": 0, "text": "Jane Doe"})])

    print("\n" + "=" * 54)
    if fails:
        print(f"FIREWALL-WIRING TEST FAILED — {fails} check(s) wrong")
        sys.exit(1)
    print("FIREWALL-WIRING TEST PASSED -- firewall blocks before execute [OK]")


if __name__ == "__main__":
    run()
