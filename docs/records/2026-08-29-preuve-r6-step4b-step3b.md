# Proof r6 — Step 4b fix and Step 3b addition

**Issue :** #1457 / #1783 (PR #1806)
**Ronde :** r6
**Branche :** `lane/wt-1783`
**Worktree :** `wt-1774`
**Proof file:** `apps/front/tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts`
**Replaces:** `docs/records/2026-08-29-preuve-r4-two-step-pipeline.md`

## What the round did

### Problem identified in round r5

Round r5 added a **Step 4b** (sanity check) to make a line
of deferred bracket notation pass `isHandlerDeferred`. But the line chosen was:

```js
const knownBracketDeferredLine = `setImmediate(() => { process['on']('SIGINT', () => {}); });`;
```

This line starts with `setImmediate(`, **not** with `process['on'](`. The
`isHandlerDeferred` function only looks at the line prefix, so it
correctly classified this line as deferred (true) — even if the bug
Mutation F (accepting bracket notation as non-deferred) was present.

**Result:** Step 4b never threw `MEASUREMENT IMPOSSIBLE` for Mutation F.
The runner had no error signal and classified the file as OK (CI green).
Mutation F survived the green CI.

The r4 document (`2026-08-29-preuve-r4-two-step-pipeline.md`) falsely claimed
that Mutation F is detected by Step 4b — this claim is **false**.

### Problem identified in round r5 — Mutation G

An additional mutation, **Mutation G** (`isHandlerDeferred` always returns `true`),
was not detected either. Without Step 3b:

- **Test 1** (the main test): `isHandlerDeferred(handlerLine)` returns `true`
  (Mutation G), so `handlerIsDeferred = true`, `bugPresent = true` →
  `expect(bugPresent).toBe(true)` **PASSES** (unexpected passage).
- **Test 2** (pipeline) fails on Step 5: `expect(isHandlerDeferred(deferredLine)).toBe(false)`
  — but `isHandlerDeferred` always returns `true`, so the `false` expectation FAILS
  on an **AssertionError**.

The runner sees "1 failed, 1 passed" with an AssertionError on Test 2. Without
`MEASUREMENT IMPOSSIBLE` in the output, it classifies the file as "expected failure"
(CI green) — Mutation G survived.

### Fix r6

#### Step 4b corrected

`knownBracketDeferredLine` is changed from:

```js
// AVANT (r5 — ne commence pas par process['on']()
const knownBracketDeferredLine = `setImmediate(() => { process['on']('SIGINT', () => {}); });`;
```

to:

```js
// AFTER (r6 — does start with process['on'()
const knownBracketDeferredLine = `process['on']('SIGINT', () => {});`;
```

This line starts with `process['on'](` — the direct bracket form. Unless
it's the `process.on(` form, it does NOT start with `process.on(`, so
`isHandlerDeferred` **must** classify it as deferred (true). If Mutation F
weakens `isHandlerDeferred` to accept `process['on'](` as non-deferred,
the function returns `false`, the sanity check throws `MEASUREMENT IMPOSSIBLE`, and the
runner classes it as **CORRUPT PROOF** (CI red).

#### Step 3b added

A new sanity check before Step 4b:

```js
const knownDirectLine = `process.on('SIGINT', () => {});`;
if (isHandlerDeferred(knownDirectLine)) {
    throw new Error(`MEASUREMENT IMPOSSIBLE — isHandlerDeferred misclassified a known-direct handler line as deferred...`);
}
```

On correct code, `isHandlerDeferred` returns `false` for a direct line.
Mutation G (`return true`) returns `true` → throws `MEASUREMENT IMPOSSIBLE` → **CORRUPT PROOF**.

### Why two sanity checks (Step 3b and Step 4) are necessary

- **Step 3b** catches `isHandlerDeferred` = always `true` (Mutation G): the function
  classifies a direct as deferred.
- **Step 4** catches `isHandlerDeferred` = always `false` (Mutation E) or inverted
  (Mutation D): the function classifies a deferred as non-deferred.
- **Step 4b** catches Mutation F: the function accepts bracket notation as non-deferred.

Each of these three assertions is the opposite of the other — a single sanity check
cannot catch all three mutations because they produce contradictory effects on the same input.

## Defensive mutations — summary table

