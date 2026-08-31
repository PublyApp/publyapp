# PR #2009 — Paired Red Proof Evidence

## Problem

When GitHub Actions checks out with `fetch-depth: 1`, the feature-ancestry guard (#1726)
in `apps/front/e2e/helpers/feature-ancestry.ts` used only `git merge-base --is-ancestor`.
When a commit is **missing entirely** from a shallow checkout, `merge-base` exits 128 —
which the old code interpreted as "this branch predates the feature commit." It then told the
author to rebase on top of `develop`. But the real problem is **missing history**, and the real
remedy is to set `fetch-depth: 0`.

## Fix

PR #2009 adds a `git cat-file -e <sha>^{commit}` pre-check before the ancestry test. If the
commit is not present at all, the helper throws a message naming "shallow checkout" as the
cause and prescribing `fetch-depth: 0` / `git fetch` as the remedy. If the commit IS present,
the original `merge-base --is-ancestor` logic runs unchanged — no behavior change.

## Paired red proof (committed)

The versionned paired red proof lives at
`apps/front/tests/proofs/2009/red-2009-shallow-checkout-misdiagnosis.test.ts`
with manifest
`apps/front/tests/proofs/2009/red-2009-shallow-checkout-misdiagnosis.test.ts.expected-red.json`.

It builds **two real throwaway git repositories** and asserts the **defect** against the
current (fixed) code:

### Case 1: genuine shallow clone (`git clone --depth 1`), commit NOT in history

- `cat-file -e <sha>`: exits 128 — `fatal: Not a valid object name ...`
- The proof asserts the BUG: the error message contains `"older than the"` + `"Rebase"`
  (the old misdiagnosis).
- On the fixed code, the actual message says `"no history"` + `"fetch"` + `"shallow checkout"`.
- Result: the assertion **FAILS with AssertionError** — the kept-red state the CI step
  demands.

### Case 2: full repo, commit present on a sibling branch (NOT an ancestor of HEAD)

- `cat-file -e <sha>`: exits 0 (commit is present)
- `merge-base --is-ancestor`: exits 1 (present but not an ancestor)
- This is a CONTEXT pin (not declared kept-red): both buggy and fixed code must say
  `"older than"` + `"Rebase"`.
- Result: the test **PASSES** — confirming the #1726 behavior is preserved, not swallowed.

### Running the proof

```
cd apps/front && pnpm exec vitest run --config vitest.preuves.config.ts \
  tests/proofs/2009/red-2009-shallow-checkout-misdiagnosis.test.ts
```

Expected: 1 failed (the DEFECT assertion, AssertionError = kept-red), 1 passed (the CONTEXT pin).

### Running the CI runner locally

```
cd apps/front && node scripts/ci/run-preuves.mts
```

Output:
```
Proof tests failed as expected: 1
Proof tests passed unexpectedly:  0
Corrupt/unparseable proof files:  0
Declared proofs missing from tree: 0
Stale proofs (declared red went green): 0

All declared proof tests behaved as expected.
```

## Mutation guide

To reintroduce the bug (make the proof go stale / green):

1. In `feature-ancestry.ts`, remove the `cat-file -e` pre-check (lines 81-100) and go
   straight to `merge-base --is-ancestor`. The absent commit causes `merge-base` to exit 128,
   which the guard reads as "not an ancestor" → throws "older than" + "Rebase" → the DEFECT
   assertion passes → proof goes stale.
2. Or: set `fetch-depth: 1` on the front-e2e `test` job checkout AND remove the #2000 workflow
   pinning test. The guard has no history and the old code misreports it as stale.

## Scratch driver (not versionned)

A standalone driver script at `.dump/paired-proof-2009.mjs` (gitignored scratch space)
also demonstrates the OLD vs NEW divergence by building real repos and printing both messages.
Run with:
```
node .dump/paired-proof-2009.mjs
```

## Validation

### Mutation testing (bug reintroduction)

To confirm the proof actually catches the regression, the fix in `feature-ancestry.ts`
was temporarily reverted to the pre-#2009 version (from commit `5f9e41ad8`):

- **Against buggy code**: both tests PASS (proof is stale — bug present)
- **Against fixed code**: DEFECT test FAILS with AssertionError (kept-red — bug fixed),
  CONTEXT test PASSES (no regression)

This confirms the proof discriminates the two states correctly.

### Lint and type checks

- `npx oxlint apps/front/tests/proofs/2009/` → clean (0 errors)
- `npx tsc --noEmit` → no errors for the proof file
- oxfmt ran via lint-staged on commit (both `.ts` and `.json` files)

### CI workflow pinning

`front-e2e.yml` test job confirmed to have `fetch-depth: 0` (pinned by the GREEN
workflow test in `feature-ancestry.test.ts` line 315+).

## Conclusion

The `cat-file -e` pre-check correctly distinguishes:

1. **Missing history** (shallow checkout) → names the cause and prescribes `fetch-depth: 0`
2. **Genuinely older branch** (commit present but not ancestor) → unchanged behavior, "rebase"

The OLD helper conflates cases 1 and 2, giving incorrect guidance for case 1.
The NEW helper resolves the conflation without regressing case 2.
