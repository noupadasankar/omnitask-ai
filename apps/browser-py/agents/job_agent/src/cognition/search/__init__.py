"""Universal job search — discover postings on ANY site by observation.

`CognitiveSearcher` navigates to a job listing, clears popups, lazy-loads more
cards, then extracts candidate postings with a generic DOM heuristic
(`listing_reader`) and normalizes them with the local reasoning model. No
per-site selectors — the same code reads LinkedIn, Indeed, a company careers page,
or a site it has never seen.
"""

from .searcher import CognitiveSearcher

__all__ = ["CognitiveSearcher"]
