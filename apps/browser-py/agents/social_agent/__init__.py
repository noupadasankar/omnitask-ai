"""Social agent package.

Provides SocialAgent — a Playwright-driven agent that handles:
  - Twitter/X: post drafting and posting, reading mentions/notifications
  - LinkedIn: post creation, reading notifications

The agent is consumed by the skills layer (skills/social.py) when a job
carries skill='social' and the task context requests live browser actions
(posting/reading) rather than pure AI content drafting.

Usage:
    from agents.social_agent import SocialAgent

    agent = SocialAgent(page, publisher, session_id, goal, job, user_id, ai)
    result = await agent.execute(task_context)
"""

from .social_agent import SocialAgent

__all__ = ["SocialAgent"]
