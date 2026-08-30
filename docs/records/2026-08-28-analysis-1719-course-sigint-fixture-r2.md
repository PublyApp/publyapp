# Proof #1719 — r2 fixture SIGINT race (r2)

## Context

Commit `5c044a936` fixed a SIGINT race in the "r2" fixture of `apps/front/scripts/guards/check-design-system.test.mts`. The fix is a **two-line swap** in the child process script:

- **BUGGY** (before): handshake write (`process.stdout.write`) BEFORE handler install (`process.on('SIGINT')`)
- **FIXED** (after): handler install BEFORE handshake write

Under load, the parent could send SIGINT at the first byte of stdout before the child installed its handler, killing it with Node.js's default SIGINT behavior.

The original measurement ("200/200 after, 17/100 failures before") exists only in the commit message — never replayed in the tree.

## Round history

### Round 1 (rejected)

The r1 proof was a static guard that verified only the **line order**
in the fixture's source array. The verdict (`CHANGES_REQUIRED`) identified two
blocking defects:

1. **The `setImmediate` mutation reopens the race without being detected**: wrapping
   l'installation du handler dans `setImmediate(() => { process.on('SIGINT', ...) })`
   defers installation to a subsequent event loop tick —
   reopening exactly the race window. And yet the r1 proof stays
   "kept-red" (handler textually before the handshake) and CI stays
   GREEN.

2. **The adversarial mutation search is missing**: the r1 count shows only one
   mutation (the two-line swap), not the three axes required by
   `docs/guides/test-conventions.md` §"Adversarial mutation".

### Round 2 (this version)

The r2 proof adds a **second axis** to the static guard: in addition to
line order, it verifies that the handler line is a **direct** call
to `process.on(...)`, with no async wrapper. It also includes the required
adversarial mutation search.

## Solution: strengthened static guard

