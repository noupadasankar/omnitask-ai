# Browser OAuth Fix - Testing Guide

## 🔧 What Was Fixed

### Problem
Google OAuth blocked Playwright Chromium with: **"This browser or app may not be secure"**

### Solution
Switched from Playwright Chromium → **System Chrome** with anti-detection measures

---

## ✅ Changes Applied

### 1. Browser Client ([src/browser/playwright_client.py](src/browser/playwright_client.py))
- Uses system Chrome (`channel='chrome'`)
- Hides automation signals (`navigator.webdriver = undefined`)
- Anti-bot flags: `--disable-blink-features=AutomationControlled`
- Realistic context: Asia/Kolkata timezone, en-US locale

### 2. Instahyre Portal ([src/portals/instahyre.py](src/portals/instahyre.py))
- 8+ login detection strategies (selectors + URL + page title)
- Better error messages and progress tracking
- Extended timeout with clearer user instructions

---

## 🧪 How to Test

### Option 1: Quick Browser Test (5 mins)
Tests only OAuth compatibility:

```bash
source venv/bin/activate
python test_browser.py
```

**You'll see:**
1. Chrome opens to Instahyre
2. Browser properties printed (user agent, webdriver status)
3. Instructions to test Google OAuth manually
4. 60 seconds to try logging in

**Success = Google OAuth works without "insecure browser" error**

---

### Option 2: Full Agent (Dry Run)
After Option 1 passes:

```bash
./run.sh
# Choose: 2 (Dry run)
```

**What happens:**
1. Opens Instahyre in Chrome
2. Waits 120s for you to login
3. Searches jobs matching your AI/ML preferences
4. Shows matches (no applications in dry-run)

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| "Chrome executable not found" | `sudo apt install google-chrome-stable` |
| Login timeout | Check logs: `tail -f logs/agent_*.log` |
| Selectors not working | Update selectors in `src/portals/instahyre.py` L21-28 |
| Still get OAuth error | Try Edge: change `channel='chrome'` to `'msedge'` |

---

## 📊 Expected Results

### ✅ Good Signs
- Chrome opens (not Chromium)
- Can click "Continue with Google"  
- Google login page appears normally
- No "insecure browser" warning
- Login completes successfully

### ❌ Bad Signs
- Still shows "insecure browser" error
- Browser crashes/hangs
- Login page never loads

Report results and I'll debug further! 🚀
