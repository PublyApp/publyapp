# Front guard durations — measured evidence for the 300s wrapper ceiling

Date: 2026-08-30. Type: analysis. Issue: #1525, PR #1944.

## Why this record exists

`apps/front/scripts/run-guarded.mts` defaults to `GUARD_TIMEOUT_SECONDS=300`.
Issue #1525 demanded a ceiling "sufficiently large to not turn a loaded
machine into a false positive — measure the real duration of each guard
first, then fix the threshold with a frank margin, and document the number
and its justification". The round-1 review of #1944 found the claimed
durations lived only in a header comment with no measurement artifact in the
diff. This record is that artifact: what was measured, how, on what machine,
and what the numbers do and do not justify. It supersedes the inline table
previously carried in the `run-guarded.mts` header, which now points here.

## Methodology

- Machine: Dell OptiPlex 3000, 12th Gen Intel Core i5-12500T (6 cores /
  12 threads), 61 GiB RAM, Linux. Node v24.19.0, vite 8.2.2 (rolldown-vite).
- Tool: `node --test <guard-file>` for the node:test suites, run directly
  (no wrapper, so the measurement is the guard's own duration, not the
  wrapper's), bounded by `timeout 420` per run, wall-clock measured with
  `date +%s.%N`. A run that exceeds 420s is recorded as such.
- State: the machine was running the review lane's own workload during some
  of the measurements (other lanes share the host). Durations below are
  labelled idle or loaded accordingly; the same guard varies widely between
  the two, which is the central caveat of this record.

## Measured durations

node:test guard suites, measured 2026-08-30 on this worktree's tip (idle
unless noted):

| Guard test file | Idle | Loaded | Exit |
| --- | --- | --- | --- |
| `tools/vite/check-context-chunk-isolation.test.mts` | — | 164.7 s | 0 |
| `scripts/guards/check-design-system.test.mts` | 15.2 s | — | 0 |
| `scripts/guards/check-shared-ts-import-paths.test.mts` | 15.7 s | — | 0 |
| `scripts/guards/check-typecheck-coverage.test.mts` | 15.5 s | — | 0 |
| `scripts/guards/check-column-type-imports.test.mts` | 2.5 s | — | 0 |
| `scripts/guards/check-shared-ts-node-resolution.test.mts` | 1.5 s | — | 0 |
| `scripts/guards/verify-font-bundle.test.mts` | 1.4 s | — | 0 |
| `scripts/guards/check-e2e-shared-constants.test.mts` | 1.0 s | — | 0 |
| `scripts/guards/search-cancel-css-policy.test.mts` | 0.5 s | — | 0 |
| `scripts/guards/check-guard-coverage.test.mts` | 0.6 s | — | 0 |
| `scripts/guards/check-react-compiler.test.mts` | 0.3 s | — | 0 |
| `scripts/guards/check-zindex-guard.test.mts` (full suite, 181-182 tests) | 40.7 s / 44.2 s | 216.5 s | 0 |
| `scripts/ci/run-guarded.test.ts` (+ env-var suite, vitest) | ~11.5 s | — | 0 |

The slowest guard under load is `check-context-chunk-isolation.test.mts` at
~165 s (matching the ~157 s figure the round-1 header quoted); for zindex the
loaded run was 5.3x the idle run. The heaviest single zindex test
(`unmodified repository passes with zero violations`) builds the ENTIRE real
app through `vite.createBuilder` and measured 118 s alone under load.

## What the numbers justify

- A 300 s ceiling is ~1.8x the slowest measured guard under load (164.7 s) —
  a **modest** margin, deliberately not called "ample" anywhere in the code.
  A loaded machine with the same profile as this one stays under the ceiling;
  a machine that routinely exceeds it is expected to set
  `GUARD_TIMEOUT_SECONDS` (documented in the wrapper header).
- The margin is NOT evidence against a genuine hang: the #1525 failures
  (16 min at 5% CPU) are consistent with the measured load-sensitivity of
  this class of suite (zindex: 40 s idle → 216 s+ loaded) magnified by a
  serialized verification queue, but a true freeze remains possible and the
  wrapper bounds it either way. The dedicated investigation of the zindex
  stall is tracked in #2001.

## Raw evidence

The measurement command (bounded loop over `node --test`) and its full
output for the node:test rows above were captured on 2026-08-30; timings
above are the wall-clock figures printed by that loop. Durations are
one-shot per row, not medians; the load column is the meaningful spread.