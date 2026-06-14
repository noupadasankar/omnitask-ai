"""
LLM Client for Job Matching and Decision Making
"""

from typing import Dict, List, Optional, Any
import json
import logging
import re

# Module logger — debug-level so match tracing stays off the console by default
# (it still lands in the file log / shows when the level is lowered).
log = logging.getLogger("browser-py.job_agent.match")


class LLMClient:
    """
    LLM client for making intelligent decisions about job matching.
    
    Note: This is a template implementation. Since you have GitHub Copilot with 
    access to various models, you'll need to integrate with your specific API.
    
    For now, this uses rule-based matching. To use actual LLM:
    1. Get API access from GitHub Copilot
    2. Replace analyze_job_match() with actual LLM calls
    3. Use models like claude-sonnet-4.5, gpt-5.1, etc.
    """
    
    def __init__(self, model: str = "claude-sonnet-4.5"):
        """Initialize LLM client.
        
        Args:
            model: Model name to use
        """
        self.model = model
        # TODO: Initialize actual LLM client when API is available
    
    def analyze_job_match(self, 
                         job_description: str,
                         job_title: str,
                         company: str,
                         user_preferences: Dict,
                         user_resume_data: Dict) -> Dict[str, Any]:
        """
        Analyze if a job matches user preferences.
        
        Args:
            job_description: Full job description
            job_title: Job title
            company: Company name
            user_preferences: User's job preferences
            user_resume_data: Parsed resume data
        
        Returns:
            Dict with match_score, reasoning, and decision
        """
        
        # For now, using rule-based matching
        # TODO: Replace with actual LLM call
        
        score = 0
        reasons = []
        max_score = 100
        
        # Detect if description is missing (common on search result pages)
        has_description = len(job_description.strip()) > 50
        
        # Check exclude companies first (disqualifying)
        exclude_companies = user_preferences.get('filters', {}).get('exclude_companies', [])
        if any(exc_company.lower() in company.lower() for exc_company in exclude_companies):
            score = 0
            reasons.append(f"❌ Company {company} is in exclude list")
            return {
                'match_score': 0,
                'should_apply': False,
                'reasons': reasons,
                'reasoning': '\n'.join(reasons)
            }
        
        # Check role match - get roles from correct path in preferences
        roles = user_preferences.get('preferences', {}).get('roles', [])
        role_match = self._check_role_match(job_title, roles)
        
        if not has_description:
            # Simplified scoring for jobs without descriptions (search results)
            # Rely heavily on role matching since we're already on filtered search pages
            if role_match:
                score = 75  # High score for matching role
                reasons.append(f"✅ Role matches: {job_title}")
                reasons.append("ℹ️  No description available - applying based on role match")
            else:
                score = 30  # Lower score if role doesn't match
                reasons.append(f"⚠️ Role might not match: {job_title}")
                reasons.append("ℹ️  No description available")
        else:
            # Full scoring when description is available
            if role_match:
                score += 30
                reasons.append(f"✅ Role matches: {job_title}")
            else:
                reasons.append(f"⚠️ Role might not match: {job_title}")
            
            # Check location match (20 points)
            locations = user_preferences.get('preferences', {}).get('locations', [])
            location_match = self._check_location_match(job_description, locations)
            if location_match:
                score += 20
                reasons.append("✅ Location matches preferences")
            else:
                score += 10  # Partial points
                reasons.append("⚠️ Location not explicitly matched")
            
            # Check required keywords (25 points)
            required_keywords = user_preferences.get('filters', {}).get('required_keywords', [])
            keyword_score = self._check_keywords(job_description, required_keywords)
            keyword_points = int((keyword_score / len(required_keywords)) * 25) if required_keywords else 25
            score += keyword_points
            if keyword_score > 0:
                reasons.append(f"✅ Found {keyword_score}/{len(required_keywords)} required keywords")
            
            # Check preferred keywords (15 points)
            preferred_keywords = user_preferences.get('filters', {}).get('preferred_keywords', [])
            preferred_score = self._check_keywords(job_description, preferred_keywords)
            preferred_points = int((preferred_score / len(preferred_keywords)) * 15) if preferred_keywords else 0
            score += preferred_points
            if preferred_score > 0:
                reasons.append(f"✅ Found {preferred_score} preferred keywords")
            
            # Check exclude keywords (disqualifying)
            exclude_keywords = user_preferences.get('filters', {}).get('exclude_keywords', [])
            exclude_found = self._check_keywords(job_description, exclude_keywords)
            if exclude_found > 0:
                score = max(0, score - 50)  # Heavy penalty
                reasons.append(f"❌ Found {exclude_found} exclude keywords")
            
            # Skills match (10 points)
            user_skills = user_resume_data.get('skills', [])
            skills_match = self._check_skills_match(job_description, user_skills)
            if skills_match > 0:
                skill_points = min(10, skills_match * 2)
                score += skill_points
                reasons.append(f"✅ {skills_match} skills match")
        
        # Normalize score
        score = min(100, score)
        
        # Determine decision - use LOWER threshold for better job matching
        # Since portals show recommended jobs, we want to be more lenient
        min_match_score = user_preferences.get('filters', {}).get('min_match_score', 40)
        if not has_description:
            min_match_score = 30  # Even lower threshold when no description available
        
        should_apply = score >= min_match_score
        
        return {
            'match_score': score,
            'should_apply': should_apply,
            'reasons': reasons,
            'reasoning': '\n'.join(reasons)
        }
    
    def _check_role_match(self, job_title: str, preferred_roles: List[str]) -> bool:
        """Check if job title matches preferred roles.
        
        Uses VERY flexible matching for AI/ML roles - if job title contains
        AI/ML keywords, it's a match!
        """
        if not job_title:
            return False

        # No role filter configured → apply broadly (don't silently zero matches).
        if not preferred_roles:
            log.debug("No preferred roles set — treating as a role match")
            return True

        job_title_lower = job_title.lower()
        
        # Debug: log what we're matching
        log.debug("Matching job title: '%s'", job_title)
        log.debug("Against %d roles", len(preferred_roles))
        
        # Super lenient AI/ML keyword matching - if ANY of these appear, it's a match!
        ai_ml_keywords = [
            'machine learning', 'ml ', ' ml', 'artificial intelligence', 'ai ',
            'deep learning', 'dl ', 'data scientist', 'data science',
            'computer vision', 'cv ', 'nlp', 'natural language',
            'generative ai', 'gen ai', 'genai', 'llm', 'large language',
            'neural network', 'tensorflow', 'pytorch', 'model', 'algorithm'
        ]
        
        for keyword in ai_ml_keywords:
            if keyword in job_title_lower:
                log.debug("AI/ML keyword match: '%s' found in '%s'", keyword, job_title)
                return True

        # First try exact substring match (most accurate)
        for role in preferred_roles:
            role_lower = role.lower()
            if role_lower in job_title_lower or job_title_lower in role_lower:
                log.debug("Exact match: '%s' matched '%s'", role, job_title)
                return True
        
        # Then try keyword-based matching (more flexible)
        common_words = {'the', 'a', 'an', 'and', 'or', 'of', 'for', 'in', 'on', 'at', 'to', 'senior', 'junior', 'lead', 'staff'}
        
        for role in preferred_roles:
            role_keywords = [w for w in role.lower().split() if w not in common_words]
            # Match if at least 1 significant keyword matches (very lenient!)
            matched_keywords = sum(1 for keyword in role_keywords if keyword in job_title_lower)
            
            if matched_keywords >= 1:  # Just need ONE keyword to match
                log.debug("Keyword match: '%s' matched '%s' (%d keywords)", role, job_title, matched_keywords)
                return True

        log.debug("No match found for '%s'", job_title)
        return False
    
    def _check_location_match(self, job_description: str, preferred_locations: List[str]) -> bool:
        """Check if job location matches preferences."""
        desc_lower = job_description.lower()
        for location in preferred_locations:
            if location.lower() in desc_lower:
                return True
        return False
    
    def _check_keywords(self, text: str, keywords: List[str]) -> int:
        """Count how many keywords are present in text."""
        text_lower = text.lower()
        count = 0
        for keyword in keywords:
            if keyword.lower() in text_lower:
                count += 1
        return count
    
    def _check_skills_match(self, job_description: str, user_skills: List[str]) -> int:
        """Count matching skills."""
        desc_lower = job_description.lower()
        matches = 0
        for skill in user_skills:
            if skill.lower() in desc_lower:
                matches += 1
        return matches
    
    def generate_cover_letter(self,
                             job_title: str,
                             company: str,
                             job_description: str,
                             user_profile: Dict,
                             template: str) -> str:
        """Generate a personalized cover letter.
        
        Args:
            job_title: Job title
            company: Company name
            job_description: Full job description
            user_profile: User profile information
            template: Cover letter template
        
        Returns:
            Personalized cover letter
        """
        # Simple template substitution
        # TODO: Use LLM for better generation
        
        custom_message = f"I am particularly interested in this {job_title} role because of my experience with relevant technologies and my passion for software development."
        
        cover_letter = template.format(
            role=job_title,
            company=company,
            experience=user_profile.get('experience_years', 'several'),
            name=user_profile.get('name', 'Applicant'),
            custom_message=custom_message
        )
        
        return cover_letter
    
    def answer_question(self, question: str, context: Dict) -> str:
        """Answer application questions intelligently.
        
        Args:
            question: The question asked
            context: Context including user profile and preferences
        
        Returns:
            Generated answer
        """
        # Simple rule-based answering
        # TODO: Use LLM for better answers
        
        question_lower = question.lower()
        
        # Common patterns
        if 'ctc' in question_lower or 'salary' in question_lower:
            if 'current' in question_lower:
                return context.get('common_answers', {}).get('current_ctc', '12 LPA')
            elif 'expected' in question_lower:
                return context.get('common_answers', {}).get('expected_ctc', '18 LPA')
        
        if 'notice' in question_lower:
            return context.get('common_answers', {}).get('notice_period', '30 days')
        
        if 'relocate' in question_lower:
            return context.get('common_answers', {}).get('willing_to_relocate', 'Yes')
        
        if 'why' in question_lower and ('change' in question_lower or 'looking' in question_lower):
            return context.get('common_answers', {}).get('reason_for_change', 
                'Looking for better opportunities to grow and work with latest technologies')
        
        # Default response
        return "Yes, I am interested in this opportunity."
    
    def extract_job_details(self, job_card_html: str) -> Dict[str, str]:
        """Extract structured information from job card HTML.
        
        Args:
            job_card_html: HTML content of job card
        
        Returns:
            Structured job details
        """
        # Simple text extraction
        # TODO: Use LLM for better extraction
        
        # This is a placeholder - actual extraction happens in portal implementations
        return {
            'title': '',
            'company': '',
            'location': '',
            'salary': '',
            'description': job_card_html
        }


