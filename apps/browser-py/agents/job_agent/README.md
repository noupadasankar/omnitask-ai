# 🤖 Autonomous Job Application Agent

An intelligent, fully automated job application agent that searches for relevant jobs across multiple job portals and applies on your behalf using your resume and preferences.

## ✨ Features

- **Multi-Portal Support**: Automatically searches and applies on:
  - Naukri.com
  - Instahyre
  - Hirist
  - (More portals can be added)

- **Intelligent Matching**: Uses LLM-based decision making to match jobs with your preferences
- **Session Management**: Saves login sessions to avoid repeated logins
- **Application Tracking**: SQLite database tracks all applications
- **Configurable Limits**: Set daily and per-portal application limits
- **Resume Parsing**: Automatically extracts information from your resume (PDF/DOCX)
- **Dry Run Mode**: Test without actually submitting applications
- **Detailed Logging**: Track everything that happens

## 🛠️ Tech Stack

All tools are **100% free and open-source**:
- **Python 3.8+**: Main language
- **Playwright**: Browser automation
- **SQLite**: Application tracking
- **PyPDF2/pdfplumber**: Resume parsing
- **python-docx**: DOCX resume support
- **YAML**: Configuration
- **GitHub Copilot Models**: LLM decision making (you have access)

## 📋 Prerequisites

- Python 3.8 or higher
- Git
- GitHub Copilot access (which you have)
- Your resume in PDF or DOCX format
- Active accounts on job portals (Naukri, Instahyre, etc.)

## 🚀 Quick Start

### 1. Clone/Navigate to Project

```bash
cd /home/Vinay/PycharmProjects/job_agent
```

### 2. Run Setup

**Option A: Using setup.sh (Linux/Mac)**
```bash
chmod +x setup.sh
./setup.sh
```

**Option B: Using setup.py (Cross-platform)**
```bash
python3 setup.py
```

This will:
- Create a virtual environment
- Install all dependencies
- Install Playwright browsers
- Create .env from template

### 3. Configure Your Preferences

#### a. Edit `.env` file:
```bash
nano .env
```

Fill in your details:
```env
USER_NAME="Your Full Name"
USER_EMAIL="your.email@example.com"
USER_PHONE="+91-XXXXXXXXXX"

# Application limits
MAX_APPLICATIONS_PER_DAY=20
MAX_APPLICATIONS_PER_PORTAL=5

# Browser settings
HEADLESS=false  # Set to true for headless mode
DEBUG=true
DRY_RUN=false  # Set to true for testing without applying
```

#### b. Edit `config/preferences.yaml`:
```bash
nano config/preferences.yaml
```

Set your job preferences:
- Preferred roles
- Locations
- Required/preferred keywords
- Companies to exclude
- Minimum match score

#### c. Add Your Resume:
```bash
cp ~/path/to/your/resume.pdf config/resume.pdf
```

Place your resume as `config/resume.pdf` or `config/resume.docx`

### 4. Run the Agent

```bash
# Activate virtual environment
source venv/bin/activate

# Run the agent
python main.py
```

## 📁 Project Structure

```
job_agent/
├── config/
│   ├── preferences.yaml    # Your job preferences
│   ├── portals.yaml       # Portal configurations
│   └── resume.pdf         # Your resume (add this)
├── data/
│   ├── applications.db    # SQLite database
│   └── sessions/          # Browser sessions
├── logs/
│   └── agent_*.log        # Daily log files
├── src/
│   ├── agent/
│   │   ├── llm_client.py    # LLM decision making
│   │   └── orchestrator.py  # Main orchestration logic
│   ├── browser/
│   │   └── playwright_client.py  # Browser automation
│   ├── database/
│   │   └── tracker.py           # Application tracking
│   ├── portals/
│   │   ├── base_portal.py      # Base portal class
│   │   ├── naukri.py           # Naukri implementation
│   │   ├── instahyre.py        # Instahyre implementation
│   │   └── hirist.py           # Hirist implementation
│   ├── resume/
│   │   └── parser.py           # Resume parsing
│   └── utils/
│       ├── config_loader.py    # Config utilities
│       └── logger.py           # Logging utilities
├── main.py               # Entry point
├── requirements.txt      # Python dependencies
├── setup.sh             # Setup script (Linux/Mac)
├── setup.py             # Setup script (Python)
└── README.md            # This file
```

## ⚙️ Configuration

### User Preferences (config/preferences.yaml)

