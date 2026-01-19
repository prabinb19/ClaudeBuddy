#!/bin/bash

# Claude Dashboard Startup Script
DASHBOARD_DIR="$(dirname "$0")/.."
PORT=3456
URL="http://localhost:$PORT"

# Check if server is already running
if curl -s "$URL/api/health" > /dev/null 2>&1; then
  # Server running, just open browser
  open "$URL" 2>/dev/null || xdg-open "$URL" 2>/dev/null || start "$URL" 2>/dev/null
else
  # Start server in background
  cd "$DASHBOARD_DIR"
  nohup node server/index.js > /dev/null 2>&1 &

  # Wait for server to be ready
  for i in {1..10}; do
    if curl -s "$URL/api/health" > /dev/null 2>&1; then
      break
    fi
    sleep 0.5
  done

  # Open browser
  open "$URL" 2>/dev/null || xdg-open "$URL" 2>/dev/null || start "$URL" 2>/dev/null
fi
