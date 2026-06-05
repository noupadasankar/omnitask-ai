"""Skill registry + dispatcher for the Python browser engine.

`run_domain_skill(name, ...)` is called by the executor when a job carries a
`domain`/`skill` hint. Unknown names fall back to the generic web skill, so the
engine can attempt *any* goal the user asks for.
"""

import logging

from ai import AIClient
from .base import SkillContext
from .research import ResearchSkill
from .shopping import ShoppingSkill
from .job import JobSkill
from .food import FoodSkill
from .social import SocialSkill
from .generic import GenericSkill

log = logging.getLogger("browser-py.skills")

# name/alias → skill instance
_SKILLS = {
    "research": ResearchSkill(),
    "shopping": ShoppingSkill(),
    "job": JobSkill(),
    "food": FoodSkill(),
    "social": SocialSkill(),
    "generic": GenericSkill(),
}

# Map Node domain categories / task types onto skills.
_ALIASES = {
    "job_search": "job",
    "jobs": "job",
    "shop": "shopping",
    "price_comparison": "shopping",
    "food_order": "food",
    "travel": "generic",   # travel intelligence is plan-driven on the Node side
    "general": "generic",
    "web": "generic",
}

_AI = AIClient()


def _resolve(name: str):
    key = (name or "").strip().lower()
    key = _ALIASES.get(key, key)
    return _SKILLS.get(key, _SKILLS["generic"]), key


async def run_domain_skill(name, page, publisher, session_id, goal, job, user_id) -> dict:
    skill, resolved = _resolve(name)
    log.info("Dispatching skill '%s' (from '%s') for session %s", resolved, name, session_id)

    ctx = SkillContext(page, publisher, session_id, goal, job, user_id, _AI)
    try:
        return await skill.run(ctx)
    except Exception as err:  # noqa: BLE001 — never crash the engine on a skill bug
        log.exception("Skill '%s' failed: %s", resolved, err)
        await ctx.log(f"Skill error: {err}", source="AIAgent", level="error")
        return {"status": "partial", "total": 0, "results": [], "items": []}
