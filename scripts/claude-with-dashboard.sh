#!/bin/bash

# Claude with Dashboard wrapper
# This script launches the Electron dashboard app and then runs claude

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DASHBOARD_DIR="$(dirname "$SCRIPT_DIR")"

# Start Electron app in background
node "$DASHBOARD_DIR/scripts/launcher.js" &

# Small delay to let app start
sleep 1

# Run claude with all passed arguments
claude "$@"