# Singleton instance
_llm_client = None


def get_llm_client(model: str = "claude-sonnet-4.5") -> LLMClient:
    """Get or create LLM client instance."""
    global _llm_client
    if _llm_client is None:
        _llm_client = LLMClient(model)
    return _llm_client


if __name__ == "__main__":
    # Test LLM client
    client = get_llm_client()
    
    test_job = {
        'title': 'Senior Python Developer',
        'company': 'Tech Corp',
        'description': 'We are looking for a Python developer with Django and FastAPI experience. Remote work available.'
    }
    
    test_preferences = {
        'roles': ['Python Developer', 'Backend Developer'],
        'locations': ['Remote', 'Bangalore'],
        'filters': {
            'required_keywords': ['python'],
            'preferred_keywords': ['django', 'fastapi'],
            'exclude_keywords': ['blockchain'],
            'min_match_score': 60
        }
    }
    
    test_resume = {
        'skills': ['Python', 'Django', 'PostgreSQL'],
        'experience_years': 3
    }
    
    result = client.analyze_job_match(
        test_job['description'],
        test_job['title'],
        test_job['company'],
        test_preferences,
        test_resume
    )
    
    print(f"Match Score: {result['match_score']}")
    print(f"Should Apply: {result['should_apply']}")
    print(f"Reasoning:\n{result['reasoning']}")