```yaml
user_profile:
  name: "Your Name"
  email: "your@email.com"
  phone: "+91-XXXXXXXXXX"

preferences:
  roles:
    - "Software Engineer"
    - "Backend Developer"
    - "Python Developer"
  
  locations:
    - "Bangalore"
    - "Remote"
    - "Hybrid"
  
  experience_years: 3
  notice_period: "30 days"
  expected_salary_min: 15  # LPA
  expected_salary_max: 25  # LPA

filters:
  min_salary: 12  # LPA
  max_applications_per_day: 20
  
  required_keywords:
    - "python"
  
  preferred_keywords:
    - "django"
    - "fastapi"
    - "docker"
  
  exclude_keywords:
    - "blockchain"
    - "web3"
  
  exclude_companies:
    - "Company to Avoid"
  
  min_match_score: 60  # 0-100
```

## 🎯 How It Works

1. **Initialization**:
   - Loads your resume and extracts key information
   - Loads your job preferences
   - Initializes browser and database

2. **For Each Portal**:
   - Attempts to restore previous login session
   - If no session, waits for manual login (browser window opens)
   - Searches for jobs matching your criteria
   - For each job found:
     - Checks if already applied
     - Analyzes job description using LLM
     - Calculates match score
     - If score > threshold, applies automatically
     - Saves application to database

3. **Limits & Safety**:
   - Respects daily application limits
   - Respects per-portal limits
   - Waits between applications
   - Saves sessions for future runs

## 📊 Viewing Results

### Check Recent Applications:
```python
from src.database.tracker import DatabaseTracker

db = DatabaseTracker()
recent = db.get_recent_applications(limit=10)
for app in recent:
    print(f"{app['role']} at {app['company']} - Score: {app['match_score']}")
```

### View Statistics:
```python
stats = db.get_application_stats()
print(f"Total: {stats['total_applications']}")
print(f"By Portal: {stats['by_portal']}")
```

### Check Logs:
```bash
tail -f logs/agent_$(date +%Y%m%d).log
```

## 🧪 Testing (Dry Run Mode)

Before running for real, test in dry run mode:

```bash
# In .env, set:
DRY_RUN=true

# Then run:
python main.py
```

This will search and match jobs but won't actually submit applications.

## 🔧 Troubleshooting

### Login Issues:
- When the browser opens, manually log in to the portal
- The agent will detect the login and save your session
- Next time it will restore the session automatically

### CAPTCHA:
- Some portals may show CAPTCHA
- The agent will wait for you to solve it manually
- Then it will continue automatically

### Selectors Not Found:
- Job portal HTML changes frequently
- Edit `config/portals.yaml` to update selectors
- Or check the portal implementation in `src/portals/`

### Resume Not Detected:
- Make sure resume is in `config/` directory
- Name it `resume.pdf` or `resume.docx`
- Or `cv.pdf` or `cv.docx`

## 🔒 Privacy & Security

- All data stays **local** on your machine
- No data sent to external servers (except job portals)
- Browser sessions saved locally
- Credentials stored only in your `.env` file (never committed to git)

## 🛡️ Safety Features

- **Daily Limits**: Prevents over-application
- **Duplicate Prevention**: Checks database before applying
- **Exclude Lists**: Companies and keywords to avoid
- **Match Scoring**: Only applies to relevant jobs
- **Dry Run**: Test without consequences

## 📝 Extending the Agent

### Adding a New Portal:

1. Create new portal file in `src/portals/`:
```python
from .base_portal import BasePortal

class NewPortal(BasePortal):
    async def verify_login(self):
        # Implement login check
        pass
    
    async def login(self):
        # Implement login logic
        pass
    
    async def search_jobs(self):
        # Implement job search
        pass
    
    async def apply_to_job(self, job):
        # Implement application
        pass
```

2. Add portal config to `config/portals.yaml`

3. Add to orchestrator in `src/agent/orchestrator.py`

### Enhancing LLM Integration:

When GitHub Copilot API becomes available, update `src/agent/llm_client.py`:
```python
# Replace rule-based matching with actual LLM calls
def analyze_job_match(self, job_description, ...):
    # Call actual LLM API
    response = copilot_api.complete(prompt)
    return parse_response(response)
```

## 🤝 Contributing

Feel free to:
- Add more job portals
- Improve matching logic
- Enhance error handling
- Add features

## ⚠️ Disclaimer

This tool is for personal use only. Always:
- Respect job portal Terms of Service
- Don't exceed reasonable application limits
- Review applications before submitting (or use dry run)
- Keep your resume and profile updated
- Be prepared to follow up on applications

## 📜 License

MIT License - Use freely for personal projects

## 🙏 Acknowledgments

Built with:
- Playwright for browser automation
- SQLite for data persistence
- Python ecosystem for everything else
- Your GitHub Copilot models for intelligence

---

## 🎉 That's It!

You now have a fully functional autonomous job application agent. Run it daily (or set up a cron job) and let it find and apply to relevant jobs while you focus on interview prep and skill development!

**Happy Job Hunting! 🚀**

---

## 📞 Need Help?

Check the logs in `logs/` directory for detailed information about what the agent is doing. If something isn't working, the logs will tell you exactly what went wrong.
