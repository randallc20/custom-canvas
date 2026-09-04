#!/usr/bin/env bash
# The gate that CI used to be.
#
# GitHub Actions minutes are exhausted and cannot be bought (owner instruction 2026-09-03), so
# verification lives here now, on hardware that is already paid for.
#
#   ./gate.sh          lint · typecheck · unit · build      (~2 min; runs on pre-push)
#   ./gate.sh --e2e    + the browser suite against staging  (needs the deploy to be current)
#
# The fast gate is wired to `pre-push` (see .githooks/), so a red tree cannot leave the machine
# by accident.
set -uo pipefail
cd "$(dirname "$0")" || exit 1

# Git hooks run with a minimal PATH — no login shell, so nvm is never sourced
# and `npm` is not found. Every step then "fails" in 0s with `command not
# found`, which reads as a red tree and blocks the push for a reason that has
# nothing to do with the code. (The launchd nightly hit this same thing five
# times before it was diagnosed.) Resolve node ourselves when the caller has
# not: newest nvm version wins, and if there is genuinely no node we say so
# rather than reporting four failed steps.
if ! command -v npm >/dev/null 2>&1; then
  for bin in "$HOME/.nvm/versions/node"/*/bin; do
    [ -x "$bin/npm" ] && PATH="$bin:$PATH"
  done
  export PATH
fi
if ! command -v npm >/dev/null 2>&1; then
  printf '\033[31m✗ gate cannot run: npm is not on PATH and no nvm install was found\033[0m\n'
  exit 1
fi

MODE="fast"
[ "${1:-}" = "--e2e" ] && MODE="e2e"

FAILED=()
step() {
  local name="$1"; shift
  printf '\n\033[1m▸ %s\033[0m\n' "$name"
  local start=$SECONDS
  if "$@"; then
    printf '\033[32m  ✓ %s\033[0m (%ss)\n' "$name" "$((SECONDS - start))"
  else
    printf '\033[31m  ✗ %s\033[0m (%ss)\n' "$name" "$((SECONDS - start))"
    FAILED+=("$name")
  fi
}

step "Lint" npm run lint
step "Typecheck" npx tsc --noEmit
step "Unit tests" npm test
# The build is where a server/client boundary mistake actually surfaces, so it is in the fast
# gate rather than saved for later — it is also the step Vercel will run in a minute anyway.
step "Build" npm run build

if [ "$MODE" = "e2e" ]; then
  # Against the DEPLOYED staging app, so it proves what is live rather than what is local.
  # Whatever is deployed right now is what gets tested; there is no waiting for a deploy here,
  # because waiting is the thing that made this expensive in CI.
  step "E2E (staging)" npm run e2e
fi

printf '\n'
if [ ${#FAILED[@]} -eq 0 ]; then
  printf '\033[32m✓ gate passed (%s)\033[0m\n' "$MODE"
  exit 0
fi
printf '\033[31m✗ gate failed: %s\033[0m\n' "${FAILED[*]}"
exit 1
