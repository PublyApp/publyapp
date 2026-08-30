#!/usr/bin/env bash
# review-measure.sh — re-measurement of self-reviews among the 23 PRs listed
# in issue #1861.
#
# The review harness (queue.log, mk-review.sh, REVIEW_EXCLUDE_MODEL) is external
# infrastructure, not stored in this repository. This script re-derives the
# measurement independently from the merged commit messages of each PR.
#
# Every merge commit in this project carries a model-attribution block at the
# end of its message. This script extracts the implementer and reviewer model
# family for each PR and flags cases where they are the same family (self-review).
#
# Usage:
#   .dump/review-measure.sh            # print table to stdout
#   .dump/review-measure.sh > proof    # capture output
#
# Proof file: .dump/proof-1861.md contains the exact command, raw output, and
# a nominative table with the same-family verdict.

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/home/radan/Projects/PublyApp/publyapp}"
REPO="${REPO:-PublyApp/publyapp}"

# The 23 PRs listed in issue #1861.
PR_LIST=(
  1457 1564 1565 1571 1616 1627 1661 1668 1673 1676
  1680 1683 1684 1687 1689 1697 1729 1734 1753 1778
  1817 1825 1827
)

# Model family aliases used in attribution — used to normalise family identity.
declare -A FAMILY=(
  ["meituan/longcat-2.0"]="longcat"
  ["meituan/longcat-2.0:free"]="longcat"
  ["poolside/laguna-s-2.1"]="laguna"
  ["poolside/laguna-s-2.1:free"]="laguna"
  ["poolside/laguna-xs-2.1:free"]="laguna_xs"
  ["or:minimax/minimax-m3:free"]="minimax"
  ["minimax/minimax-m3:free"]="minimax"
  ["or:minimax/minimax-m2.7:free"]="minimax"
  ["MiniMaxAI/MiniMax-M3"]="minimax"
  ["tencent/hy3:free"]="hy3"
  ["Claude Opus 5"]="capitaine"
  ["jcode"]="capitaine"
  ["Nous Portal"]="ox_alpha"
  ["Ox Alpha"]="ox_alpha"
)

normalise_family() {
  local raw="$1"
  # Extract the model identifier — match known patterns.
  for key in "${!FAMILY[@]}"; do
    if echo "$raw" | grep -qi "$key"; then
      echo "${FAMILY[$key]}"
      return
    fi
  done
  echo "$raw"
}

printf '%-8s %-40s %-40s %s\n' "#PR" "IMPLEMENTER" "REVIEWER" "SELF?"
printf '%-8s %-40s %-40s %s\n' "----" "-----------" "--------" "-----"

for PR in "${PR_LIST[@]}"; do
  # Resolve merge commit OID from GitHub.
  OID=$(gh pr view "$PR" --repo "$REPO" --json mergeCommit --jq '.mergeCommit.oid' 2>/dev/null)
  if [[ -z "$OID" ]]; then
    printf '%-8s %-40s %-40s %s\n' "#$PR" "N/A" "N/A" "unresolved"
    continue
  fi

  MSG=$(git -C "$REPO_ROOT" log --format=%B -1 "$OID" 2>/dev/null)
  if [[ -z "$MSG" ]]; then
    printf '%-8s %-40s %-40s %s\n' "#$PR" "N/A" "N/A" "unresolved"
    continue
  fi

  # Extract implementer line.
  IMP_LINE=$(echo "$MSG" | grep -iE "Modèles|Modèle|Implémenté|Écrit par|Provenance|Implementation" | head -1)
  # Extract reviewer line.
  REV_LINE=$(echo "$MSG" | grep -iE "Relecture|relecteur|Reviewer" | head -1)

  IMP_FAM=$(normalise_family "$IMP_LINE")
  REV_FAM=$(normalise_family "$REV_LINE")

  if [[ "$IMP_FAM" == "$REV_FAM" && -n "$IMP_FAM" ]]; then
    VERDICT="YES"
  else
    VERDICT="no"
  fi

  printf '%-8s %-40s %-40s %s\n' "#$PR" "$IMP_FAM" "$REV_FAM" "$VERDICT"
done
