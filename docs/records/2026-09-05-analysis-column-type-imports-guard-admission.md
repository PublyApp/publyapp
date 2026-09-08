# Analysis: column-type-imports guard extension admission

Date: 2026-09-05
Issue: #2033

## Decision

Admit the narrower #2033 extension to guard #1769. The exact committed `HEAD`
tree is the reference surface. The live filesystem walk must contain every
committed code path, while additional live files are accepted and scanned.
A committed deletion needs no exception because the deleted path is naturally
absent from `HEAD`.

The committed baseline pins scan policy only: scanned extensions, non-code
extensions, and exemptions. It contains no per-extension counts, deletion
declarations, or slack. The reference paths come from one command:
`git ls-tree -r -z --name-only HEAD -- apps/front/src`.

## Admission evidence

The prior authored-count contract could make an unchanged branch red after a
different branch added files. The replacement compares paths rather than
counts, so unrelated additions cannot create shared-baseline conflicts.

The focused proof checks that a missing committed path is named, extra live
paths pass, empty or unreadable references fail closed, and a real temporary
Git repository turns red when a committed file is removed only from the
worktree. The same suite preserves the extension, exemption, and AST-import
tests.

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
banned import cannot disappear from analysis when a scanner path is lost.
A normal AST fixture can prove that a known import is caught, but it cannot
prove that the production filesystem walker visited every committed path.
Comparing the live walk with the exact `HEAD` path set closes that gap without
reasoning about branch history.

## Explicit maintenance cost

1. Every production invocation performs one anchored `git ls-tree` read of
   `HEAD`; Git must therefore be available and the checked-out commit readable.
2. The implementation keeps only path normalization and one set-difference
   assertion aligned with the live walk. A missing reference still fails
   closed with actionable Git stderr.
3. A deliberate code-file deletion must be committed before the live scan can
   pass; no authored exception or cleanup state exists.
4. Changes to scanned-extension, non-code-extension, or exemption policy
   require synchronized edits to the guard and its pinned JSON baseline.
5. The focused suite maintains one temporary Git repository for fail-closed
   reference and missing-worktree-file cases.

This cost is accepted because it prevents a silent build/release guard gap and
because no recurring authored count or deletion bookkeeping remains.

## Concrete retirement or replacement condition

Retire the #2033 extension together with guard #1769 when the underlying
TanStack table policy is removed: the supported table API accepts the current
imports, `column-type.ts` is deleted after all consumers migrate, and the
required front typecheck and production guard no longer need to forbid the
banned specifiers. The retirement change must delete the Git comparison and
this guard's baseline rather than leaving an unreferenced policy artifact.

Replace the custom Git comparison earlier if a stable off-the-shelf tool used
by required CI can prove that every committed source path was visited by the
live scan without authored counts or allowlists. Before replacement, the tool
must pass the existing focused missing-path and conforming proofs in the
required front gate. Until one of those conditions is met, the `HEAD`-tree
comparison is the narrowest mechanism for the invariant.
