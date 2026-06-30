#!/usr/bin/env python3
"""
Autonomous Job Application Agent
Main entry point for the application.
"""

import asyncio
import sys
import os

# Add src to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.agent.orchestrator import JobAgentOrchestrator
from src.utils.logger import get_logger


def check_setup():
    """Check if initial setup is complete."""
    issues = []
    
    # Check for .env file
    if not os.path.exists('.env'):
        issues.append(
            "⚠️  .env file not found. Copy .env.example to .env and fill in your details."
        )
    
    # Check for resume
    resume_files = [
        'config/resume.pdf',
        'config/resume.docx',
        'config/cv.pdf',
        'config/cv.docx'
    ]
    if not any(os.path.exists(f) for f in resume_files):
        issues.append(
            "⚠️  Resume file not found. Add your resume to config/ directory as resume.pdf or resume.docx"
        )
    
    # Check if preferences are configured
    if not os.path.exists('config/preferences.yaml'):
        issues.append(
            "⚠️  preferences.yaml not found. This file should exist in config/"
        )
    
    return issues


async def main():
    """Main function."""
    logger = get_logger("Main")
    
    logger.info("=" * 60)
    logger.info("🤖 AUTONOMOUS JOB APPLICATION AGENT")
    logger.info("=" * 60)
    
    # Check setup
    issues = check_setup()
    if issues:
        logger.error("❌ Setup incomplete:\n")
        for issue in issues:
            logger.error(f"   {issue}")
        logger.error("\nPlease complete setup and try again.")
        return 1
    
    logger.info("✅ Setup check passed")
    logger.info("")
    
    try:
        # Run the agent
        orchestrator = JobAgentOrchestrator()
        await orchestrator.run()
        orchestrator.close()
        
        logger.info("✅ Agent completed successfully")
        return 0
        
    except KeyboardInterrupt:
        logger.warning("\n⚠️  Agent interrupted by user")
        return 130
    
    except Exception as e:
        logger.error(f"❌ Fatal error: {e}", exc_info=True)
        return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
