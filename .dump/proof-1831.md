# #1831 — witness file fidelity

The fixture `packages/scripts-ts/src/fixtures/first-deploy-runbook-at-490f6d03.md`
is a witness of the real runbook at commit `490f6d03`. Nothing guaranteed it
stayed faithful.

## Step 1: GREEN before (witness intact)

```
$ pnpm --filter scripts-ts exec vitest run src/witness-fidelity.test.ts --reporter=verbose
 ✓ src/witness-fidelity.test.ts > #1831 — witness file fidelity guard > witness file equals `git show ${COMMIT}:${RELATIVE_PATH}` exactly — no drift 7ms
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

## Step 2: BREAK — drift the witness file

```bash
echo "DRIFTED LINE" >> packages/scripts-ts/src/fixtures/first-deploy-runbook-at-490f6d03.md
```

## Step 3: RED — witness drifted

```
$ pnpm --filter scripts-ts exec vitest run src/witness-fidelity.test.ts --reporter=verbose
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/witness-fidelity.test.ts > #1831 — witness file fidelity guard > witness file equals `git show ${COMMIT}:${RELATIVE_PATH}` exactly — no drift
- Expected:
+ Received:
 Test Files  1 failed (1)
      Tests  1 failed (1)
```

The test names the exact assertion (`witness file equals git show ... exactly — no drift`)
and the file under test.

## Step 4: REPAIR — restore the witness

```bash
cp /tmp/witness-backup.md packages/scripts-ts/src/fixtures/first-deploy-runbook-at-490f6d03.md
```

## Step 5: GREEN after repair

```
$ pnpm --filter scripts-ts exec vitest run src/witness-fidelity.test.ts --reporter=verbose
 ✓ src/witness-fidelity.test.ts > #1831 — witness file fidelity guard > witness file equals `git show ${COMMIT}:${RELATIVE_PATH}` exactly — no drift 7ms
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

## Files changed

- `packages/scripts-ts/src/witness-fidelity.test.ts` (new)
  — pins the witness to `git show 490f6d03:docs/deployment/first-deploy-runbook.md`.
