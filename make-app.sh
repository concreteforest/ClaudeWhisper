#!/bin/bash
# Generates ClaudeWhisper.app in ~/Applications.
# Re-run this if you move the repo.

REPO="$(cd "$(dirname "$0")" && pwd)"
APP="$HOME/Applications/ClaudeWhisper.app"
MACOS="$APP/Contents/MacOS"
RESOURCES="$APP/Contents/Resources"

echo "Creating $APP ..."
mkdir -p "$MACOS" "$RESOURCES"

# ---- Launcher script (the actual executable) --------------------------------
cat > "$MACOS/ClaudeWhisper" << SCRIPT
#!/bin/bash
REPO="$REPO"
LOG="\$HOME/Library/Logs/ClaudeWhisper.log"
ELECTRON="\$REPO/frontend-new/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"

mkdir -p "\$(dirname "\$LOG")"
exec >> "\$LOG" 2>&1
echo ""
echo "=== ClaudeWhisper started \$(date) ==="

# uv lives in Homebrew on this machine
export PATH="/opt/homebrew/bin:/usr/local/bin:\$PATH"

# Start backend
cd "\$REPO"
uv run run_server.py &
BACKEND_PID=\$!
echo "Backend PID: \$BACKEND_PID"

# Wait up to 30s for backend
for i in \$(seq 1 30); do
  if curl -s http://localhost:12393 >/dev/null 2>&1; then
    echo "Backend ready."
    break
  fi
  sleep 1
done

# Launch Electron (foreground — script waits here until window closes)
"\$ELECTRON" "\$REPO/frontend-new"

# Clean up backend when Electron exits
echo "Electron exited — stopping backend."
kill \$BACKEND_PID 2>/dev/null
wait \$BACKEND_PID 2>/dev/null
echo "=== ClaudeWhisper stopped \$(date) ==="
SCRIPT

chmod +x "$MACOS/ClaudeWhisper"

# ---- Info.plist -------------------------------------------------------------
cat > "$APP/Contents/Info.plist" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>    <string>ClaudeWhisper</string>
  <key>CFBundleIdentifier</key>    <string>com.claudewhisper.app</string>
  <key>CFBundleName</key>          <string>ClaudeWhisper</string>
  <key>CFBundleDisplayName</key>   <string>ClaudeWhisper</string>
  <key>CFBundlePackageType</key>   <string>APPL</string>
  <key>CFBundleVersion</key>       <string>1.0</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>CFBundleIconFile</key>      <string>icon</string>
  <key>NSMicrophoneUsageDescription</key>
  <string>ClaudeWhisper needs microphone access for voice input.</string>
  <key>LSUIElement</key>           <false/>
</dict>
</plist>
PLIST

# ---- Icon -------------------------------------------------------------------
# Copy PNG as icon (macOS will use it as-is; for a proper .icns run
# `iconutil` if you want pixel-perfect Retina icons later)
if [ -f "$REPO/frontend-new/icon.png" ]; then
  cp "$REPO/frontend-new/icon.png" "$RESOURCES/icon.png"
  # Wrap in a minimal icns if sips supports it
  sips -s format icns "$REPO/frontend-new/icon.png" \
       --out "$RESOURCES/icon.icns" >/dev/null 2>&1 || \
  cp "$REPO/frontend-new/icon.png" "$RESOURCES/icon.icns"
fi

echo ""
echo "Done. App is at: $APP"
echo "Logs go to:      ~/Library/Logs/ClaudeWhisper.log"
echo ""
echo "First launch: right-click the app → Open (macOS security prompt)."
echo "After that, double-click works normally."
echo "Drag to your Dock if you like."
