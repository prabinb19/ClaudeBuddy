#!/bin/bash

# Claude with Dashboard wrapper
# This script launches the dashboard and then runs claude

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DASHBOARD_DIR="$(dirname "$SCRIPT_DIR")"

# Start dashboard in background (won't block, opens browser)
node "$DASHBOARD_DIR/scripts/launcher.js" &

# Small delay to let browser open first
sleep 0.5

# Run claude with all passed arguments
claude "$@"
