#!/usr/bin/env bash
# Chantier #827 — bounded CPU-contention generator (W6-FLAKE reproduction).
#
# Spawns one busy-loop worker per core (12 on this host) to reproduce the
# "several heavy processes contending at once" condition from the issue.
# ALWAYS run bounded: `timeout 300 ./heavy.sh <seconds>` — see the brief's
# rule: never leave a CPU burner behind.
set -u

DURATION="${1:-60}"

cleanup() {
	if [ -n "${PIDS:-}" ]; then
		kill $PIDS 2>/dev/null
		wait $PIDS 2>/dev/null
	fi
	echo "[heavy] stopped after ${DURATION}s" >&2
}
trap cleanup EXIT INT TERM

CORES="$(nproc)"
PIDS=""
echo "[heavy] burning ${CORES} cores for ${DURATION}s"
for _ in $(seq 1 "$CORES"); do
	# Busy loop; exits on its own after DURATION as a second safety net.
	perl -e '
		my $deadline = time() + $ARGV[0];
		my $x = 0;
		$x = ($x * 1103515245 + 12345) % 2147483648 while time() < $deadline;
	' "$DURATION" &
	PIDS="$PIDS $!"
done

wait $PIDS 2>/dev/null
