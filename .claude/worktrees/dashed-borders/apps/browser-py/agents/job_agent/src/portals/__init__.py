"""Portals package initialization."""
from .base_portal import BasePortal
from .naukri import NaukriPortal
from .instahyre import InstahyrePortal
from .hirist import HiristPortal
from .linkedin import LinkedInPortal

__all__ = ['BasePortal', 'NaukriPortal', 'InstahyrePortal', 'HiristPortal', 'LinkedInPortal']
