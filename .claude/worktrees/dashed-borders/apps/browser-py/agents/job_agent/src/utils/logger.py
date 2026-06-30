"""
Logging configuration and utilities
"""

import logging
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

try:
    import colorlog
    HAS_COLORLOG = True
except ImportError:
    HAS_COLORLOG = False


class AgentLogger:
    """Custom logger for the job agent."""
    
    def __init__(self, name: str = "JobAgent", log_dir: str = "logs"):
        """Initialize logger with file and console handlers."""
        self.name = name
        self.log_dir = log_dir
        
        # Ensure log directory exists
        Path(log_dir).mkdir(parents=True, exist_ok=True)
        
        # Create logger
        self.logger = logging.getLogger(name)
        self.logger.setLevel(logging.DEBUG)

        # Don't bubble up to the root "browser-py" logger — otherwise every line
        # is printed twice (once here, once by main.py's handler). The dashboard
        # already receives these via the bridge, so the console stays clean.
        self.logger.propagate = False

        # Remove existing handlers
        self.logger.handlers = []
        
        # Create formatters
        file_formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        
        # Console formatter (with color if available)
        if HAS_COLORLOG:
            console_formatter = colorlog.ColoredFormatter(
                '%(log_color)s%(levelname)-8s%(reset)s %(blue)s%(message)s',
                datefmt='%H:%M:%S',
                log_colors={
                    'DEBUG': 'cyan',
                    'INFO': 'green',
                    'WARNING': 'yellow',
                    'ERROR': 'red',
                    'CRITICAL': 'red,bg_white',
                }
            )
        else:
            console_formatter = logging.Formatter(
                '%(levelname)-8s %(message)s'
            )
        
        # File handler (daily log files) — UTF-8 so emoji/symbols persist.
        log_file = os.path.join(
            log_dir,
            f"agent_{datetime.now().strftime('%Y%m%d')}.log"
        )
        file_handler = logging.FileHandler(log_file, encoding="utf-8")
        file_handler.setLevel(logging.DEBUG)
        file_handler.setFormatter(file_formatter)

        # Console handler — quiet by default so the live view in the dashboard is
        # the single place to watch a run. Set JOB_AGENT_LOG_LEVEL=INFO/DEBUG to
        # restore terminal output. Forced UTF-8 so emoji never crash the stream
        # on Windows consoles (cp1252 would raise UnicodeEncodeError otherwise).
        console_level = getattr(
            logging,
            os.environ.get("JOB_AGENT_LOG_LEVEL", "ERROR").upper(),
            logging.ERROR,
        )
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(console_level)
        console_handler.setFormatter(console_formatter)
        try:
            console_handler.stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass
        
        # Add handlers
        self.logger.addHandler(file_handler)
        self.logger.addHandler(console_handler)
    
    def debug(self, message: str):
        """Log debug message."""
        self.logger.debug(message)
    
    def info(self, message: str):
        """Log info message."""
        self.logger.info(message)
    
    def warning(self, message: str):
        """Log warning message."""
        self.logger.warning(message)
    
    def error(self, message: str, exc_info: bool = False):
        """Log error message."""
        self.logger.error(message, exc_info=exc_info)
    
    def critical(self, message: str):
        """Log critical message."""
        self.logger.critical(message)
    
    def job_found(self, portal: str, company: str, role: str):
        """Log when a relevant job is found."""
        self.info(f"🎯 Found: {role} at {company} on {portal}")
    
    def job_applied(self, portal: str, company: str, role: str):
        """Log when a job application is submitted."""
        self.info(f"✅ Applied: {role} at {company} via {portal}")
    
    def job_skipped(self, reason: str):
        """Log when a job is skipped."""
        self.debug(f"⏭️  Skipped: {reason}")
    
    def portal_start(self, portal: str):
        """Log when starting to process a portal."""
        self.info(f"🚀 Starting portal: {portal}")
    
    def portal_complete(self, portal: str, applied: int):
        """Log when done processing a portal."""
        self.info(f"✅ Completed {portal}: {applied} applications")
    
    def session_restored(self, portal: str):
        """Log when session is restored."""
        self.info(f"🔐 Session restored for {portal}")
    
    def session_new(self, portal: str):
        """Log when new login is required."""
        self.warning(f"🔑 New login required for {portal}")


def get_logger(name: str = "JobAgent") -> AgentLogger:
    """Get or create a logger instance."""
    return AgentLogger(name)


if __name__ == "__main__":
    # Test logger
    logger = get_logger("TestLogger")
    logger.info("Logger initialized successfully!")
    logger.debug("This is a debug message")
    logger.warning("This is a warning")
    logger.error("This is an error")
    logger.job_found("Naukri", "Google", "Software Engineer")
    logger.job_applied("Naukri", "Google", "Software Engineer")
