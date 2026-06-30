"""Cache-first fast-path unit test — runs inline, no test runner required.

Verifies `TaskAgent._cache_first` (the opt-out, ON-by-default selector cache
fast-path) takes the cache exactly when it is safe and fast, and falls through to
full reasoning otherwise:

  • HIT          — a proven, present, click selector → executes directly, returns
                   the re-observed page, records the action, never re-reasons.
  • consequential— a submit/pay/delete-style subgoal is NEVER fast-pathed (the
                   cache is not even consulted; the loop must run the gates).
  • below hits   — a selector not yet proven >= MIN times is not trusted.
  • fill         — a cached `fill` is skipped (no value to synthesize here).
  • not present  — a selector that isn't uniquely on the page is not used.
  • stale click  — a cached click that ERRORs is invalidated (forgotten) and
                   falls through; the page is NOT re-observed.
  • no entry     — nothing remembered → fall through.

The TaskAgent is built via __new__ (skipping the heavy __init__) with fakes for
selector memory / executor / perception, so the test needs no browser, no local
model, and no engine — pure logic.
"""

import asyncio
import logging
import pathlib
import sys
from types import SimpleNamespace

# Ensure the cognition package is on sys.path (mirrors test_firewall.py).
_HERE = pathlib.Path(__file__).parent  # .../src/cognition
sys.path.insert(0, str(_HERE.parent))  # .../src — makes `from cognition...` work

from cognition import task_agent as ta  # noqa: E402
from cognition.task_agent import TaskAgent  # noqa: E402

MIN_HITS = ta._CACHE_FIRST_MIN_HITS
DOMAIN = "linkedin.com"
_OBS_AFTER = object()  # sentinel returned by FakePerception.observe()


# ── Fakes ────────────────────────────────────────────────────────────────────
class FakeSelectorMemory:
    def __init__(self, entry=None):
        self._entry = entry
        self.looked_up = []          # (domain, intent) consultations
        self.forgotten = []          # (domain, intent) invalidations

    def lookup(self, domain, intent):
        self.looked_up.append((domain, intent))
        return self._entry

    def forget(self, domain, intent):
        self.forgotten.append((domain, intent))


class FakeExecutor:
    def __init__(self, present=True, result="Clicked cached selector '#x'."):
        self._present = present
        self._result = result
        self.exec_calls = []         # (tool, selector) direct executions

    async def present(self, selector):
        return self._present

    async def exec_by_selector(self, tool, selector, text=""):
        self.exec_calls.append((tool, selector))
        return self._result


class FakePerception:
    def __init__(self):
        self.observe_calls = 0

    async def observe(self):
        self.observe_calls += 1
        return _OBS_AFTER


class FakeShort:
    def __init__(self):
        self.actions = []

    def record_action(self, s):
        self.actions.append(s)


def _make_agent(entry=None, *, present=True, result="Clicked cached selector '#x'."):
    """A TaskAgent with only the attributes `_cache_first` touches, all faked."""
    agent = TaskAgent.__new__(TaskAgent)
    agent.selector_memory = FakeSelectorMemory(entry)
    agent.executor = FakeExecutor(present=present, result=result)
    agent.perception = FakePerception()
    agent.short = FakeShort()
    agent.emit = None  # makes TaskAgent._emit a no-op
    agent.log = logging.getLogger("test_cache_first")
    return agent


def _run(agent, subgoal):
    wm = SimpleNamespace(last_action=None)
    out = asyncio.run(agent._cache_first(subgoal, DOMAIN, wm, obs=None))
    return out, wm


# ── Cases ────────────────────────────────────────────────────────────────────
def run():
    fails = 0

    def check(label, cond):
        nonlocal fails
        if cond:
            print(f"  [PASS] {label}")
        else:
            print(f"  [FAIL] {label}")
            fails += 1

    print("\n-- HIT: proven, present, click → fast-path ----------")
    a = _make_agent({"selector": "#apply", "tool": "click", "hits": MIN_HITS})
    out, wm = _run(a, "Click Easy Apply")
    check("returns the re-observed page", out is _OBS_AFTER)
    check("executed the cached click once",
          a.executor.exec_calls == [("click", "#apply")])
    check("re-observed the page after acting", a.perception.observe_calls == 1)
    check("recorded last_action=cache:click", wm.last_action == "cache:click")
    check("did NOT invalidate the entry", a.selector_memory.forgotten == [])

    print("\n-- CONSEQUENTIAL subgoal is never fast-pathed -------")
    a = _make_agent({"selector": "#submit", "tool": "click", "hits": MIN_HITS})
    out, _ = _run(a, "Submit the application")
    check("falls through (returns None)", out is None)
    check("cache was NOT even consulted", a.selector_memory.looked_up == [])
    check("nothing executed", a.executor.exec_calls == [])

    print("\n-- Below MIN proven hits → not trusted --------------")
    a = _make_agent({"selector": "#apply", "tool": "click", "hits": MIN_HITS - 1})
    out, _ = _run(a, "Click Easy Apply")
    check("falls through (returns None)", out is None)
    check("nothing executed", a.executor.exec_calls == [])

    print("\n-- Cached fill is skipped (no value to synthesize) --")
    a = _make_agent({"selector": "#name", "tool": "fill", "hits": MIN_HITS})
    out, _ = _run(a, "Enter your full name")
    check("falls through (returns None)", out is None)
    check("nothing executed", a.executor.exec_calls == [])

    print("\n-- Selector not uniquely present → not used ---------")
    a = _make_agent({"selector": "#apply", "tool": "click", "hits": MIN_HITS},
                    present=False)
    out, _ = _run(a, "Click Easy Apply")
    check("falls through (returns None)", out is None)
    check("nothing executed", a.executor.exec_calls == [])

    print("\n-- Stale cached click (ERROR) → invalidate + fall ---")
    a = _make_agent({"selector": "#apply", "tool": "click", "hits": MIN_HITS},
                    result="ERROR running cached click on '#apply': detached")
    out, _ = _run(a, "Click Easy Apply")
    check("falls through (returns None)", out is None)
    check("attempted the cached click once",
          a.executor.exec_calls == [("click", "#apply")])
    check("invalidated the stale entry",
          a.selector_memory.forgotten == [(DOMAIN, "Click Easy Apply")])
    check("did NOT re-observe (left to the loop)", a.perception.observe_calls == 0)

    print("\n-- No entry remembered → fall through ---------------")
    a = _make_agent(None)
    out, _ = _run(a, "Click Easy Apply")
    check("falls through (returns None)", out is None)
    check("nothing executed", a.executor.exec_calls == [])

    print("\n" + "=" * 54)
    print(f"(COG_CACHE_FIRST default ON = {ta._CACHE_FIRST}, MIN_HITS = {MIN_HITS})")
    if fails:
        print(f"CACHE-FIRST TEST FAILED — {fails} check(s) wrong")
        sys.exit(1)
    print("CACHE-FIRST TEST PASSED -- all checks correct [OK]")


if __name__ == "__main__":
    run()
