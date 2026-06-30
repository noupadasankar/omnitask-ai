#!/usr/bin/env python3
"""
Quick verification script to test if everything is set up correctly.
"""

import sys
import os

def test_imports():
    """Test if all required modules can be imported."""
    print("🔍 Testing imports...")
    
    modules = [
        'yaml',
        'playwright',
        'PyPDF2',
        'docx',
        'pdfplumber',
        'requests',
        'bs4',
        'pandas',
        'colorlog',
    ]
    
    failed = []
    for module in modules:
        try:
            __import__(module)
            print(f"  ✓ {module}")
        except ImportError as e:
            print(f"  ✗ {module}: {e}")
            failed.append(module)
    
    return len(failed) == 0


def test_project_structure():
    """Test if project structure is correct."""
    print("\n📁 Testing project structure...")
    
    required_paths = [
        'config/preferences.yaml',
        'config/portals.yaml',
        'src/agent/orchestrator.py',
        'src/database/tracker.py',
        'src/browser/playwright_client.py',
        'src/portals/naukri.py',
        'src/resume/parser.py',
        'main.py',
    ]
    
    missing = []
    for path in required_paths:
        if os.path.exists(path):
            print(f"  ✓ {path}")
        else:
            print(f"  ✗ {path} - MISSING")
            missing.append(path)
    
    return len(missing) == 0


def test_resume():
    """Test if resume file exists."""
    print("\n📄 Testing resume...")
    
    resume_paths = [
        'config/resume.pdf',
        'config/resume.docx',
        'config/cv.pdf',
        'config/cv.docx',
    ]
    
    for path in resume_paths:
        if os.path.exists(path):
            print(f"  ✓ Resume found: {path}")
            return True
    
    print("  ✗ No resume file found")
    return False


def test_database():
    """Test database functionality."""
    print("\n🗄️  Testing database...")
    
    try:
        from src.database.tracker import DatabaseTracker
        db = DatabaseTracker("data/test.db")
        stats = db.get_application_stats()
        db.close()
        os.remove("data/test.db")
        print("  ✓ Database working")
        return True
    except Exception as e:
        print(f"  ✗ Database test failed: {e}")
        return False


def test_resume_parser():
    """Test resume parser."""
    print("\n📝 Testing resume parser...")
    
    try:
        from src.resume.parser import find_resume_file, ResumeParser
        
        resume_file = find_resume_file()
        if not resume_file:
            print("  ⚠️  No resume file found to test")
            return False
        
        parser = ResumeParser(resume_file)
        print(f"  ✓ Resume parsed successfully")
        print(f"    - Email: {parser.parsed_data.get('email', 'Not found')}")
        print(f"    - Phone: {parser.parsed_data.get('phone', 'Not found')}")
        print(f"    - Skills: {len(parser.parsed_data.get('skills', []))} found")
        return True
    except Exception as e:
        print(f"  ✗ Resume parser test failed: {e}")
        return False


def main():
    """Main verification function."""
    print("=" * 60)
    print("🤖 Job Agent Verification")
    print("=" * 60)
    print()
    
    tests = [
        ("Imports", test_imports),
        ("Project Structure", test_project_structure),
        ("Resume", test_resume),
        ("Database", test_database),
        ("Resume Parser", test_resume_parser),
    ]
    
    results = []
    for test_name, test_func in tests:
        try:
            result = test_func()
            results.append((test_name, result))
        except Exception as e:
            print(f"  ✗ Test failed with exception: {e}")
            results.append((test_name, False))
        print()
    
    print("=" * 60)
    print("📊 Test Results")
    print("=" * 60)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print()
    print(f"Total: {passed}/{total} tests passed")
    print("=" * 60)
    
    if passed == total:
        print("\n🎉 All tests passed! Your agent is ready to run.")
        print("\nTo run the agent:")
        print("  1. Edit .env with your details (if not done)")
        print("  2. Edit config/preferences.yaml with your preferences")
        print("  3. Run: python main.py")
        return 0
    else:
        print("\n⚠️  Some tests failed. Please fix the issues above.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
