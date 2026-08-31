#!/usr/bin/env sh
# Verifies that the tracked hooks in .husky/ are executable in the working
# copy — guards against the silent-stale-worktree failure mode (issue
# #1933). A worktree left on a commit from before #1907 has `.husky/pre-commit`
# checked out at mode 100644 even though develop tracks it at 100755, and git
# silently ignores a non-executable hook — no error, no warning, no visible
# difference from a protected worktree. This script refuses to start work
# from such a worktree without naming the cause and printing the exact
# repair command.
#
# This script is sourced (`. "$(dirname "$0")/_verify-hooks.sh"`) from
# .husky/pre-commit and .husky/pre-push so the check runs on every git
# operation. It is intentionally a separate file (not inlined into the two
# hooks) so the logic stays in one place and the test for it lives next to it.
#
# CRITICAL — `return` only, never `exit`. The script is sourced, so an
# `exit` would terminate the *hook's* shell before the hook's own logic
# ran (issue #1933 round-2 finding: `exit 0` at the bottom of this file
# used to kill pre-commit before lint-staged ever fired — the silent-inert
# class of defect this script was meant to fix). `return 0` / `return 1`
# make the sourced script a function: the caller's `$?` reflects the
# verdict and the caller's own `if ! . _verify-hooks.sh; then exit 1; fi`
# (or an unconditional `return 1` upstream) decides what to do.
#
# Return codes:
#   0 — every hook is executable in both the index and the working copy.
#   1 — at least one hook is missing or non-executable; the cause and the
#       exact `chmod +x` command have been printed to stderr.
#
# Portability: `stat -c '%a'` is GNU; BSD/macOS uses `stat -f '%Lp'`. We try
# GNU first and fall back to BSD. POSIX `ls -l` is the last resort — it
# prints the mode in a parseable human form, and we slice the first three
# digits of the permission triplet.
#
# Authoring rule: the script never asks the user to know git internals.
# A repair that requires `git update-index` knowledge is not a repair —
# the chmod command is printed verbatim.

set -u

# Read the working-copy permission bits of $1 (a path) and echo them as a
# 3-digit octal string (e.g. "755", "644"). Returns empty if the file
# does not exist.
working_mode() {
	if [ ! -f "$1" ]; then
		return 0
	fi
	if stat -c '%a' "$1" >/dev/null 2>&1; then
		stat -c '%a' "$1"
		return 0
	fi
	if stat -f '%Lp' "$1" >/dev/null 2>&1; then
		stat -f '%Lp' "$1"
		return 0
	fi
	# POSIX fallback: parse `ls -l`. The human form is `-rwxr-xr-x` —
	# ten characters where index 1..3 are the user triplet, 4..6 the
	# group triplet, 7..9 the other triplet, and 10 is an optional
	# indicator. We do NOT try to convert back to octal digits (the
	# previous shape did `substr($1, 2, 3)` and got the literal
	# letters `rwx` — `is_executable` then treated every file as
	# non-executable and refused every worktree on any system that
	# reached this fallback). Instead we extract the user/group/other
	# triplets and emit a string in the same "triplet of digits" shape
	# the rest of this script expects: "755" if any triplet has the x
	# bit, "644" if none does. The number is the *maximum* execute
	# permission a user could have: owner with x, group with x, other
	# with x → `7`. Owner with x, group without, other without → `7`.
	# Owner without, group with x, other without → `5`. This is good
	# enough for `is_executable`, which only checks whether any digit
	# is odd (i.e. any execute bit is set).
	ls -l "$1" 2>/dev/null | awk '
		NR==1 {
			# Drop the leading "-" (regular file indicator).
			t = substr($1, 2)
			# Pad to 9 chars (some `ls` implementations omit a
			# trailing space for non-special files).
			while (length(t) < 9) t = t " "
			user = substr(t, 1, 3)
			grp  = substr(t, 4, 3)
			oth  = substr(t, 7, 3)
			d = 0
			if (index(user, "x") > 0) d = d + 4
			if (index(grp,  "x") > 0) d = d + 2
			if (index(oth,  "x") > 0) d = d + 1
			# Always emit a 3-digit form (`is_executable` only
			# recognises `100???`, `??????`, or `???`; a bare "0"
			# would fall through to the loud "unexpected mode
			# length" branch).
			pad = "00"
			if (d >= 10) pad = "0"
			else if (d > 0) pad = "00"
			print pad d
			exit
		}
	'
}

# Read the index mode of $1 (a repo-relative path) and echo it as a
# 6-digit octal string matching git ls-files --stage output (e.g.
# "100755"). Returns empty if the path is not in the index.
index_mode() {
	line=$(git ls-files --stage -- "$1" 2>/dev/null)
	if [ -z "$line" ]; then
		return 0
	fi
	echo "$line" | awk '{print $1}'
}

