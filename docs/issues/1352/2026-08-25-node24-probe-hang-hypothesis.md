# Node 24 probe hang — hypothesis, not a reproduced root cause

Date: 2026-08-25 · Lane `lane/wt-1352` (PR #1409) · Issue #1352 · Node v24.19.0 · Host: Dell OptiPlex 3000, i5-12500T, 61 GiB, Linux

## Status

**HYPOTHESIS, NOT REPRODUCED.** This record states exactly what was measured and what is only believed. The r1 review correctly flagged that the previous wording ("ROOT CAUSE") asserted more than the evidence supports.

## What actually happened (observed, not reproduced)

- 2026-08-25: the runner-interruption probe flow (`apps/front/scripts/check-design-system.test.mjs`, tests `runner interruption probe leaves an active owned fixture` / `the real node:test runner cleans its owned root when interrupted`) held a lane for **~26 minutes** before being killed manually. Captain-reported in issue #1352.
- 2026-08-23: the same hang was observed once before, per the lane brief. **No raw log survives** for that occurrence; it is recorded here on the brief's authority only.
- The hang was never re-triggered deterministically:
  - Manual replay of the whole chain (`.dump/e2-manual-repro.mjs` pattern: spawn detached wrapper → wait handshake → SIGINT → measure exit): the chain exited **25 ms after SIGINT** (runs of 2026-08-25, local logs `probe-run1..3.log`, not committed; the lane worktree `.dump/` is gitignored).
  - A full test-file run under a pty completed in ~5 s.
  - Three timed full-file runs: **14342 ms / 5313 ms / 5318 ms**, all green (logs `e1-real-test-run1..3.log`, same gitignored caveat).
- Against the pre-#1352 code, replaying the never-ending-child fixture under the old unbounded exit-wait produced the failure shape the budget now prevents: the suite sat until an external cap killed it at **45 s rc=124** with `'Promise resolution is still pending but the event loop has already resolved'` (`e3-red2-old-wiring-hang.log`). This proves the OLD wiring waits unbounded on such a child; it does NOT prove what made the real probe child never exit on those two days.

## The hypothesis (plausible, unproven)

The probe chain is three levels deep:

```
test-file process → spawned runner-probe wrapper
(check-design-system-runner-probe.mjs, detached, own process group)
  → its own node --test grand-child running the live probe test
```

On SIGINT the wrapper runs async fixture cleanup (see `registerFixtureSignalHandlers`) while the grand-child node:test runner performs its own interruption teardown. IF that combined race never completes, the wrapper keeps waiting on its grand-child and the old code kept waiting on the wrapper with no ceiling anywhere — which would produce exactly the observed ~26-minute holds. No experiment here has pinned the race as the cause.

## Related upstream work (titles/states verified via GitHub API on 2026-08-25)

NONE of these is confirmed to describe this exact hang; they are context, not citations of a known fix:

- nodejs/node#62037 — `test_runner: use default signal exit codes when interrupted` (closed)
- nodejs/node#57394 — `test_runner: ensure proper teardown when tests run without isolation` (open)
- nodejs/node#62056 — `test_runner: fix run() none-isolation teardown hang` (closed)

## Why no code fix was attempted

If the hypothesis is right, the hang lives inside node:test's own teardown — not in code this repo controls — so no repo-side fix can be applied AND proven without a deterministic reproduction. None exists. The standing guard is therefore causal-proof-independent:

- The hard budget (`RUNNER_PROBE_BUDGET_MS`, default 120 000 ms ≈ 8× headroom over the slowest measured full-file run) turns any recurrence into a loud failure within two minutes, naming the probe, the budget and the last output line, with the whole tree killed (no orphan).
- Proofs co-located in the test file pin both the generic helper wiring and the REAL budget acquisition path (shared seam `realProbeBudget()`), including adversarial RED evidence against seam-bypassing mutants.
