# 🚀 Quick Start Guide

## ✅ Setup Complete!

Your autonomous job application agent is now fully configured and ready to use.

## 📋 What Was Created

### Project Structure
```
job_agent/
├── config/           # Configuration files
│   ├── preferences.yaml   # YOUR job preferences (Edit this!)
│   ├── portals.yaml       # Portal configurations
│   ├── resume.pdf         # Your resume (already added ✓)
│   └── resume.docx        # Your resume (already added ✓)
├── src/              # Source code
│   ├── agent/        # AI agent logic
│   ├── browser/      # Browser automation
│   ├── database/     # Application tracking
│   ├── portals/      # Job portal implementations
│   ├── resume/       # Resume parsing
│   └── utils/        # Utilities
├── data/             # Database and sessions
├── logs/             # Log files
├── venv/             # Virtual environment (active)
├── main.py           # Main entry point
├── run.sh            # Interactive runner
├── verify.py         # Verification script
└── .env              # Environment variables (Edit this!)
```

## 🎯 Next Steps

### 1. Configure Your Preferences

Edit `config/preferences.yaml`:
```bash
nano config/preferences.yaml
```

Set your:
- **Roles**: e.g., "Software Engineer", "Python Developer"
- **Locations**: e.g., "Bangalore", "Remote"
- **Required Keywords**: e.g., "python", "django"
- **Exclude Keywords**: e.g., "blockchain", "web3"
- **Salary Expectations**: Min and max in LPA
- **Application Limits**: Daily and per-portal limits

### 2. Update Environment Variables

Edit `.env`:
```bash
nano .env
```

Fill in:
- `USER_NAME`: Your full name
- `USER_EMAIL`: Your email
- `USER_PHONE`: Your phone number
- `MAX_APPLICATIONS_PER_DAY`: e.g., 20
- `DRY_RUN`: Set to `true` for testing, `false` for live

### 3. Test Run (Recommended First)

Run in dry-run mode to test without submitting applications:
```bash
# Option 1: Using run.sh
./run.sh
# Then choose option 2 (Dry Run)

# Option 2: Direct command
source venv/bin/activate
python main.py  # (with DRY_RUN=true in .env)
```

### 4. Live Run

When ready, run live:
```bash
./run.sh
# Choose option 3 (Live Mode)

# Or directly:
source venv/bin/activate
python main.py  # (with DRY_RUN=false in .env)
```

## 🎮 How to Use

### Interactive Runner (Easiest)
```bash
./run.sh
```
This gives you a menu with options:
1. Run verification tests
2. Dry run mode
3. Live mode
4. View recent applications
5. View statistics

### Direct Commands

**Test setup:**
```bash
source venv/bin/activate
python verify.py
```

**Dry run:**
```bash
source venv/bin/activate
DRY_RUN=true python main.py
```

**Live run:**
```bash
source venv/bin/activate
python main.py
```

**View applications:**
```bash
source venv/bin/activate
python -c "
from src.database.tracker import DatabaseTracker
db = DatabaseTracker()
for app in db.get_recent_applications(10):
    print(f\"{app['role']} at {app['company']} - {app['portal']}\")
db.close()
"
```

## 🔄 First Run What to Expect

1. **Browser Opens**: A Chrome browser window will open (non-headless by default)

2. **Login Required**: For each portal (Naukri, Instahyre, Hirist):
   - Agent will navigate to login page
   - You manually login (one time only)
   - Agent saves your session for future runs
   - Next time, it will restore your session automatically

3. **Job Search**: Agent will:
   - Search for jobs matching your criteria
   - Scroll through results
   - Extract job details

4. **Matching**: For each job:
   - Analyzes job description
   - Calculates match score
   - Decides whether to apply based on your preferences

5. **Application**: If match score is high enough:
   - Navigates to job page
   - Clicks apply button
   - Submits application
   - Saves to database

6. **Report**: At the end, shows summary:
   - Total applications submitted
   - Applications per portal
   - Recent applications
   - Overall statistics

## 📊 Monitoring

### View Logs
```bash
# Live tail
tail -f logs/agent_$(date +%Y%m%d).log

# View today's log
cat logs/agent_$(date +%Y%m%d).log
```

### Check Database
```bash
sqlite3 data/applications.db "SELECT role, company, portal, match_score FROM applications ORDER BY applied_date DESC LIMIT 10;"
```

### View Stats
```bash
./run.sh
# Choose option 5
```

## ⚙️ Configuration Tips

### Start Conservative
- Set `MAX_APPLICATIONS_PER_DAY=5` initially
- Set `MIN_MATCH_SCORE=70` for quality over quantity
- Use `DRY_RUN=true` for the first few runs

### Tune Over Time
- Check which jobs you're getting
- Adjust keywords in preferences.yaml
- Refine match score threshold
- Add companies to exclude list

### Safety Settings
- `HEADLESS=false`: See what's happening (recommended initially)
- `BROWSER_SLOW_MO=500`: Slows down actions (prevents bot detection)
- `DEBUG=true`: More detailed logs

## 🔧 Troubleshooting

**"Login timeout"**
→ Login manually within 120 seconds when browser opens

**"Apply button not found"**
→ Portal HTML changed. Update selectors in `config/portals.yaml`

**"No resume found"**
→ Ensure resume is in `config/` as `resume.pdf` or `resume.docx`

**"Import error"**
→ Activate venv: `source venv/bin/activate`

**Browser won't open**
→ Reinstall Playwright: `venv/bin/playwright install chromium`

## 🎯 Best Practices

1. **Run Daily**: Set up a cron job or run manually each day
2. **Review Applications**: Check what was applied to in database
3. **Update Resume**: Keep `config/resume.pdf` current
4. **Refine Preferences**: Adjust based on results
5. **Respect Limits**: Don't set too high application limits
6. **Check Logs**: Monitor for errors or issues

## 📅 Scheduling (Optional)

Run automatically every day at 9 AM:
```bash
# Add to crontab
crontab -e

# Add this line:
0 9 * * * cd /home/Vinay/PycharmProjects/job_agent && /home/Vinay/PycharmProjects/job_agent/venv/bin/python /home/Vinay/PycharmProjects/job_agent/main.py >> /home/Vinay/PycharmProjects/job_agent/logs/cron.log 2>&1
```

## 🎉 You're All Set!

Your autonomous job application agent is ready. Start with a test run:

```bash
./run.sh
```

Choose option 2 (Dry Run) to see how it works without submitting applications.

Good luck with your job search! 🚀

---

**Need help?** Check the main [README.md](README.md) for detailed documentation.
