#!/usr/bin/env python3
"""
Setup script for Job Agent (alternative to setup.sh for cross-platform)
"""

import os
import sys
import subprocess
import platform


def run_command(command, description, silent=False):
    """Run a shell command and handle errors."""
    print(f"🔄 {description}...")
    try:
        if silent:
            subprocess.run(command, shell=True, check=True, 
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            subprocess.run(command, shell=True, check=True)
        print(f"✓ {description} - Done")
        return True
    except subprocess.CalledProcessError as e:
        print(f"✗ {description} - Failed: {e}")
        return False


def main():
    """Main setup function."""
    print("=" * 60)
    print("🤖 Job Agent Setup")
    print("=" * 60)
    print()
    
    # Check Python version
    version = sys.version_info
    if version.major < 3 or (version.major == 3 and version.minor < 8):
        print("❌ Python 3.8 or higher is required")
        return 1
    
    print(f"✓ Python version: {version.major}.{version.minor}.{version.micro}")
    
    # Determine venv activation command
    is_windows = platform.system() == "Windows"
    venv_python = "venv\\Scripts\\python.exe" if is_windows else "venv/bin/python"
    venv_activate = "venv\\Scripts\\activate" if is_windows else "source venv/bin/activate"
    
    # Create virtual environment
    if not os.path.exists("venv"):
        if not run_command(f"{sys.executable} -m venv venv", "Creating virtual environment"):
            return 1
    else:
        print("✓ Virtual environment already exists")
    
    # Upgrade pip
    run_command(f"{venv_python} -m pip install --upgrade pip", 
                "Upgrading pip", silent=True)
    
    # Install dependencies
    if not run_command(f"{venv_python} -m pip install -r requirements.txt", 
                      "Installing Python dependencies"):
        return 1
    
    # Install Playwright browsers
    if not run_command(f"{venv_python} -m playwright install chromium", 
                      "Installing Playwright browsers"):
        print("⚠️  Playwright browser installation failed. You may need to run it manually.")
    
    # Create .env from example
    if not os.path.exists(".env"):
        if os.path.exists(".env.example"):
            import shutil
            shutil.copy(".env.example", ".env")
            print("✓ .env file created from template")
            print("⚠️  Please edit .env with your details")
        else:
            print("⚠️  .env.example not found")
    else:
        print("✓ .env file already exists")
    
    # Check for resume
    resume_found = False
    for ext in ['pdf', 'docx', 'doc']:
        if os.path.exists(f"config/resume.{ext}") or os.path.exists(f"config/cv.{ext}"):
            resume_found = True
            break
    
    if resume_found:
        print("✓ Resume file found")
    else:
        print("⚠️  No resume file found in config/")
        print("   Please add your resume as config/resume.pdf or config/resume.docx")
    
    print()
    print("=" * 60)
    print("✅ Setup Complete!")
    print("=" * 60)
    print()
    print("Next steps:")
    print("1. Edit .env file with your details")
    print()
    print("2. Edit config/preferences.yaml with your job preferences")
    print()
    print("3. Add your resume to config/ directory (if not done already)")
    print()
    print("4. Run the agent:")
    if is_windows:
        print("   venv\\Scripts\\activate")
    else:
        print("   source venv/bin/activate")
    print("   python main.py")
    print()
    print("=" * 60)
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
