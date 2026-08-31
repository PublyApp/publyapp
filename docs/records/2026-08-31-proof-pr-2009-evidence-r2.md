# PR #2009 — Paired Red Proof Evidence

## Problem

When GitHub Actions checks out with `fetch-depth: 1`, the feature-ancestry guard (#1726)
in `apps/front/e2e/helpers/feature-ancestry.ts` uses only `git merge-base --is-ancestor`.
When a commit is **missing entirely** from a shallow checkout, `merge-base` exits non-zero —
which the old helper interprets as "this branch predates the feature commit." It then tells the
author to rebase on top of `develop`. But the real problem is **missing history**, and the real
remedy is to set `fetch-depth: 0`.

## Fix

PR #2009 adds a `git cat-file -e <sha>^{commit}` pre-check before the ancestry test. If the
commit is not present at all, the helper throws a message that names "shallow checkout" as the
cause and prescribes `fetch-depth: 0` / `git fetch` as the remedy. If the commit IS present,
the old `merge-base --is-ancestor` logic runs unchained — no behavior change.

## Paired proof

The proof script `<worktree-root>/.dump/paired-proof-2009.mjs` builds two real throwaway git
repositories and runs both the OLD helper (inlined verbatim from the pre-#2009 code) and the
NEW helper (loaded from the real `feature-ancestry.ts` via tsx) against each.

```
$ node .dump/paired-proof-2009.mjs
```

### Case 1: genuine shallow clone (`git clone --depth 1`), commit NOT in history

- `cat-file -e <sha>`: exits 128 — `fatal: Not a valid object name ...`
- OLD helper → THREW with "older than publish-now" + "Rebase on top of develop" (misdiagnosis)
- NEW helper → THREW with "This checkout has no history for the publish-now (#1457) merge..."
  + "Cause: shallow checkout (fetch-depth: 1)" + "Remedy: fetch the history — set fetch-depth: 0..."

### Case 2: full repo, commit present on a sibling branch (NOT an ancestor of HEAD)

- `cat-file -e <sha>`: exits 0 (commit is present)
- `merge-base --is-ancestor`: exits 1 (present but not an ancestor)
- OLD helper → THREW with "older than" + "Rebase" (correct)
- NEW helper → THREW with the same "older than" + "Rebase" (correct, no regression)

## Conclusion

The `cat-file -e` pre-check correctly distinguishes:

1. **Missing history** (shallow checkout) → names the cause and prescribes `fetch-depth: 0`
2. **Genuinely older branch** (commit present but not ancestor) → unchanged behavior, "rebase"

The OLD helper conflates cases 1 and 2 and gives incorrect guidance for case 1.
The NEW helper resolves the conflation without regressing case 2.

This proof is committed at `.dump/paired-proof-2009.mjs` and runs with `node` (no tsx needed
for the driver; tsx is used only to load the real `.ts` helper).
