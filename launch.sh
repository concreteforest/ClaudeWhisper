#!/bin/bash
# ClaudeWhisper launcher — starts backend + Electron frontend together

REPO="$(cd "$(dirname "$0")" && pwd)"
FRONTEND="$REPO/frontend-new"

echo "Starting ClaudeWhisper..."

# One-time setup: copy icon and install npm deps if needed
if [ ! -f "$FRONTEND/icon.png" ]; then
  cp "$REPO/frontend/resources/icon.png" "$FRONTEND/icon.png" 2>/dev/null || true
fi
if [ ! -d "$FRONTEND/node_modules" ]; then
  echo "Installing frontend dependencies..."
  cd "$FRONTEND" && npm install
fi

# Start backend in background
cd "$REPO"
uv run run_server.py &
BACKEND_PID=$!
echo "Backend started (PID $BACKEND_PID)"

# Wait for backend to be ready
echo "Waiting for backend..."
for i in $(seq 1 30); do
  if curl -s http://localhost:12393 >/dev/null 2>&1; then
    echo "Backend ready."
    break
  fi
  sleep 1
done

# Start Electron frontend
cd "$FRONTEND"
npm run dev &
FRONTEND_PID=$!
echo "Frontend started (PID $FRONTEND_PID)"

# On Ctrl+C, kill both
trap "echo 'Shutting down...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM

wait
