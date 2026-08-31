---
date: 2026-08-30
type: review
topic: 1962-guard-test-deletion
issue: 1962
pr: 2004
---

# Proof record: #1962 guard against test deletion from guard test files

This document records the live, reproducible proofs for the guard implemented in PR #2004. Each proof case runs the real test suite and CLI against real git fixtures, not mocks. All commands are verbatim from the worktree `lane/guard-test-deletion`.

## Test suite

```
$ pnpm --filter scripts-ts exec vitest run src/check-guard-test-deletion.test.ts --reporter=verbose
```

```
 RUN  v4.1.11 /home/radan/Projects/PublyApp/publyapp/.worktrees/guard-testdel/packages/scripts-ts

 ✓ src/check-guard-test-deletion.test.ts > extractTestNamesFromSource: extracts simple test() names
 ✓ src/check-guard-test-deletion.test.ts > extractTestNamesFromSource: handles double-quoted strings
 ✓ src/check-guard-test-deletion.test.ts > extractTestNamesFromSource: handles backtick template strings
 ✓ src/check-guard-test-deletion.test.ts > extractTestNamesFromSource: ignores test name in comments
 ✓ src/check-guard-test-deletion.test.ts > extractTestNamesFromSource: handles test.each with array data
 ✓ src/check-guard-test-deletion.test.ts > extractTestNamesFromSource: handles test.each tagged template form
 ✓ src/check-guard-test-deletion.test.ts > extractTestNamesFromSource: handles interpolated template names
 ✓ src/check-guard-test-deletion.test.ts > extractTestNamesFromSource: handles nested describe with tests
 ✓ src/check-guard-test-deletion.test.ts > extractTestNamesFromSource: handles all quote styles
 ✓ src/check-guard-test-deletion.test.ts > extractTestNamesFromSource: skips test calls without string name
 ✓ src/check-guard-test-deletion.test.ts > extractTestNamesFromSource: extracts full test names with special chars
 ✓ src/check-guard-test-deletion.test.ts > #1962 proof 1: deleted check-jscpd tests are caught, naming each one
 ✓ src/check-guard-test-deletion.test.ts > #1962 proof 2: count-trap PR that deletes 3 and adds 3 still goes RED
 ✓ src/check-guard-test-deletion.test.ts > #1962 proof 3a: deletion WITH exact naming in PR body passes
 ✓ src/check-guard-test-deletion.test.ts > #1962 proof 3b: vague PR body does not satisfy the check
 ✓ src/check-guard-test-deletion.test.ts > #1962 proof 4: renaming tests without naming original goes RED
 ✓ src/check-guard-test-deletion.test.ts > #1962 proof 5: deleting an entire test file goes RED
 ✓ src/check-guard-test-deletion.test.ts > fails loudly when merge-base cannot be resolved
 ✓ src/check-guard-test-deletion.test.ts > push event with deletions goes RED
 ✓ src/check-guard-test-deletion.test.ts > real repo check passes when no tests are deleted

 Test Files  1 passed (1)
      Tests  20 passed (20)
```

## CLI on the real repo

```
$ node ./packages/scripts-ts/src/check-guard-test-deletion.ts
```

```
Guard test deletion guard: PASSED
Base commit: 76afc3be24a4a235531597711facaeffef2dd13c
Head commit: bfbe20574345cab66359f37c17ff69287c553a5a
```

Exit code 0 — no deletions in the current HEAD.

---

## Proof 1: The real incident (`#1945`) — base intact, tests deleted → RED, naming each one

Reproduces the original incident: a PR deletes three `#1890`-named anti-raise-attack tests from `check-jscpd.test.ts` without justifying them in the PR body.

**Command:**

```
$ pnpm --filter scripts-ts exec vitest run src/check-guard-test-deletion.test.ts -t "proof 1"
```

**Output (abbreviated to the assertion):**

```
 ✓ src/check-guard-test-deletion.test.ts > #1962 proof 1: deleted check-jscpd tests are caught, naming each one
```

