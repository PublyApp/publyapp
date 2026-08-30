# #1845 — proximity guard for cause/action order in check-ci-drift findings

The order contract (cause before action) was pinned, but proximity was not.
A message could insert multi-paragraph filler between cause and action and
the contract stayed satisfied while the meaning was lost.

## Step 1: GREEN before (all proximity tests pass)

```
$ pnpm --filter scripts-ts exec vitest run src/check-ci-drift.test.ts --reporter=verbose
 ✓ src/check-ci-drift.test.ts > proximity contract (#1845): NEW STEP cause and action are within proximity limit 11ms
 ✓ src/check-ci-drift.test.ts > proximity contract (#1845): CHANGED cause and action are within proximity limit 2ms
 ✓ src/check-ci-drift.test.ts > proximity contract (#1845): STALE cause and action are within proximity limit 2ms
 ✓ src/check-ci-drift.test.ts > proximity contract (#1845): a synthetic finding with filler between cause and action FAILS the proximity check 1ms
 ✓ src/check-ci-drift.test.ts > proximity contract (#1845): a legitimate long reformulation STAYS within the proximity limit 0ms
 Test Files  1 passed (1)
      Tests  71 passed (71)
```

## Step 2: BREAK — loosen PROXIMITY_LIMIT from 120 to 500

```bash
sed -i 's/const PROXIMITY_LIMIT = 120;/const PROXIMITY_LIMIT = 500;/' \
  packages/scripts-ts/src/check-ci-drift.test.ts
```

## Step 3: RED — contract too loose

```
$ pnpm --filter scripts-ts exec vitest run src/check-ci-drift.test.ts --reporter=verbose
 × src/check-ci-drift.test.ts > proximity contract (#1845): a synthetic finding with filler between cause and action FAILS the proximity check 3ms
   → The proximity contract must REJECT a finding with multi-paragraph filler between cause and action. If this assertion passes, the gap is within PROXIMITY_LIMIT and the contract is too loose.
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/check-ci-drift.test.ts > proximity contract (#1845): a synthetic finding with filler between cause and action FAILS the proximity check
AssertionError: The proximity contract must REJECT a finding with multi-paragraph filler between cause and action. If this assertion passes, the gap is within PROXIMITY_LIMIT and the contract is too loose.
 Test Files  1 failed (1)
      Tests  1 failed | 70 passed (71)
```

The RED proof fails with a message that names the exact problem: the
proximity contract is too loose.

## Step 4: REPAIR — restore PROXIMITY_LIMIT to 120

```bash
cp /tmp/ccd-backup.ts packages/scripts-ts/src/check-ci-drift.test.ts
```

## Step 5: GREEN after repair

```
$ pnpm --filter scripts-ts exec vitest run src/check-ci-drift.test.ts --reporter=verbose
 Test Files  1 passed (1)
      Tests  71 passed (71)
```

## Files changed

- `packages/scripts-ts/src/check-ci-drift.test.ts`
  — added 6 proximity tests with PROXIMITY_LIMIT = 120 chars.
