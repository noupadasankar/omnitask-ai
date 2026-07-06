"""Email Agent package.

Standalone email agent that uses Playwright to drive Gmail/Outlook webmail:
read inbox, search messages, compose drafts, and send emails with approval
gating. Follows the same package structure as job_agent.

Consumed by executor.py via the 'email' skill in skills/__init__.py for
OmniTask-integrated runs.  Can also be driven directly through
EmailAgentOrchestrator for standalone/CLI usage.
"""

from .email_agent import EmailAgentOrchestrator

__all__ = ["EmailAgentOrchestrator"]
