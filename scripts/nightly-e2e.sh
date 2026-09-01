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
# nvm.sh cannot be sourced under `set -u` (it dies silently on unbound
# variables — five straight NIGHTLY FAILs of `node: command not found`), so
# resolve the newest nvm node bin directly instead.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  NODE_BIN=$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | sort -V | tail -1)
  if [[ -n "${NODE_BIN:-}" ]]; then export PATH="$NODE_BIN:$PATH"; fi
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
