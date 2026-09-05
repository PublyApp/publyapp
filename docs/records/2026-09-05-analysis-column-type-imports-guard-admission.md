# Analysis: column-type-imports guard extension admission

Date: 2026-09-05
Issue: #2033

## Decision

Admit the #2033 shrink-only extension to guard #1769. The extension compares the
live `apps/front/src` scan surface with the common ancestor of `HEAD` and
`origin/develop`. It accepts additions, rejects unexplained removals, and allows
only exact code-file deletions recorded in the committed merge-base-to-HEAD Git
diff.

The committed baseline is one source of truth for scan policy only. It contains
neither authored per-extension counts, deletion declarations, nor slack. Counts
come from the anchored Git tree through `git merge-base` and
`git ls-tree -r -z --name-only`; legitimate deletions come from an exact
`git diff --no-renames --diff-filter=D`.

## Admission evidence

The prior authored-count contract had a reproducible concurrent-branch failure:
a branch that had not removed any files could become red after another branch
added files and updated the shared count. It also made an authored count a
potentially stale proxy for the actual scan surface. The focused proof covers
both the concurrent-branch scenarios and the defect class:

- `#2033 SCENARIO 1` proves that a branch remains green when the integration
  branch advances first.
- `#2033 SCENARIO 2` proves that independent additions need no baseline edit.
- `#2033 RED: assertNoShrinkVsMergeBase fails when live shrinks below the
merge-base count` proves an unexplained removal is caught.
- The Git integration tests prove that the reference is anchored to the
  repository, that only an exact committed deletion is accepted, and that the
  integration branch stays green after the deletion merges without a cleanup
  commit.

The exact focused command is:

```text
pnpm --filter front test:column-type-imports-guard
```

The conforming production run is:

```text
pnpm --filter front check:column-type-imports
```

## Protected invariant and why a normal test is insufficient

The protected invariant is build and release integrity: every code file under
the guarded source root must remain in the AST scan perimeter, so a direct
banned import cannot disappear from analysis when a file is moved or removed.
A normal fixture test can prove that a known file is scanned, but it cannot
compare two independently changing Git trees or distinguish an intentional
feature-branch deletion from an unexplained shrink. The merge-base tree and
exact committed deletion diff are therefore indispensable to this extension.

## Explicit maintenance cost

This extension carries the following recurring cost:

1. Every production invocation performs one `git merge-base`, one anchored
   `git ls-tree` read, and one path-scoped `git diff`; it therefore requires the
   configured integration ref (`origin/develop` in CI) to be fetched and
   reachable.
2. The implementation must keep the live tree walk, merge-base tree walk,
   path normalization, extension counting, and exact-deletion validation in
   sync. Git failures must remain actionable because a missing reference must
   fail closed rather than pass vacuously.
3. A deliberate code-file deletion must be committed. A missing live file that
   is absent from the committed deletion diff fails loudly; no temporary
   authored state or cleanup PR exists.
4. Changes to the scanned-extension, non-code-extension, or exemption policy
   require synchronized edits to the guard and its pinned JSON baseline.
5. The focused suite maintains temporary Git repositories for the concurrent
   branch, empty-reference, and deletion-lifecycle cases.

This cost is accepted because it prevents a silent build/release guard gap and
because the baseline no longer requires recurring authored count maintenance.

## Concrete retirement or replacement condition

Retire the #2033 extension together with guard #1769 when the underlying
TanStack table policy is removed: the supported table API accepts the current
imports, `column-type.ts` is deleted after all consumers migrate, and the
required front typecheck and production guard no longer need to forbid the
banned specifiers. The retirement change must delete the Git comparison and
this guard's baseline rather than leaving an unreferenced policy artifact.

Replace the custom Git comparison earlier if a stable off-the-shelf tool used by
required CI can enforce all of the same conditions: compare the checked-out
source surface with the merge base, fail on unexplained code-file shrinkage,
and recognize exact committed deletions without authored counts, allowlists, or
slack. Before replacement, the tool must pass the existing focused
violating/conforming and concurrent-branch proofs in the required front gate.
Until one of those conditions is met, the custom extension remains the narrowest
available mechanism for the invariant.
