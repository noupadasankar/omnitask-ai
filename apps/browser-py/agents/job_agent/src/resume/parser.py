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
        name = self._extract_name()
        first_name, last_name = self._split_name(name)
        data = {
            'name': name,
            'first_name': first_name,
            'last_name': last_name,
            'location': self._extract_location(),
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

    def _extract_name(self) -> Optional[str]:
        """Extract the candidate's full name (usually the first line of a resume).

        Heuristic: the name is the first non-empty line that looks like a name —
        1–4 alphabetic words, no email/URL/digits, and not a section header.
        """
        section_words = {
            'resume', 'curriculum', 'vitae', 'cv', 'profile', 'summary',
            'professional', 'contact', 'objective', 'experience', 'education',
            'skills', 'projects', 'certificates', 'work',
        }
        for line in self.text.split('\n'):
            line = line.strip()
            if not line:
                continue
            low = line.lower()
            if '@' in line or 'http' in low or any(ch.isdigit() for ch in line):
                continue
            words = line.split()
            if not (1 <= len(words) <= 4):
                continue
            if any(w in low for w in section_words):
                continue
            # Every token must be alphabetic (allow . - ' for initials/hyphens).
            if not all(re.fullmatch(r"[A-Za-z.\-']+", w) for w in words):
                continue
            return line.title()
        return None

    @staticmethod
    def _split_name(name: Optional[str]) -> tuple:
        """Split a full name into (first_name, last_name)."""
        if not name:
            return None, None
        parts = name.split()
        if len(parts) == 1:
            return parts[0], ''
        return parts[0], ' '.join(parts[1:])

    # Major Indian cities (this agent targets Indian portals) plus a few common
    # global tech hubs — used to recover a location when there's no explicit
    # "Location:" line. Ordered roughly by frequency for first-match wins.
    _KNOWN_CITIES = [
        'Bangalore', 'Bengaluru', 'Hyderabad', 'Pune', 'Mumbai', 'Delhi',
        'New Delhi', 'Gurgaon', 'Gurugram', 'Noida', 'Chennai', 'Kolkata',
        'Ahmedabad', 'Tirupati', 'Coimbatore', 'Kochi', 'Cochin', 'Trivandrum',
        'Thiruvananthapuram', 'Visakhapatnam', 'Vijayawada', 'Nagpur', 'Indore',
        'Jaipur', 'Lucknow', 'Chandigarh', 'Bhubaneswar', 'Mysore', 'Mysuru',
        'Vellore', 'Madurai', 'Nashik', 'Surat', 'Remote',
    ]

    def _extract_location(self) -> Optional[str]:
        """Best-effort current location / city from the resume text.

        Priority: an explicit "Location/Address/Based in: <city>" line, then a
        scan for a known city name. Returns None when nothing is found (callers
        fall back to preferences)."""
        explicit = re.search(
            r'(?:location|address|based\s+in|city|current\s+location)\s*[:\-]\s*'
            r'([A-Za-z][A-Za-z .\-]{1,40})',
            self.text, re.IGNORECASE,
        )
        if explicit:
            city = explicit.group(1).split(',')[0].strip(' .-')
            if 2 <= len(city) <= 30:
                return city.title()

        for city in self._KNOWN_CITIES:
            if re.search(r'\b' + re.escape(city) + r'\b', self.text, re.IGNORECASE):
                return city
        return None
    
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
        """Estimate years of *professional* experience from the resume.

        Order of trust:
          1. An explicit "X years of experience" statement.
          2. Student / intern / fresher signals → 0–1 years (an ongoing degree or
             internship must NOT be counted as multi-year experience).
          3. Date ranges found in the work-experience section only — education
             year ranges (e.g. a 2023–2027 degree) would otherwise inflate this.
        """
        text = self.text
        low = text.lower()

        # 1) Explicit statement wins.
        for pattern in (
            r'(\d+)\+?\s*years?\s+(?:of\s+)?experience',
            r'experience\s*:?\s*(\d+)\+?\s*years?',
        ):
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return int(match.group(1))

        # 2) Early-career signals → cap at 0–1 years.
        #    An education end-year in the future means the degree is still ongoing
        #    (a current student), which is the clearest "not yet experienced" tell.
        future_grad = re.search(
            r'\((?:19|20)\d{2}\s*[-–—to]+\s*((?:19|20)\d{2})\)', text
        )
        ongoing_degree = bool(future_grad and int(future_grad.group(1)) > 2026)
        student_signals = (
            'fresher', 'pursuing', 'currently studying', 'currently pursuing',
            'expected graduation', 'expected to graduate', 'final year',
            'b.tech (', 'undergraduate',
        )
        has_intern = 'intern' in low  # covers intern / internship / interning
        if ongoing_degree or any(s in low for s in student_signals) or has_intern:
            # An internship counts as ~1 year of hands-on; a pure student → 0.
            return 1 if has_intern else 0

        # 3) Estimate from professional date ranges only.
        work_text = self._work_experience_section() or text
        years = [int(y) for y in re.findall(r'\b((?:19|20)\d{2})\b', work_text)]
        if years:
            estimated_exp = 2026 - min(years)  # current year per project context
            if 0 < estimated_exp < 50:  # sanity check
                return estimated_exp

        return None

    def _work_experience_section(self) -> Optional[str]:
        """Return just the work/professional experience block of the resume.

        Used so date-range based experience estimation ignores education and
        project years. Returns None when no recognisable section header exists.
        """
        match = re.search(
            r'(?:work\s+experience|professional\s+experience|employment\s+history'
            r'|experience)\s*[:\n]\s*(.*?)'
            r'(?:\n\s*(?:project|education|certificat|skills|achievement|award)|\Z)',
            self.text, re.IGNORECASE | re.DOTALL,
        )
        return match.group(1) if match else None
    
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
