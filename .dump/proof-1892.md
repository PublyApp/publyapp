# #1892 — audit-docs-prune.test.ts: 8 tests red, no barrier

Both halves of #1892 were resolved by commit `18f7f37df` (PR #1874), which is
already on `develop`.

## Step 1: The 8 fixtures are repaired

```bash
$ pnpm --filter scripts-ts exec vitest run src/audit-docs-prune.test.ts --reporter=verbose
 ✓ src/audit-docs-prune.test.ts > a real rename classified as delete fails --check naming the row (paid-modules RED, replayed) 173ms
 ✓ src/audit-docs-prune.test.ts > --check passes when a single squash prune commit lands on the default branch 254ms
 ✓ src/audit-docs-prune.test.ts > an inventory claiming a move git does not show fails --check 116ms
 ✓ src/audit-docs-prune.test.ts > a destination mismatch between the mapping and git's rename target fails --check 118ms
 ✓ src/audit-docs-prune.test.ts > a lane cut from the post-prune tip still passes --check (rev walked back to the pre-prune tree) 239ms
 ✓ src/audit-docs-prune.test.ts > walking the rev back does not weaken freshness: a tampered record still fails --check 244ms
 ✓ src/audit-docs-prune.test.ts > push event: one squash prune commit on the default branch checks green with remote ref AT HEAD and detached HEAD 465ms
 ✓ src/audit-docs-prune.test.ts > a file moved into protected docs/records never renders as a delete row 459ms
 Test Files  1 passed (1)
      Tests  8 passed (8)
```

## Step 2: The barrier is real

The suite IS wired to CI:

```bash
$ grep -n "audit-docs-prune.test.ts" .github/workflows/docs-archive.yml
138:        run: pnpm --filter scripts-ts exec vitest run src/audit-docs-prune.test.ts
```

The `docs-archive.yml` branch-protection gate is `docs-archive-gate`
(required on `pull_request` and `merge_group`). A skipped or failed
`docs-archive` job fails the gate (lines 253-258). The workflow also runs
in `just ci-doc-links` (justfile line 385) and `ci` (line 581).

## Files changed for this PR

None — the resolution was committed in `18f7f37df` (already on develop).
This entry documents the proof that the fix is real and the barrier is wired.
