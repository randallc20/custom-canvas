#!/usr/bin/env bash
# Nightly E2E wrapper for launchd (P3 fallback while GitHub Actions minutes
# are unavailable). Runs the full sweep against staging and keeps dated logs.
#
# Install (once):
#   cp scripts/com.customcanvas.e2e-nightly.plist ~/Library/LaunchAgents/
#   launchctl load ~/Library/LaunchAgents/com.customcanvas.e2e-nightly.plist
# Uninstall:
#   launchctl unload ~/Library/LaunchAgents/com.customcanvas.e2e-nightly.plist
#   rm ~/Library/LaunchAgents/com.customcanvas.e2e-nightly.plist
#
# Logs: ~/Library/Logs/custom-canvas-e2e/<date>.log (kept 30 days).
# The last line of each log is "NIGHTLY PASS" or "NIGHTLY FAIL".
set -uo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
LOGDIR="$HOME/Library/Logs/custom-canvas-e2e"
mkdir -p "$LOGDIR"
LOG="$LOGDIR/$(date +%Y-%m-%d).log"

# launchd starts with a minimal PATH; node/python live in the usual spots.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  source "$HOME/.nvm/nvm.sh" >/dev/null 2>&1 || true
fi

{
  echo "== nightly e2e $(date '+%Y-%m-%d %H:%M:%S') =="
  if "$REPO/scripts/run-e2e.sh"; then
    echo "NIGHTLY PASS"
  else
    echo "NIGHTLY FAIL"
  fi
} >> "$LOG" 2>&1

find "$LOGDIR" -name '*.log' -mtime +30 -delete
