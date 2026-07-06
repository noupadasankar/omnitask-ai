"""Research Agent package.

Standalone research agent that uses Playwright to search the web, visit top
sources, extract page content, and compile a structured report. Follows the
same package structure as job_agent.

Consumed by executor.py via the 'research' skill in skills/__init__.py for
OmniTask-integrated runs.  Can also be driven directly through
ResearchAgentOrchestrator for standalone/CLI usage.
"""

from .research_agent import ResearchAgentOrchestrator

__all__ = ["ResearchAgentOrchestrator"]