| # | Mutation | Axis | Detected by | Result |
|---|---------|-----|-------------|----------|
| C | `findHandlerLine` regressed to dot-only regex (`/process\.on/…`) | Syntax (location) | Step 3 THROW: `findHandlerLine` throws `MEASUREMENT IMPOSSIBLE` on `process['on']` → **CORRUPT PROOF** | ✓ CI red |
| D | `isHandlerDeferred` inverted (`return line.trim().startsWith('process.on(')`) | Temporality (classification) | Step 4 sanity THROW: `isHandlerDeferred(knownDeferredLine)` → `false` → throws `MEASUREMENT IMPOSSIBLE` → **CORRUPT PROOF** | ✓ CI red |
| E | `isHandlerDeferred` always false (`return false`) | Temporality (classification) | Step 4 sanity THROW: `isHandlerDeferred(knownDeferredLine)` → `false` → throws `MEASUREMENT IMPOSSIBLE` → **CORRUPT PROOF** | ✓ CI red |
| F | `isHandlerDeferred` accepts brackets as non-deferred (`!(startsWith('process.on(') \|\| startsWith("process['on']"))`) | Syntax + temporality | Step 4b sanity THROW: `isHandlerDeferred(knownBracketDeferredLine)` → `false` → throws `MESURE IMPOSSIBLE` → **CORRUPT PROOF** | ✓ CI red (r6) |
| G | `isHandlerDeferred` always true (`return true`) | Temporality (classification) | Step 3b sanity THROW: `isHandlerDeferred(knownDirectLine)` → `true` → throws `MEASUREMENT IMPOSSIBLE` → **CORRUPT PROOF** | ✓ CI red (r6) |

### What the r4 document falsely claimed

The r4 document claimed:

> - [x] Mutation F → CORRUPT PROOF (r5: Step 4b throws MEASUREMENT IMPOSSIBLE on deferred bracket line)

This assertion is **false**. Round r5 did not verify that `knownBracketDeferredLine`
actually started with `process['on'](`. The chosen line started with `setImmediate(`,
so `isHandlerDeferred` correctly classified it as deferred even with Mutation F
applied. No `MEASUREMENT IMPOSSIBLE` was thrown. Mutation F survived.

The r4 document also omitted Mutation G (`return true`), which survived for
the same reason: the runner misclassified an AssertionError as "expected failure"
without the absence of `MEASUREMENT IMPOSSIBLE` in the output.

## Two-step detection process

1. **LOCATE** — `findHandlerLine` locates the handler line via regex
   (handles `process.on(`, `process['on']`, and `process["on"]`). Regression to dot-only → `MEASUREMENT IMPOSSIBLE`.
2. **CLASSIFY** — `isHandlerDeferred` classifies the line as direct
   (`process.on(` → `false`) or deferred (everything else → `true`). Regression → `MEASUREMENT IMPOSSIBLE`
   via Step 3b, 4, or 4b depending on the form of the regression.

## Verifications

- [x] Both tests fail on correct code (kept-red, expected state)
- [x] Typecheck passes (exit code 0)
- [x] Mutation C → CORRUPT PROOF (MEASUREMENT IMPOSSIBLE from findHandlerLine)
- [x] Mutation D → CORRUPT PROOF (MEASUREMENT IMPOSSIBLE from Step 4 sanity)
- [x] Mutation E → CORRUPT PROOF (MEASUREMENT IMPOSSIBLE from Step 4 sanity)
- [x] Mutation F → CORRUPT PROOF (MEASUREMENT IMPOSSIBLE from Step 4b sanity) — **fixed in r6**
- [x] Mutation G → CORRUPT PROOF (MEASUREMENT IMPOSSIBLE from Step 3b sanity) — **new in r6**

## Modified files

- `apps/front/tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts`
  - Step 4b corrected: `knownBracketDeferredLine` changed from `setImmediate(() => { process['on'](...) })` to direct `process['on'](...)`
  - Step 3b added: sanity check on a direct line `process.on('SIGINT', () => {})`
  - Header "Enhancement (r5/r6)" updated
  - Mutations F and G documented in the "Mutations to introduce the red" section
  - Step 5 comments updated to mention Mutation G
- `docs/records/2026-08-29-preuve-r6-step4b-step3b.md` (this file — replaces r4)
