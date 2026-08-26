#!/usr/bin/env bash
# Full E2E suite runner (P3 of docs/HARDENING-AND-POLISH-PLAN.md).
#
#   ./scripts/run-e2e.sh              # full sweep against staging
#   E2E_MONEY=1 ./scripts/run-e2e.sh  # include the Stripe-test money loop
#   E2E_BASE_URL=... ./scripts/run-e2e.sh   # different target (e.g. local
#       prod build — remember NEXT_PUBLIC_* is baked at BUILD time, and the
#       build must not carry NEXT_PUBLIC_TURNSTILE_SITE_KEY or login is
#       captcha-gated)
#
# Generates the two fixture images, seeds DEV (scripts/seed-e2e.mjs), then
# runs each spec file SEQUENTIALLY with --workers=1 — parallel logins trip
# Supabase auth rate limits (e2e/README.md, "Environmental caveats").
# Continues through failures and reports a per-spec summary at the end.
set -uo pipefail

cd "$(dirname "$0")/.."

WORK="${TMPDIR:-/tmp}/custom-canvas-e2e"
mkdir -p "$WORK"

echo "== generating fixture images =="
python3 - "$WORK" <<'EOF'
import zlib, struct, os, sys
out = sys.argv[1]

def chunk(t, d):
    c = struct.pack('>I', len(d)) + t + d
    return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)

def write_png(path, w, h, raw, level):
    data = zlib.compress(raw, level)
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', data) + chunk(b'IEND', b''))

# Small: a solid 64x64 png (avatars, listing photos).
write_png(os.path.join(out, 'e2e-small.png'), 64, 64,
          b''.join(b'\x00' + bytes((200, 90, 60)) * 64 for _ in range(64)), 9)

# Big: ~16MB of random noise at zlib level 0 (stored, incompressible) —
# over the 10MB chat-attachment cap and the 5MB pre-downscale threshold.
w, h = 1600, 3400
raw = b''.join(b'\x00' + os.urandom(w * 3) for _ in range(h))
write_png(os.path.join(out, 'e2e-big.png'), w, h, raw, 0)

for n in ('e2e-small.png', 'e2e-big.png'):
    print('  %s %.1fMB' % (n, os.path.getsize(os.path.join(out, n)) / 1e6))
EOF
export E2E_SMALL_IMAGE="$WORK/e2e-small.png"
export E2E_BIG_IMAGE="$WORK/e2e-big.png"

echo "== seeding fixtures on DEV =="
SEED_EXPORTS=$(node scripts/seed-e2e.mjs) || { echo "seed failed" >&2; exit 1; }
eval "$SEED_EXPORTS"

# The sweep's spec files (docs/LIVE-TEST-PLAN.md coverage) plus the two
# fixture-consuming regression suites. purchase-refund is opt-in: it moves
# Stripe-test money and hides its own listing afterwards.
SPECS=(smoke visitor tester-journey artist-shop approval-flow setup-guard
       lover-social commissions partner admin-safety)
if [[ "${E2E_MONEY:-}" == "1" ]]; then SPECS+=(purchase-refund); fi

declare -a RESULTS
FAILED=0
for spec in "${SPECS[@]}"; do
  echo
  echo "== $spec =="
  if ./node_modules/.bin/playwright test "$spec" --project=chromium --workers=1; then
    RESULTS+=("PASS  $spec")
  else
    RESULTS+=("FAIL  $spec")
    FAILED=1
  fi
  # Let auth-token issuance cool off between spec files — back-to-back runs
  # throttle and produce hydration-stall flakes no human ever sees.
  sleep 45
done

echo
echo "== summary =="
printf '%s\n' "${RESULTS[@]}"
exit $FAILED
