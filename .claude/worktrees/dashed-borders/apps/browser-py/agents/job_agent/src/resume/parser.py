"""
Resume Parser Module
Extracts information from PDF and DOCX resume files.
"""

import os
from pathlib import Path
from typing import Dict, Optional, List
import re

try:
    import PyPDF2
except ImportError:
    PyPDF2 = None

try:
    import docx
except ImportError:
    docx = None

try:
    import pdfplumber
except ImportError:
    pdfplumber = None


class ResumeParser:
    """Parse resume files (PDF, DOCX) and extract structured information."""
    
    def __init__(self, resume_path: str):
        """Initialize with resume file path."""
        self.resume_path = resume_path
        self.file_extension = Path(resume_path).suffix.lower()
        
        if not os.path.exists(resume_path):
            raise FileNotFoundError(f"Resume file not found: {resume_path}")
        
        self.text = self._extract_text()
        self.parsed_data = self._parse_resume()
    
    def _extract_text(self) -> str:
        """Extract raw text from resume file."""
        if self.file_extension == '.pdf':
            return self._extract_from_pdf()
        elif self.file_extension in ['.docx', '.doc']:
            return self._extract_from_docx()
        else:
            raise ValueError(f"Unsupported file format: {self.file_extension}")
    
    def _extract_from_pdf(self) -> str:
        """Extract text from PDF using pdfplumber (preferred) or PyPDF2."""
        text = ""
        
        # Try pdfplumber first (better text extraction)
        if pdfplumber:
            try:
                with pdfplumber.open(self.resume_path) as pdf:
                    for page in pdf.pages:
                        page_text = page.extract_text()
                        if page_text:
                            text += page_text + "\n"
                return text
            except Exception as e:
                print(f"pdfplumber failed: {e}, falling back to PyPDF2")
        
        # Fallback to PyPDF2
        if PyPDF2:
            try:
                with open(self.resume_path, 'rb') as file:
                    pdf_reader = PyPDF2.PdfReader(file)
                    for page in pdf_reader.pages:
                        text += page.extract_text() + "\n"
                return text
            except Exception as e:
                raise Exception(f"Failed to extract PDF text: {e}")
        
        raise ImportError("No PDF library available. Install pdfplumber or PyPDF2")
    
    def _extract_from_docx(self) -> str:
        """Extract text from DOCX file."""
        if not docx:
            raise ImportError("python-docx not installed. Install with: pip install python-docx")
        
        try:
            doc = docx.Document(self.resume_path)
            text = "\n".join([paragraph.text for paragraph in doc.paragraphs])
            return text
        except Exception as e:
            raise Exception(f"Failed to extract DOCX text: {e}")
    
    def _parse_resume(self) -> Dict:
        """Parse extracted text to identify key information."""
        data = {
            'email': self._extract_email(),
            'phone': self._extract_phone(),
            'linkedin': self._extract_linkedin(),
            'github': self._extract_github(),
            'skills': self._extract_skills(),
            'experience_years': self._estimate_experience(),
            'education': self._extract_education(),
            'raw_text': self.text
        }
        return data
    
    def _extract_email(self) -> Optional[str]:
        """Extract email address from resume text."""
        email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
        match = re.search(email_pattern, self.text)
        return match.group(0) if match else None
    
    def _extract_phone(self) -> Optional[str]:
        """Extract phone number from resume text."""
        # Indian phone patterns
        patterns = [
            r'\+91[-\s]?\d{10}',
            r'\+91[-\s]?\d{5}[-\s]?\d{5}',
            r'\d{10}',
            r'\(\d{3}\)[-\s]?\d{3}[-\s]?\d{4}',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, self.text)
            if match:
                return match.group(0)
        return None
    
    def _extract_linkedin(self) -> Optional[str]:
        """Extract LinkedIn profile URL."""
        linkedin_pattern = r'linkedin\.com/in/[\w-]+'
        match = re.search(linkedin_pattern, self.text, re.IGNORECASE)
        if match:
            return f"https://www.{match.group(0)}"
        return None
    
    def _extract_github(self) -> Optional[str]:
        """Extract GitHub profile URL."""
        github_pattern = r'github\.com/[\w-]+'
        match = re.search(github_pattern, self.text, re.IGNORECASE)
        if match:
            return f"https://{match.group(0)}"
        return None
    
    def _extract_skills(self) -> List[str]:
        """Extract technical skills from resume."""
        # Common technical skills keywords
        common_skills = [
            'python', 'java', 'javascript', 'typescript', 'c\\+\\+', 'c#', 'ruby', 'go', 'rust',
            'react', 'angular', 'vue', 'node', 'express', 'django', 'flask', 'fastapi',
            'sql', 'mysql', 'postgresql', 'mongodb', 'redis', 'elasticsearch',
            'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'jenkins', 'git',
            'html', 'css', 'sass', 'bootstrap', 'tailwind',
            'restful', 'graphql', 'api', 'microservices',
            'machine learning', 'deep learning', 'nlp', 'computer vision',
            'agile', 'scrum', 'ci/cd', 'tdd', 'linux'
        ]
        
        found_skills = []
        text_lower = self.text.lower()
        
        for skill in common_skills:
            if re.search(r'\b' + skill + r'\b', text_lower):
                # Capitalize properly
                found_skills.append(skill.upper() if len(skill) <= 4 else skill.title())
        
        return list(set(found_skills))
    
    def _estimate_experience(self) -> Optional[int]:
        """Estimate years of experience from resume."""
        # Look for experience section
        experience_patterns = [
            r'(\d+)\+?\s*years?\s+(?:of\s+)?experience',
            r'experience\s*:?\s*(\d+)\+?\s*years?',
        ]
        
        for pattern in experience_patterns:
            match = re.search(pattern, self.text, re.IGNORECASE)
            if match:
                return int(match.group(1))
        
        # Try to estimate from date ranges in experience section
        year_pattern = r'\b(20\d{2}|19\d{2})\b'
        years = re.findall(year_pattern, self.text)
        if years:
            years = [int(y) for y in years]
            min_year = min(years)
            current_year = 2026  # As per context
            estimated_exp = current_year - min_year
            if 0 < estimated_exp < 50:  # Sanity check
                return estimated_exp
        
        return None
    
    def _extract_education(self) -> List[str]:
        """Extract education information."""
        education_keywords = [
            'bachelor', 'master', 'phd', 'doctorate', 'diploma',
            'b.tech', 'b.e.', 'm.tech', 'm.e.', 'mba', 'mca', 'bca',
            'computer science', 'information technology', 'engineering'
        ]
        
        education = []
        text_lower = self.text.lower()
        
        for keyword in education_keywords:
            if keyword in text_lower:
                education.append(keyword.title())
        
        return list(set(education))
    
    def get_summary(self) -> Dict:
        """Get a summary of parsed resume data."""
        return self.parsed_data
    
    def get_text(self) -> str:
        """Get raw extracted text."""
        return self.text
    
    def get_file_path(self) -> str:
        """Get the resume file path."""
        return self.resume_path
    
    def to_dict(self) -> Dict:
        """Convert parsed data to dictionary."""
        return {
            'file_path': self.resume_path,
            'file_type': self.file_extension,
            **self.parsed_data
        }


def find_resume_file(config_dir: str = "config") -> Optional[str]:
    """Find resume file in config directory."""
    resume_extensions = ['.pdf', '.docx', '.doc']
    
    for ext in resume_extensions:
        for file in Path(config_dir).glob(f"*resume*{ext}"):
            return str(file)
        for file in Path(config_dir).glob(f"*cv*{ext}"):
            return str(file)
    
    return None


if __name__ == "__main__":
    # Test resume parser
    resume_file = find_resume_file()
    if resume_file:
        parser = ResumeParser(resume_file)
        print("Resume parsed successfully!")
        print(f"Email: {parser.parsed_data['email']}")
        print(f"Phone: {parser.parsed_data['phone']}")
        print(f"Skills: {parser.parsed_data['skills']}")
        print(f"Experience: {parser.parsed_data['experience_years']} years")
    else:
        print("No resume file found in config directory")
