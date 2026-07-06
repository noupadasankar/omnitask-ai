#!/bin/bash

# Setup script for Job Agent
# This script sets up the virtual environment and installs dependencies

set -e

echo "================================================"
echo "🤖 Job Agent Setup"
echo "================================================"
echo ""

# Check Python version
PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
echo "✓ Python version: $PYTHON_VERSION"

# Create virtual environment
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
    echo "✓ Virtual environment created"
else
    echo "✓ Virtual environment already exists"
fi

# Activate virtual environment
echo "🔌 Activating virtual environment..."
source venv/bin/activate

# Upgrade pip
echo "📦 Upgrading pip..."
pip install --upgrade pip > /dev/null
echo "✓ Pip upgraded"

# Install dependencies
echo "📦 Installing Python dependencies..."
pip install -r requirements.txt
echo "✓ Python dependencies installed"

# Install Playwright browsers
echo "🌐 Installing Playwright browsers..."
playwright install chromium
echo "✓ Playwright browsers installed"

# Create .env from example if it doesn't exist
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "✓ .env file created - Please edit it with your details"
else
    echo "✓ .env file already exists"
fi

# Check for resume
RESUME_EXISTS=0
for ext in pdf docx doc; do
    if ls config/resume.$ext 1> /dev/null 2>&1 || ls config/cv.$ext 1> /dev/null 2>&1; then
        RESUME_EXISTS=1
        break
    fi
done

if [ $RESUME_EXISTS -eq 0 ]; then
    echo "⚠️  No resume file found in config/"
    echo "   Please add your resume as config/resume.pdf or config/resume.docx"
else
    echo "✓ Resume file found"
fi

echo ""
echo "================================================"
echo "✅ Setup Complete!"
echo "================================================"
echo ""
echo "Next steps:"
echo "1. Edit .env file with your details:"
echo "   nano .env"
echo ""
echo "2. Edit config/preferences.yaml with your job preferences:"
echo "   nano config/preferences.yaml"
echo ""
echo "3. Add your resume to config/ directory (if not done already):"
echo "   cp ~/path/to/your/resume.pdf config/resume.pdf"
echo ""
echo "4. Run the agent:"
echo "   source venv/bin/activate"
echo "   python main.py"
echo ""
echo "================================================"
