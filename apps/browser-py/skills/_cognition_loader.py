"""Shared loader for the job_agent cognition package.

Both the job-application skill and the generic web-task skill run code that lives
under `agents/job_agent` — a self-contained sub-project that couples to its own
working directory (config/, data/, logs/). Importing it requires temporarily
mounting that directory on `sys.path` and `chdir`-ing into it. Because the engine
runs jobs concurrently and chdir is process-global, this must be serialized.

`mount_job_agent()` is an async context manager that does the chdir + sys.path
mutation under a shared lock and restores everything on exit, so multiple
cognition-backed skills share ONE lock (a generic task and a job apply can't
corrupt each other's cwd).
"""

from __future__ import annotations

import asyncio
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

# agents/job_agent — the self-contained cognition sub-project root.
JOB_AGENT_ROOT = Path(__file__).resolve().parents[1] / "agents" / "job_agent"

# One lock for ALL cognition-backed skills: chdir + sys.path are process-global.
_MOUNT_LOCK = asyncio.Lock()


def is_available() -> bool:
    """True when the job_agent cognition sub-project is present on disk."""
    return JOB_AGENT_ROOT.exists()


@asynccontextmanager
async def mount_job_agent():
    """Serialize + mount the job_agent root so `from src.cognition...` imports
    resolve and relative config/data paths work, then restore on exit."""
    async with _MOUNT_LOCK:
        prev_cwd = os.getcwd()
        root = str(JOB_AGENT_ROOT)
        path_added = False
        try:
            os.chdir(root)
            if root not in sys.path:
                sys.path.insert(0, root)
                path_added = True
            yield root
        finally:
            os.chdir(prev_cwd)
            if path_added:
                try:
                    sys.path.remove(root)
                except ValueError:
                    pass
