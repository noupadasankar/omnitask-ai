#!/bin/bash

# Quick Start Script for Job Agent

echo "🤖 Job Agent Quick Start"
echo "========================"
echo ""

# Check if venv exists
if [ ! -d "venv" ]; then
    echo "❌ Virtual environment not found. Run setup.sh first!"
    exit 1
fi

# Activate venv
source venv/bin/activate

# Check .env
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found. Creating from template..."
    cp .env.example .env
    echo "✅ .env created. Please edit it with your details:"
    echo "   nano .env"
    echo ""
    read -p "Press Enter after editing .env..."
fi

# Check resume
RESUME_EXISTS=0
for ext in pdf docx; do
    if [ -f "config/resume.$ext" ] || [ -f "config/cv.$ext" ]; then
        RESUME_EXISTS=1
        break
    fi
done

if [ $RESUME_EXISTS -eq 0 ]; then
    echo "❌ Resume not found in config/"
    echo "Please add your resume:"
    echo "   cp ~/path/to/resume.pdf config/resume.pdf"
    exit 1
fi

echo "✅ All checks passed!"
echo ""
echo "Options:"
echo "1. Run verification tests"
echo "2. Run in DRY RUN mode (no actual applications)"
echo "3. Run LIVE mode (submit real applications)"
echo "4. View recent applications"
echo "5. View statistics"
echo "6. Exit"
echo ""

read -p "Choose option (1-6): " choice

case $choice in
    1)
        echo ""
        echo "Running verification tests..."
        python verify.py
        ;;
    2)
        echo ""
        echo "🧪 Running in DRY RUN mode..."
        echo "This will search and match jobs but won't submit applications."
        echo ""
        # Temporarily set DRY_RUN=true
        DRY_RUN=true python main.py
        ;;
    3)
        echo ""
        echo "⚠️  LIVE MODE - This will submit real applications!"
        read -p "Are you sure? (yes/no): " confirm
        if [ "$confirm" = "yes" ]; then
            python main.py
        else
            echo "Cancelled."
        fi
        ;;
    4)
        echo ""
        echo "📝 Recent Applications:"
        python -c "
from src.database.tracker import DatabaseTracker
db = DatabaseTracker()
apps = db.get_recent_applications(10)
if apps:
    for app in apps:
        print(f\"  • {app['role']} at {app['company']} ({app['portal']}) - Score: {app['match_score']}\")
else:
    print('  No applications yet.')
db.close()
"
        ;;
    5)
        echo ""
        echo "📊 Statistics:"
        python -c "
from src.database.tracker import DatabaseTracker
db = DatabaseTracker()
stats = db.get_application_stats()
print(f\"  Total Applications: {stats['total_applications']}\")
print(f\"  By Portal: {stats.get('by_portal', {})}\")
if stats.get('avg_match_score'):
    print(f\"  Average Match Score: {stats['avg_match_score']}\")
today = db.get_applications_today()
print(f\"  Today: {today}\")
db.close()
"
        ;;
    6)
        echo "Goodbye!"
        exit 0
        ;;
    *)
        echo "Invalid option"
        exit 1
        ;;
esac