**What this proves:** The guard reads test names from the BASE commit via `git merge-base`, extracts them via AST (not regex), and reports each deleted name in the RED finding. The test asserts:
- `result.findings` contains a `red` finding — the PR is blocked.
- The finding message includes `#1890: the ATTACK is caught — a raised working-tree reference does not loosen the ratchet` — the first deleted test name, proving name-based (not count-based) detection.
- `result.deletedTests.length >= 3` — all three deleted tests are caught, not just one.

## Proof 2: The count trap — delete 3, add 3, count stays same → still RED

**Command:**

```
$ pnpm --filter scripts-ts exec vitest run src/check-guard-test-deletion.test.ts -t "proof 2"
```

```
 ✓ src/check-guard-test-deletion.test.ts > #1962 proof 2: count-trap PR that deletes 3 and adds 3 still goes RED
```

**What this proves:** A PR that replaces three old test names with three new ones keeps the total count unchanged. A count-based guard would pass silently. The AST-based name comparison catches all three deletions (`result.deletedTests.length === 3`) AND records all three additions (`result.addedTests.length === 3`).

## Proof 3a: Stated deletion — PR body names the deleted tests → GREEN

**Command:**

```
$ pnpm --filter scripts-ts exec vitest run src/check-guard-test-deletion.test.ts -t "proof 3a"
```

```
 ✓ src/check-guard-test-deletion.test.ts > #1962 proof 3a: deletion WITH exact naming in PR body passes
```

**What this proves:** When the PR body explicitly names every deleted test (e.g. `"This PR removes the old tests: deleteme one and deleteme two."`), the guard goes GREEN. The escape hatch is explicit and requires every deleted test to be named — not a blanket "removed some tests."

## Proof 3b: Vague PR body — "cleaned up some tests" → RED

**Command:**

```
$ pnpm --filter scripts-ts exec vitest run src/check-guard-test-deletion.test.ts -t "proof 3b"
```

```
 ✓ src/check-guard-test-deletion.test.ts > #1962 proof 3b: vague PR body does not satisfy the check
```

**What this proves:** A PR body that says "Cleaned up some tests and refactored the code." — without naming the actual deleted test names — does NOT satisfy the guard. The check goes RED. This closes the loophole where "I removed tests" with no specifics bypasses the protection.

## Proof 4: Renaming tests without naming the original → RED

**Command:**

```
$ pnpm --filter scripts-ts exec vitest run src/check-guard-test-deletion.test.ts -t "proof 4"
```

```
 ✓ src/check-guard-test-deletion.test.ts > #1962 proof 4: renaming tests without naming original goes RED
```

**What this proves:** A PR that renames `'original test name'` to `'completely different name'` is caught — the old name is gone and the new name doesn't match. Even a PR body saying "Renamed tests for clarity" without naming the original is RED. This prevents the "rename to evade" attack where a test is silently deleted by renaming it.

## Proof 5: Deleting an entire test file → RED even with a vague body

**Command:**

```
$ pnpm --filter scripts-ts exec vitest run src/check-guard-test-deletion.test.ts -t "proof 5"
```

```
 ✓ src/check-guard-test-deletion.test.ts > #1962 proof 5: deleting an entire test file goes RED
```

**What this proves:** When an entire `*.test.ts` file is deleted (not just individual tests within it), every test name that existed in the base file is reported as deleted. The guard uses `git diff --diff-filter=ADMR` to find files present in base but absent in HEAD — `find`-based enumeration would miss a deleted file entirely. Even with a vague PR body ("Refactored and removed old coverage"), the guard goes RED because the deleted test names are not named.

## Proof 6: merge-base resolution failure → RED, fails loud

This test creates a git repo with no `origin/develop` branch and asserts the guard fails loudly with `baseCommit: 'UNRESOLVED'`.

**Command:**

```
$ pnpm --filter scripts-ts exec vitest run src/check-guard-test-deletion.test.ts -t "merge-base"
```

```
 ✓ src/check-guard-test-deletion.test.ts > fails loudly when merge-base cannot be resolved
```

