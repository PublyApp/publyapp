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
# This script is sourced from .husky/pre-commit and .husky/pre-push so the
# check runs on every git operation. It is intentionally a separate file
# (not inlined into the two hooks) so the logic stays in one place and the
# test for it lives next to it.
#
# Exit codes:
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
	# POSIX fallback: parse `ls -l`.
	ls -l "$1" | awk 'NR==1 {print substr($1, 2, 3); exit}'
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
# (any of the owner/group/other execute bits set).
is_executable() {
	case $1 in
		*[1357]) return 0 ;;
		*[1357]) return 0 ;;
	esac
	# Strip the leading "100" git uses on regular files, then check the
	# last digit of each permission triplet.
	trimmed=$(echo "$1" | sed 's/^100//')
	last_char=$(echo "$trimmed" | awk '{print substr($0, length, 1)}')
	mid_char=$(echo "$trimmed" | awk '{print substr($0, length-1, 1)}')
	first_char=$(echo "$trimmed" | awk '{print substr($0, length-2, 1)}')
	case "$last_char$mid_char$first_char" in
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
	exit 1
fi
cd "$WORKTREE_ROOT" || exit 1

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
	# uses inside the 6-digit index mode.
	case "$wm" in
		??????) wm_short=$(echo "$wm" | sed 's/^100//') ;;
		????) wm_short=$(echo "$wm" | sed 's/^0//') ;;
		*) wm_short="$wm" ;;
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
	exit 1
fi

exit 0