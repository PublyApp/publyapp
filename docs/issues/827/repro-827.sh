#!/usr/bin/env bash
# Chantier #827 — deterministic single-flake reproduction under contention.
#
# Reproduces the exact mechanism from the issue: render workers resolving a
# large fixture (101-row table) while guard files burst-parse the whole src
# tree, under oversubscription and full-core external load. The repro config:
#  - runs the three 101-row table render files + the two tree-walking guards;
#  - pins guards AFTER the renders start (groupOrder 1), serial file execution,
#    maxWorkers 2x cores (pre-W6 oversubscription);
#  - restores testing-library's DEFAULT 1000ms findBy budget (setup-repro.ts);
#  - everything bounded by `timeout 300` (brief hard rule) + heavy.sh's own
#    self-terminating burn.
#
# Usage: timeout 300 .dump/wt827/repro-827.sh   (from anywhere)
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
FRONT="$(cd "$HERE/../../apps/front" && pwd)"

"$HERE/heavy.sh" 150 &
HEAVY_PID=$!

sleep 2 # let the burn spin up before the suite starts

cd "$FRONT" || exit 1
START="$(date +%s.%N)"
pnpm exec vitest run --config "$HERE/repro.vitest.config.ts" \
	src/routes/authed/staff/tenants.test.tsx \
	"src/routes/authed/staff/tenants/\$tenantId/users.test.tsx" \
	"src/routes/authed/staff/tenants/\$tenantId/profiles.test.tsx" \
	src/lib/i18n-key-coverage.test.ts \
	src/lib/mutation-feedback-architecture.test.ts
STATUS=$?
END="$(date +%s.%N)"

kill "$HEAVY_PID" 2>/dev/null
wait "$HEAVY_PID" 2>/dev/null

WALL="$(perl -e "printf '%.1f', $END - $START")"
echo ""
echo "=== REPRO RESULT: status=$STATUS wall=${WALL}s ==="
exit $STATUS
