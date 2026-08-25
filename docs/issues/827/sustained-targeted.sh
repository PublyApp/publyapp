#!/usr/bin/env bash
# W6-FLAKE #827 — sustained-load verification series against the SHIPPED chain.
#
# Per the captain's verification policy (2026-08-23): targeted files first,
# full chain once at the end, every burn bounded.
#
# One iteration = heavy.sh burn (self-terminating, itself wrapped in
# `timeout 300` per the brief's hard rule) + the shipped vitest invocation
# over the four staff list-route files (the flake's home) PLUS the new
# design-guards lane, mirroring the shipped ordering (renders finish, then
# guards). Wall time recorded per iteration into sustained-targeted.log.
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
FRONT="$(cd "$HERE/../../apps/front" && pwd)"

LOG="$HERE/sustained-targeted.log"
: > "$LOG"

for i in 1 2 3 4 5; do
	# Burner: bounded twice over (own deadline + timeout 300).
	timeout 300 "$HERE/heavy.sh" 110 >/dev/null 2>&1 &
	BURN_PID=$!
	sleep 2 # let the burn spin up before the suite starts

	START="$(date +%s.%N)"
	cd "$FRONT" || exit 1
	# Lane 1: the render-heavy route files under the SHIPPED main config.
	timeout 240 pnpm exec vitest run \
		src/routes/authed/staff/tenants.test.tsx \
		"src/routes/authed/staff/tenants/\$tenantId/users.test.tsx" \
		"src/routes/authed/staff/tenants/\$tenantId/profiles.test.tsx" \
		"src/routes/authed/staff/tenants/\$tenantId/invitations.test.tsx" \
		>"$HERE/.sustained-iter-$i.log" 2>&1
	STATUS=$?
	# Lane 2: the design-guards lane AFTER lane 1 finishes (shipped ordering).
	if [ "$STATUS" -eq 0 ]; then
		pnpm exec vitest run --config vitest.design-guards.config.ts \
			>>"$HERE/.sustained-iter-$i.log" 2>&1
		STATUS=$?
	fi
	END="$(date +%s.%N)"
	kill "$BURN_PID" 2>/dev/null
	wait "$BURN_PID" 2>/dev/null

	WALL="$(perl -e "printf '%.1f', $END - $START")"
	TESTS="$(grep -oE 'Tests +[0-9]+ passed \([0-9]+\)' "$HERE/.sustained-iter-$i.log" | tail -1)"
	echo "run$i STATUS=$STATUS WALL=${WALL}s $TESTS" | tee -a "$LOG"

	if [ "$STATUS" -ne 0 ]; then
		echo "run$i FAILED — tail of .sustained-iter-$i.log:" | tee -a "$LOG"
		tail -30 "$HERE/.sustained-iter-$i.log" | tee -a "$LOG"
		break
	fi
done

echo "SERIES_DONE" | tee -a "$LOG"
