"""
Utility functions and helpers
"""

import yaml
import os
from pathlib import Path
from typing import Dict, Any
from dotenv import load_dotenv


def load_config(config_file: str = "config/preferences.yaml") -> Dict[str, Any]:
    """Load configuration from YAML file."""
    if not os.path.exists(config_file):
        raise FileNotFoundError(f"Config file not found: {config_file}")
    
    with open(config_file, 'r') as f:
        config = yaml.safe_load(f)
    
    return config


def load_portals_config(config_file: str = "config/portals.yaml") -> Dict[str, Any]:
    """Load portal configurations from YAML file."""
    if not os.path.exists(config_file):
        raise FileNotFoundError(f"Portals config file not found: {config_file}")
    
    with open(config_file, 'r') as f:
        portals = yaml.safe_load(f)
    
    return portals


def load_env():
    """Load environment variables from .env file."""
    load_dotenv()
    return {
        'user_name': os.getenv('USER_NAME'),
        'user_email': os.getenv('USER_EMAIL'),
        'user_phone': os.getenv('USER_PHONE'),
        'llm_model': os.getenv('LLM_MODEL', 'claude-sonnet-4.5'),
        'max_applications_per_day': int(os.getenv('MAX_APPLICATIONS_PER_DAY', 20)),
        'max_applications_per_portal': int(os.getenv('MAX_APPLICATIONS_PER_PORTAL', 5)),
        'headless': os.getenv('HEADLESS', 'false').lower() == 'true',
        'browser_slow_mo': int(os.getenv('BROWSER_SLOW_MO', 500)),
        'debug': os.getenv('DEBUG', 'true').lower() == 'true',
        'dry_run': os.getenv('DRY_RUN', 'false').lower() == 'true',
    }


def ensure_directories():
    """Ensure all necessary directories exist."""
    directories = [
        'config',
        'data',
        'logs',
        'src/agent',
        'src/portals',
        'src/browser',
        'src/resume',
        'src/database',
        'src/utils'
    ]
    
    for directory in directories:
        Path(directory).mkdir(parents=True, exist_ok=True)


def get_project_root() -> Path:
    """Get the project root directory."""
    return Path(__file__).parent.parent.parent


if __name__ == "__main__":
    # Test utilities
    ensure_directories()
    print("Directories ensured!")
    
    try:
        config = load_config()
        print(f"Config loaded: {list(config.keys())}")
    except FileNotFoundError as e:
        print(f"Config not found: {e}")
    
    try:
        portals = load_portals_config()
        print(f"Portals loaded: {list(portals.keys())}")
    except FileNotFoundError as e:
        print(f"Portals config not found: {e}")
