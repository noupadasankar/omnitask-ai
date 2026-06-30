#!/bin/bash

echo "🔍 Checking Playwright browser installation status..."
echo ""

# Check if chromium is installed
if [ -f ~/.cache/ms-playwright/chromium-1097/chrome-linux/chrome ]; then
    echo "✅ Chromium browser is installed!"
    echo ""
    echo "Browser location: ~/.cache/ms-playwright/chromium-1097/"
    echo ""
    echo "You can now run the agent:"
    echo "  ./run.sh"
    echo ""
else
    echo "⏳ Chromium browser is NOT installed yet."
    echo ""
    echo "Please run this command to install it:"
    echo ""
    echo "  source venv/bin/activate"
    echo "  playwright install chromium"
    echo ""
    echo "This will download ~150MB of browser files."
    echo "It may take 5-10 minutes depending on your internet speed."
    echo ""
fi
