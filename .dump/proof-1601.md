# #1601 — no-known-value-widening: five visitors, no fixtures

The rule `no-known-value-widening` reports known-evidence flows into widening
targets from eight AST visitors. Before this change, only `VariableDeclarator`
and `TSAsExpression`/`TSTypeAssertion` had test fixtures. Five visitors were
untested escape hatches:

1. `PropertyDefinition`
2. `AccessorProperty`
3. `AssignmentExpression` (direct reassignment)
4. `ReturnStatement`
5. `ArrowFunctionExpression` (expression body)

## Step 1: GREEN before (all 31 tests pass)

```
$ pnpm --filter lint-ts exec vitest run src/anti-slop/rules/no-known-value-widening.test.ts --reporter=verbose
 Test Files  1 passed (1)
      Tests  31 passed (31)
```

## Step 2: BREAK — delete the `PropertyDefinition` visitor

```bash
sed -i '247,254d' packages/lint-ts/src/anti-slop/rules/no-known-value-widening.ts
```

## Step 3: RED — mutation + new fixtures

```
$ pnpm --filter lint-ts exec vitest run src/anti-slop/rules/no-known-value-widening.test.ts --reporter=verbose
 × src/anti-slop/rules/no-known-value-widening.test.ts > anti-slop/no-known-value-widening (#1601 untested-visitor escape hatches) > no-known-value-widening > invalid > class C { field: Record<string, unknown> = { key: "known" } }
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/anti-slop/rules/no-known-value-widening.test.ts > anti-slop/no-known-value-widening (#1601 untested-visitor escape hatches) > no-known-value-widening > invalid > class C { field: Record<string, unknown> = { key: "known" } }
 Test Files  1 failed (1)
      Tests  1 failed | 30 passed (31)
```

The test names the exact fixture (`class C { field: Record<string, unknown> = { key: "known" } }`)
and the visitor path (`PropertyDefinition`) that was dropped.

## Step 4: REPAIR — restore the visitor

```bash
cp /tmp/nkw-backup.ts packages/lint-ts/src/anti-slop/rules/no-known-value-widening.ts
```

## Step 5: GREEN after repair

```
$ pnpm --filter lint-ts exec vitest run src/anti-slop/rules/no-known-value-widening.test.ts --reporter=verbose
 Test Files  1 passed (1)
      Tests  31 passed (31)
```

## Files changed

- `packages/lint-ts/src/anti-slop/rules/no-known-value-widening.test.ts`
  — added 9 fixtures covering 5 previously-untested visitor paths.
