# Column Scan HEAD-Tree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the column-import guard compare its live scan directly with the exact committed `HEAD` tree and delete all merge-base/deletion bookkeeping.

**Architecture:** Git's committed `HEAD` tree is the reference surface. The live filesystem walk may contain additional uncommitted files, but it must contain every committed scanned-code path. Committed deletions need no exception because they are absent from `HEAD`.

**Tech Stack:** TypeScript, Node.js built-in test runner, Git plumbing commands.

---

### Task 1: Pin the HEAD-tree behavior

**Files:**

- Modify: `apps/front/scripts/guards/check-column-type-imports.test.mts`
- Test: `apps/front/scripts/guards/check-column-type-imports.test.mts`

- [x] **Step 1: Replace merge-base/deletion-policy unit tests with the exact set-difference contract**

```typescript
void test('#2033: every committed code path must appear in the live scan', () => {
	assert.throws(
		() =>
			assertCommittedTreeCovered(
				['apps/front/src/kept.ts', 'apps/front/src/missing.tsx'],
				['apps/front/src/kept.ts'],
			),
		/missing\.tsx/,
	);
});

void test('#2033: extra live files and committed deletions need no declaration', () => {
	assert.doesNotThrow(() =>
		assertCommittedTreeCovered(
			['apps/front/src/kept.ts'],
			['apps/front/src/kept.ts', 'apps/front/src/new.tsx'],
		),
	);
});
```

- [x] **Step 2: Add a Git-backed failing integration case**

Create a temporary repository, commit `apps/front/src/committed.ts`, remove it only from the
worktree, and call the real scan with `gitCwd: repo`. Assert failure names
`apps/front/src/committed.ts`.

- [x] **Step 3: Run the focused test and confirm RED**

Run: `pnpm --filter front test:column-type-imports-guard`

Expected: FAIL because `assertCommittedTreeCovered` is not exported and the production scan still
uses merge-base/deletion derivation.

### Task 2: Replace history reasoning with HEAD coverage

**Files:**

- Modify: `apps/front/scripts/guards/check-column-type-imports.mts`
- Test: `apps/front/scripts/guards/check-column-type-imports.test.mts`

- [x] **Step 1: Add the minimal path-coverage assertion**

```typescript
export const assertCommittedTreeCovered = (
	committedFiles: string[],
	liveFiles: string[],
): void => {
	const live = new Set(
		liveFiles.map(normalizedGitPath).filter(isScannedCodePath),
	);
	const missing = committedFiles
		.map(normalizedGitPath)
		.filter(isScannedCodePath)
		.filter((file) => !live.has(file))
		.sort();
	if (missing.length > 0) {
		throw new Error(
			`Guard #1769: the live scan missed committed code file(s): ${missing.join(', ')}.`,
		);
	}
};
```

- [x] **Step 2: Anchor the production scan to HEAD**

Use:

```typescript
const committedFiles = listFilesAtRef('HEAD', scannedSubtree, gitCwd);
const liveFiles = files.map((file) =>
	normalizedGitPath(path.relative(gitCwd, file)),
);
assertCommittedTreeCovered(committedFiles, liveFiles);
```

Keep the empty/unreadable-tree failures and the existing pinned-extension/exemption assertions.

- [x] **Step 3: Delete obsolete machinery**

Delete `resolveMergeBase`, `assertNoShrinkVsMergeBase`,
`listDeletedFilesBetweenRefs`, `assertOnlyCommittedDeletions`, extension-count comparison code,
and the `integrationBranch` option. Remove their imports and tests.

- [x] **Step 4: Run the focused suite and confirm GREEN**

Run: `pnpm --filter front test:column-type-imports-guard`

Expected: all focused tests pass, including the real temporary-Git cases.

### Task 3: Align evidence and verify the real tree

**Files:**

- Modify: `docs/records/2026-09-05-analysis-column-type-imports-guard-admission.md`
- Verify: `apps/front/scripts/guards/column-type-imports-baseline.json`

- [x] **Step 1: Rewrite the record around the narrower invariant**

State that `HEAD` is the committed source of truth, extra live files are scanned, committed
deletions require no exception, and the merge-base/deletion parser has been removed.

- [x] **Step 2: Run the real guard**

Run: `pnpm --filter front check:column-type-imports`

Expected: PASS and a non-zero scanned-file count.

- [x] **Step 3: Run static verification**

Run:

```bash
pnpm exec oxlint apps/front/scripts/guards/check-column-type-imports.mts apps/front/scripts/guards/check-column-type-imports.test.mts
pnpm exec oxfmt --check apps/front/scripts/guards/check-column-type-imports.mts apps/front/scripts/guards/check-column-type-imports.test.mts
git diff --check
```

Expected: zero errors and a clean diff check.

- [ ] **Step 4: Commit after the serialized full gate is available**

```bash
git add apps/front/scripts/guards/check-column-type-imports.mts \
  apps/front/scripts/guards/check-column-type-imports.test.mts \
  apps/front/scripts/guards/column-type-imports-baseline.json \
  docs/records/2026-09-05-analysis-column-type-imports-guard-admission.md \
  docs/superpowers/plans/2026-09-05-column-scan-head-tree.md
git commit -m "fix(guards): anchor scan surface to HEAD"
```

Do not push until an exact-head Sol review and the required local gate pass.