**What this proves:** When `git merge-base origin/develop HEAD` cannot resolve (e.g. because `actions/checkout` used `fetch-depth: 1`), the guard does NOT silently pass or produce empty results. It emits a RED finding naming the cause and the repair (`git fetch origin develop && git merge-base origin/develop HEAD`), and marks `baseCommit` as `UNRESOLVED`. This is the anti-raise-attack guarantee from #1890 — the guard reads from the base, not from its own tree.

## Proof 7: Push event with deletions → RED (no PR body available)

**Command:**

```
$ pnpm --filter scripts-ts exec vitest run src/check-guard-test-deletion.test.ts -t "push event"
```

```
 ✓ src/check-guard-test-deletion.test.ts > push event with deletions goes RED
```

**What this proves:** On a `push` event (no PR body), the guard receives an empty PR body and any deletion is RED. There is no escape hatch on push events — deletions must be caught unconditionally. This enforces that the guard only ever passes on the `pull_request` event where a human-authored PR body can justify the deletion.

---

## AST reader robustness (requirement #3: "use it or remove it")

The guard uses **ts-morph AST** (`import { ts } from 'ts-morph'`) for test name extraction, not regex. The dependency is already declared in `packages/scripts-ts/package.json` and is already used successfully in `apps/front/scripts/guards/check-design-system.mts`. The following tests prove the AST reader correctly handles shapes that break regex readers:

### `test.each` — array form

**Command:**
```
$ pnpm --filter scripts-ts exec vitest run src/check-guard-test-deletion.test.ts -t "test.each with array data"
```
```
 ✓ src/check-guard-test-deletion.test.ts > extractTestNamesFromSource: handles test.each with array data
```

**What this proves:** `test.each(['a', 'b', 'c'])('runs for %s', (val) => {})` — the description `'runs for %s'` follows the `.each()` call result, so a regex hunting for `test(name` cannot see it. The AST reader walks the `CallExpression` whose expression is itself a `CallExpression` (`test.each([...])`) and extracts the first argument of the outer call.

### `test.each` — tagged template form

**Command:**
```
$ pnpm --filter scripts-ts exec vitest run src/check-guard-test-deletion.test.ts -t "test.each tagged"
```
```
 ✓ src/check-guard-test-deletion.test.ts > extractTestNamesFromSource: handles test.each tagged template form
```

**What this proves:** `test.each\`...\\\`('case $#, value', (row) => {})` — the callee of the outer call is a `TaggedTemplateExpression`, not a `CallExpression`. The AST reader handles both `ts.isCallExpression(callee)` and `ts.isTaggedTemplateExpression(callee)` to extract the `.each` property access.

### Interpolated template names

**Command:**
```
$ pnpm --filter scripts-ts exec vitest run src/check-guard-test-deletion.test.ts -t "interpolated"
```
```
 ✓ src/check-guard-test-deletion.test.ts > extractTestNamesFromSource: handles interpolated template names
```

**What this proves:** `test(\`${prefix} does something\`)` — the first argument is a `TemplateExpression`, not a `StringLiteral`. The AST reader joins the literal text portions with a `{…}` placeholder for each interpolation, producing a distinctive, comparable name.

### Comments and strings

**Command:**
```
$ pnpm --filter scripts-ts exec vitest run src/check-guard-test-deletion.test.ts -t "comments"
```
```
 ✓ src/check-guard-test-deletion.test.ts > extractTestNamesFromSource: ignores test name in comments
```

**What this proves:** `// test('commented out')` and `/* ... test('also commented') ... */` inside comments are NOT extracted. The compiler classifies comments as non-code, so no regex-based comment stripping is needed. `result.has('commented out')` is false; `result.has('actual test')` is true.

### Nesting (`describe` with `test` inside)

**Command:**
```
$ pnpm --filter scripts-ts exec vitest run src/check-guard-test-deletion.test.ts -t "nested"
```
```
 ✓ src/check-guard-test-deletion.test.ts > extractTestNamesFromSource: handles nested describe with tests
```

