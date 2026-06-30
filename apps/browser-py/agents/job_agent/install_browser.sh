
#!/bin/bash

echo "================================================"
echo "🌐 Installing Playwright Chromium Browser"
echo "================================================"
echo ""
echo "This will download ~150MB of browser files."
echo "Please be patient, it may take 5-10 minutes..."
echo ""

# Activate venv
source venv/bin/activate

# Install chromium
echo "Starting download..."
playwright install chromium

# Check if successful
if [ -f ~/.cache/ms-playwright/chromium-1097/chrome-linux/chrome ]; then
    echo ""
    echo "================================================"
    echo "✅ SUCCESS! Browser installed successfully!"
    echo "================================================"
    echo ""
    echo "You can now run the agent:"
    echo "  ./run.sh"
    echo ""
else
    echo ""
    echo "================================================"
    echo "❌ Installation failed or incomplete"
    echo "================================================"
    echo ""
    echo "Please try again or check your internet connection."
    echo ""
fi