# Returns 0 if the 3- or 6-digit mode string represents an executable file
# (any of the owner/group/other execute bits set). Git prefixes regular
# files with `100`, so strip that prefix for 6-digit modes, then check if
# any of the three permission digits is odd — an octal digit is odd exactly
# when its execute bit is set. `100755` → `755` → 7 and 5 are odd → executable.
# `100644` → `644` → all even → not executable.
# For 3-digit modes (from `stat -c '%a'`), check directly without stripping.
# Non-regular file modes (symlinks: 120000, submodules: 160000, etc.) are
# rejected loudly with the mode name — a guard that cannot analyse its input
# must fail by naming the cause, never by silently substituting a default.
is_executable() {
	local mode="$1"
	case "$mode" in
		100???)
			# 6-digit git mode for a regular file: strip the 100 prefix and
			# check the 3-digit permission triplet.
			mode="${mode#100}" ;;
		??????)
			# 6-digit mode that is NOT a regular file (120000 symlink,
			# 160000 submodule, etc.): reject loudly by naming the mode.
			echo "[verify-hooks] is_executable: unexpected non-regular file mode: $mode" >&2
			return 1 ;;
		???)
			# 3-digit mode (755, 644): direct permission triplet — accept.
			;;
		*)
			# Any other length: reject.
			echo "[verify-hooks] is_executable: unexpected mode length: $mode" >&2
			return 1 ;;
	esac
	case "$mode" in
		*1*|*3*|*5*|*7*) return 0 ;;
	esac
	return 1
}

# Determine the worktree root as git itself sees it. cd into it so every
# relative path resolves against the same root the user sees in `pwd`.
WORKTREE_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [ -z "$WORKTREE_ROOT" ]; then
	# Outside a git work tree: nothing to verify. Pre-commit/pre-push are
	# only fired by git itself, so this should never happen — but refuse
	# to keep working silently if it does.
	echo "[verify-hooks] not inside a git work tree — cannot verify .husky/ hooks." >&2
	return 1
fi
cd "$WORKTREE_ROOT" || return 1

HOOK_DIR=".husky"
HOOKS="pre-commit pre-push"

failed=0
report=""

for hook in $HOOKS; do
	path="$HOOK_DIR/$hook"
	full_path="$WORKTREE_ROOT/$path"
	wm=$(working_mode "$full_path")
	im=$(index_mode "$path")

	if [ -z "$wm" ]; then
		report="$report
- $hook: missing tracked hook file \"$path\" (looked at $full_path). The checkout is incomplete.
  Repair: re-run \`pnpm install\` (or \`pnpm run prepare\`) to restore the tracked hooks, then check out \"$path\" again."
		failed=1
		continue
	fi

	# Normalise the working-copy mode into the 3-digit octal triplet git
	# uses inside the 6-digit index mode. The previous `sed 's/^0//'`
	# only stripped ONE leading zero (`4755` stayed 4 digits → the
	# `is_executable` odd-length branch fired with a loud "unexpected
	# mode length" message on a file that is plainly a normal mode).
	# Real stat outputs we may see:
	#   "755"  /  "4755" /  "0644" /  "100755" /  "100644"
	# 5-digit outputs (`4755`) come from `stat -c '%a'` on a file with
	# setuid/setgid/sticky bits (the leading `4` is the setuid bit on
	# the user position). 4-digit outputs (`0644`) come from BSD stat
	# with `%Lp` printing with a leading zero. Normalise both to a
	# clean 3-digit triplet that `is_executable` recognises.
	case "$wm" in
		??????) wm_short=$(echo "$wm" | sed 's/^100//') ;;
		?????)  wm_short="${wm#0}" ;;
		????)   wm_short="${wm#0}" ;;
		*)      wm_short="$wm" ;;
	esac

	index_executable="no"
	working_executable="no"
	if [ -n "$im" ] && is_executable "$im"; then
		index_executable="yes"
	fi
	if is_executable "$wm_short"; then
		working_executable="yes"
	fi

	if [ "$index_executable" = "yes" ] && [ "$working_executable" = "no" ]; then
		report="$report
- $hook: stale worktree: \"$path\" is committed as mode $im (executable) in the index, yet the working copy carries mode $wm (non-executable). Git silently ignores a non-executable hook, so this worktree's pre-commit guard is INERT — unformatted code will sail through.
  Repair: chmod +x \"$full_path\""
		failed=1
	elif [ "$index_executable" = "no" ] && [ "$working_executable" = "no" ]; then
		report="$report
- $hook: \"$path\" is not executable (mode $wm). Git silently ignores a non-executable hook, so this worktree's pre-commit guard is INERT.
  Repair: chmod +x \"$full_path\""
		failed=1
	elif [ "$index_executable" = "no" ] && [ "$working_executable" = "yes" ]; then
		report="$report
- $hook: \"$path\" mode drift: working copy is mode $wm (executable) but the index expects mode $im. The committed hook must be executable for the guard to fire.
  Repair: chmod +x \"$full_path\""
		failed=1
	fi
done

if [ "$failed" -ne 0 ]; then
	echo "" >&2
	echo "[verify-hooks] hook file(s) are not executable in this worktree:$report" >&2
	echo "" >&2
	echo "[verify-hooks] Git hooks are NOT ACTIVE. The pre-commit guard is inert and will not catch unformatted code." >&2
	echo "[verify-hooks] Fix the cause above (the printed chmod command), then retry." >&2
	return 1
fi

return 0