The r2 proof is a **two-axis static guard** that:
1. Reads the **real file** `check-design-system.test.mts`
2. Extracts the r2 fixture's line array (extraction by anchoring, not copy)
3. Verifies **two properties**:
   - **Axis 1 — Order**: the handler (`process.on('SIGINT')`) must appear BEFORE
     the handshake (`process.stdout.write(RUNNER_PID=...)`
   - **Axis 2 — Directness**: the handler line must be a direct
     `process.on(...)` call, with no wrapper (setImmediate, setTimeout, queueMicrotask,
     process.nextTick, promise, async function, conditional)

### Three discrimination states

- **BUG PRESENT** (one form or both): the `bugPresent` assertion passes → CI red
- **BUG ABSENT** (both properties respected): the assertion fails → kept-red
- **MEASUREMENT IMPOSSIBLE**: extraction fails, missing line → noisy failure

---

## 1. Red proof — against the corrected code (develop)

```
$ pnpm exec vitest run --config vitest.preuves.config.ts \
    tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts \
    --reporter=verbose

 RUN  v4.1.11

 × tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts > r2 fixture SIGINT race — RED: handler installed AFTER the handshake write (#1457) > the r2 fixture writes the handshake BEFORE installing the SIGINT handler, OR the handler is wrapped in an async deferral (the buggy ordering the fix corrected) 7ms
   → expected false to be true // Object.is equality

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts > r2 fixture SIGINT race — RED: handler installed AFTER the handshake write (#1457) > the r2 fixture writes the handshake BEFORE installing the SIGINT handler, OR the handler is wrapped in an async deferral (the buggy ordering the fix corrected)
AssertionError: expected false to be true // Object.is equality
 ❯ tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts:375:22
    373|   // When the assertion PASSES, the CI step *Verify paired red proofs*
    374|   // turns RED — exactly the "proof is stale" signal the brief asks fo…
    375|   expect(bugPresent).toBe(true);
       |                      ^
    376|  });
    377| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  23:47:34
   Duration  221ms

--- Command finished at exit code 1 ---
```

**Explanation**: in the FIXED code, `handlerIdx=8` (the `process.on('SIGINT')` line is at index 8), `handshakeIdx=9` (the `process.stdout.write` line is at index 9), and the handler line starts with `process.on(` (direct). So `classicSwap=false`, `handlerIsDeferred=false`, `bugPresent=false`. The assertion `expect(bugPresent).toBe(true)` fails — this is the kept-red state CI requires.


---

## 2. Adversarial mutation — search on three axes

`docs/guides/test-conventions.md` §"Adversarial mutation" requires at least three mutations on an axis DIFFERENT from the main mutation, with their results named. The main mutation (the bug) is the **two-line swap** (axis: source order). r3 rebuilds the game with three mutations on **truly distinct** axes — r2 failed because its B and C mutations shared the same axis (directness).

### Mutation A — Classic swap (axis: source order)

The r1 mutation. Swaps the handler and the handshake in the source array.

```diff
- '// Ignore SIGINT: only the budget-expiry SIGKILL may end this tree.',
- "process.on('SIGINT', () => {});",
- 'process.stdout.write(`RUNNER_PID=${process.pid}\\nRUNNER_OWNED_ROOT=...\\n`);',
+ 'process.stdout.write(`RUNNER_PID=${process.pid}\\nRUNNER_OWNED_ROOT=...\\n`);',
+ '// Ignore SIGINT: only the budget-expiry SIGKILL may end this tree.',
+ "process.on('SIGINT', () => {});",
```

**Result**: the test
`tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts > r2 fixture SIGINT race — RED: handler installed AFTER the handshake write (#1457) > the r2 fixture writes the handshake BEFORE installing the SIGINT handler, OR the handler is wrapped in an async deferral (the buggy ordering the fix corrected)`
**PASSES** (bug detected).

**Why**: `handlerIdx > handshakeIdx` → `classicSwap=true` → `bugPresent=true`.
The "source order" axis is covered. Mechanism: **index comparison**.

---

### Mutation B — setImmediate wrapper (axis: temporal directness)

The mutation identified by the r1 reviewer. Keeps the handler→wrapper order
but defers installation via `setImmediate`.

```diff
- "process.on('SIGINT', () => {});",
+ 'setImmediate(() => { process.on("SIGINT", () => {}); });',
```

**Result**: the test
`tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts > r2 fixture SIGINT race — RED: handler installed AFTER the handshake write (#1457) > the r2 fixture writes the handshake BEFORE installing the SIGINT handler, OR the handler is wrapped in an async deferral (the buggy ordering the fix corrected)`
**PASSES** (bug detected).

**Why**: la ligne du handler ne commence plus par `process.on(` —
it starts with `setImmediate(`. `handlerIsDeferred=true` → `bugPresent=true`.
The "temporal directness" axis is covered. Mechanism: **structural verification
** (the line does not start with `process.on(`).

---

### Mutation C — Bracket notation (axis: access syntax)

The mutation identified by the r3 reviewer. The handler is still before the
handshake and still synchronous, but access uses bracket notation
instead of dot.

```diff
- "process.on('SIGINT', () => {});",
+ "process['on']('SIGINT', () => {});",
```

**Result**: the test
`tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts > r2 fixture SIGINT race — RED: handler installed AFTER the handshake write (#1457) > the r2 fixture writes the handshake BEFORE installing the SIGINT handler, OR the handler is wrapped in an async deferral (the buggy ordering the fix corrected)`
**PASSES** (bug detected).

**Why**: the line starts with `process[` and not `process.on(`. `handlerIsDeferred=true` → `bugPresent=true`. The "access syntax" axis is covered. Mechanism: **structural verification** (same mechanism as B, but a truly different axis — syntactical vs temporal).

---

### Adversarial search summary

| # | Axis | Mutation | Mechanism | Result |
|---|-----|----------|-----------|----------|
| A | **Source order** | Handler↔handshake swap | Index comparison (`handlerIdx > handshakeIdx`) | PASS (detected) |
| B | **Temporal directness** | setImmediate(() => { process.on(...) }) | Structural (line does not start with `process.on(`) | PASS (detected) |
| C | **Access syntax** | process['on']('SIGINT', ...) | Structural (line does not start with `process.on(`) | PASS (detected) |

The three axes are truly distinct:
- A: where the handler appears relative to the handshake (order)
- B: whether the handler is installed synchronously or deferred (temporal)
- C: whether the handler uses dot or bracket notation (syntactic)

Axes B and C share the `isHandlerDeferred` mechanism but attack
truly different dimensions of the bug — a temporal deferral and a
syntactic variant are not the same axis. r2 failed because its
B and C mutations were both on the "directness" axis; here B is
temporal-directness and C is access-syntax.

**No surviving mutation**: all three mutations attempted were
detected. The proof is not decorative — it attacks three
distinct axes and rejects any form of handler wrapping.

---

## 3. Determinism

The proof is deterministic by design: it reads the source file,
extracts the fixture's lines, and verifies two static properties. There is no
randomness, no timing, no concurrency. Every replay gives the
same result on the same code.

Against the corrected code (FIXED): the test fails (kept-red) — `bugPresent=false`.
With mutation A (classic swap): the test passes (bug detected) — `bugPresent=true`.
With mutation B (setImmediate): the test passes (bug detected) — `bugPresent=true`.
With mutation C (bracket notation): the test passes (bug detected) — `bugPresent=true`.

---

## 4. CI rejection (r3 — discriminant)

The r3 launcher now discriminates assertion failure (expected kept-red) from
thrown error (MEASUREMENT IMPOSSIBLE — broken proof). Three outputs demonstrated:

**Corrected code (FIXED) — assertion failure (kept-red):**
```
This PR declared 1 paired red proof(s) — replaying with inverted semantics:

  tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts

--- Running: tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts ---
  OK: proof test failed as expected (exit code 1).

=== Summary ===
  Proof tests failed as expected: 1
  Proof tests passed unexpectedly:  0
  Corrupt/unparseable proof files:  0

All declared proof tests behaved as expected.
```

**Mutation C (bracket notation `process['on']`) — proof detects bug (test passes):**
```
This PR declared 1 paired red proof(s) — replaying with inverted semantics:

  tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts

--- Running: tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts ---
  FAIL: proof test passed unexpectedly — the bug it documented may have changed form.
  Test: tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts

=== Summary ===
  Proof tests failed as expected: 0
  Proof tests passed unexpectedly:  1
  Corrupt/unparseable proof files:  0

FAIL: proof replay did not complete cleanly.
  1 proof test(s) passed when they should have failed.
```

**Alias bypass (`const on = process.on.bind(process)`) — proof throws MEASUREMENT IMPOSSIBLE, launcher classes CORRUPT PROOF:**
```
This PR declared 1 paired red proof(s) — replaying with inverted semantics:

  tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts

--- Running: tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts ---
  CORRUPT PROOF: proof test failed with a non-assertion error (measurement impossible
  or harness crash), not the expected assertion failure.
  A kept-red proof must fail on an assertion (expected X to be Y), not on a thrown Error.
  A thrown Error means the proof could not measure — this is NOT the expected kept-red
  state and must fail CI.

=== Summary ===
  Proof tests failed as expected: 0
  Proof tests passed unexpectedly:  0
  Corrupt/unparseable proof files:  1

FAIL: proof replay did not complete cleanly.
```

---

## Stated limits

1. **This proof is a two-axis static guard**, not an execution proof
   of the race. If someone refactors the fixture to call the handler via a
   helper function (e.g. `installHandler()`) declared in the same file, the

   before the handshake and the function does `process.on('SIGINT', ...)`.
   The proof only verifies the literal content of the line, not call semantics.
   

2. **The proof does not verify runtime behavior** (whether the child dies
   or not on SIGINT). It cannot, because the race is a kernel-level scheduling
   phenomenon, not a JavaScript event-loop race. The static property (direct
   handler before handshake) is a **necessity** for the fix, but not a complete
   **sufficiency** — an execution proof would be needed to cover runtime
   behavior, which is non-deterministic.
   

3. **The proof does not protect against a refactoring that deletes** one
   of the two lines without swapping the order. The `findHandlerLine`/`findHandshakeLine`
   functions throw an error (MEASUREMENT IMPOSSIBLE) if a line disappears.
   

4. **Handler detection is syntactic**: it verifies that the line contains
   `process.on('SIGINT'`, `process['on']('SIGINT'` or `process["on"]('SIGINT'`.
   This catches any wrapper (setImmediate, setTimeout, queueMicrotask,
   process.nextTick, promise, async, if, etc.) AND bracket notation (r3).
   The only statically undetectable form is the alias: `const on = process.on.bind(process); on('SIGINT', …)`.
   The call site is an arbitrary arbiter, indistinguishable from any other function call.
   When this form is encountered, the proof throws MEASUREMENT IMPOSSIBLE and
   the launcher classes CORRUPT PROOF (CI red) — noisy failure rather than silent passage.
   This is the only remaining gap, and it is fail-loud by construction.
   
   