**What this proves:** Nested `describe('outer group', () => { describe('inner group', () => { test('nested test') }) })` — the AST reader traverses the full tree via `node.forEachChild(walk)` and extracts all four names regardless of nesting depth.

### All quote styles

**Command:**
```
$ pnpm --filter scripts-ts exec vitest run src/check-guard-test-deletion.test.ts -t "quote styles"
```
```
 ✓ src/check-guard-test-deletion.test.ts > extractTestNamesFromSource: handles all quote styles
```

**What this proves:** Single quotes (`'`), double quotes (`"`), and backticks (`` ` ``) all produce the same extracted name. No string-delimiter matching is needed — the compiler already classified the token kind.

### Special characters

**Command:**
```
$ pnpm --filter scripts-ts exec vitest run src/check-guard-test-deletion.test.ts -t "special chars"
```
```
 ✓ src/check-guard-test-deletion.test.ts > extractTestNamesFromSource: extracts full test names with special chars
```

**What this proves:** Names like `'handles [brackets] and (parens) and "quotes"'` and `'unicode: café résumé'` are extracted intact. Unicode characters, brackets, parentheses, and embedded quotes do not corrupt extraction.

### Calls without a string name are skipped

**Command:**
```
$ pnpm --filter scripts-ts exec vitest run src/check-guard-test-deletion.test.ts -t "without string name"
```
```
 ✓ src/check-guard-test-deletion.test.ts > extractTestNamesFromSource: skips test calls without string name
```

**What this proves:** `test(() => {})` and `it(123, () => {})` — calls whose first argument is not a string literal or template literal are skipped (returns `null` from `extractCallName`), so they don't pollute the name set or create false-positive "deletions."

---

## `just ci-drift` barrier

The local `just ci-drift` recipe mirrors every command CI runs. The new guard is wired into it:

```
# #1962: guard against deleting tests from guard test files
pnpm --filter scripts-ts exec vitest run src/check-guard-test-deletion.test.ts
node ./packages/scripts-ts/src/check-guard-test-deletion.ts
```

**Command:**
```
$ just ci-drift
```

**Output (abbreviated):**
```
=== [gate] workflow drift guard ===
...
# #1962: guard against deleting tests from guard test files
pnpm --filter scripts-ts exec vitest run src/check-guard-test-deletion.test.ts

 Test Files  1 passed (1)
      Tests  20 passed (20)

node ./packages/scripts-ts/src/check-guard-test-deletion.ts
Guard test deletion guard: PASSED
Base commit: 76afc3be24a4a235531597711facaeffef2dd13c
Head commit: bfbe20574345cab66359f37c17ff69287c553a5a
...
(all other gate tests pass)
```

Exit code 0 — the full barrier passes.

---

## Scope justification (`packages/scripts-ts/src/` only)

The guard's scope is limited to `packages/scripts-ts/src/` via:

```typescript
const TEST_GLOB_ROOT = 'packages/scripts-ts/src';
```

and the `git diff` pathspec:

```typescript
`git diff --name-only --diff-filter=ADMR ${baseCommit} HEAD -- "packages/scripts-ts/src/" | sort`
```

**Justification:**

- `packages/scripts-ts/src/` is the single home of the CI gate guard suites. Every `*.test.ts` file under this directory is executed by `front-ci.yml::gate-selftest` and mirrored by `just ci-drift`. If any of these files loses tests, the CI gate that depends on them is weakened.
- The guard's own test file (`check-guard-test-deletion.test.ts`) lives in this directory. A guard that doesn't watch itself is vulnerable to the "guard that nothing runs" failure mode (#1709 round 6). By watching its own directory, the guard ensures that deleting its own tests is caught by itself.
- Frontend guard tests under `apps/front/scripts/guards/` and `apps/front/src/**/*.test.ts` are out of scope for THIS guard because they are enforced by separate front-ci supply-chain and test jobs that carry their own deletion-detection surfaces (the trans-render render guard pin, the z-index guard, the design-system guard). Widening the scope would duplicate coverage and conflate two independently-gated surfaces.
- The scope is declared as a single constant so a future widening is a one-line, reviewed edit — not an implicit drift.
