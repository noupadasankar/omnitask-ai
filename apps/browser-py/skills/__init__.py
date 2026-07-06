"""Skill registry + dispatcher for the Python browser engine.

`run_domain_skill(name, ...)` is called by the executor when a job carries a
`domain`/`skill` hint. Unknown names fall back to the cognitive web-task skill
(which itself degrades to the generic search skill when the local model is
down), so the engine can attempt *any* goal the user asks for.
"""

import logging

from ai import AIClient
from .base import SkillContext
from .research import ResearchSkill
from .shopping import ShoppingSkill
from .job import JobSkill
from .job_application import JobApplicationSkill
from .food import FoodSkill
from .social import SocialSkill
from .generic import GenericSkill
from .web_task import WebTaskSkill
from .email import EmailSkill
from .media import MediaSkill
from .finance import FinanceSkill
from .booking import BookingSkill
from .travel import TravelSkill
from .calendar import CalendarSkill

log = logging.getLogger("browser-py.skills")

# name/alias → skill instance
_SKILLS = {
    "research": ResearchSkill(),
    "shopping": ShoppingSkill(),
    "job": JobSkill(),
    "job_application": JobApplicationSkill(),
    "food": FoodSkill(),
    "social": SocialSkill(),
    "web_task": WebTaskSkill(),
    "generic": GenericSkill(),
    "email": EmailSkill(),
    "media": MediaSkill(),
    "finance": FinanceSkill(),
    "booking": BookingSkill(),
    "travel":  TravelSkill(),
    "calendar": CalendarSkill(),
}

# Map Node domain categories / task types onto skills.
_ALIASES = {
    "job_search": "job",
    "jobs": "job",
    "auto_apply": "job_application",
    "apply_jobs": "job_application",
    "job_apply": "job_application",
    "shop": "shopping",
    "price_comparison": "shopping",
    "food_order": "food",
    "email_send": "email",
    "email_read": "email",
    "email_search": "email",
    "email_reply": "email",
    "email_manage": "email",
    "music_play": "media",
    "music_search": "media",
    "video_play": "media",
    "media_control": "media",
    # FinanceDomainAgent task types (backend sends these exact strings)
    "expense_tracking":   "finance",
    "financial_report":   "finance",
    "budget_management":  "finance",
    "spending_analysis":  "finance",
    # BookingDomainAgent task types (backend sends these exact strings)
    "ticket_booking":      "booking",
    "hotel_booking":       "booking",
    "restaurant_booking":  "booking",
    "appointment":         "booking",
    "reservation":         "booking",
    # TravelSkill task types (backend sends these exact strings)
    "travel":            "travel",
    "search_flights":    "travel",
    "flight_search":     "travel",
    "flights":           "travel",
    "search_hotels":     "travel",
    "hotel_search":      "travel",
    "build_itinerary":   "travel",
    "itinerary":         "travel",
    "plan_trip":         "travel",
    "book_flight":       "travel",
    "book_hotel":        "travel",
    # CalendarAgent task types (backend sends these exact strings)
    "create_event":      "calendar",
    "find_slot":         "calendar",
    "find_free_slot":    "calendar",
    "detect_conflict":   "calendar",
    "check_conflicts":   "calendar",
    "reschedule":        "calendar",
    "reschedule_event":  "calendar",
    "add_travel_buffer": "calendar",
    "travel_buffer":     "calendar",
    "schedule_meeting":  "calendar",
    "book_meeting":      "calendar",
    "general": "web_task",
    "web": "web_task",
    "computer_use": "web_task",
    "task": "web_task",
}

_AI = AIClient()


def _resolve(name: str):
    key = (name or "").strip().lower()
    key = _ALIASES.get(key, key)
    # Unknown goals get the cognitive web agent (which falls back to search).
    return _SKILLS.get(key, _SKILLS["web_task"]), key


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
