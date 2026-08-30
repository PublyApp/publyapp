# 2026-08-30 — analysis: icon visibility guard, the indeterminable case (#1899)

## Summary

PR on `lane/wt-1899` fixes issue #1899, opened by the adversarial re-read of
PR #1842 (issue #1799). The icon visibility guard in
`apps/front/src/components/table/data-table-icon-visibility-guard.ts`
measures — but it had only two exits (visible / not visible). When it could
NOT analyze the style (node detached from the document, or a reader that
returned the engine's unresolved marker) it fell through to `null`, i.e.
"visible". House rule: an unanalyzable input produces a loud failure naming
the cause and the expected action, never a plausible default. This record
documents the two empirical measurements that shaped the fix, the
implementation, and the evidence lanes.

## The defect

```
const computed = readComputed(iconElement);
if (computed.visibility === 'hidden') { ... }
if (computed.display === 'none') { ... }
if (parsedOpacity === 0) { ... }
return null;   // "visible" — including when the reading is not a measurement
```

A guard that answers "all fine" when it cannot see is worse than no guard:
the suite trusts a green verdict it never earned.

## Two empirical measurements (the issue forbids reasoning from the old comments)

The pre-#1899 file comments claimed "jsdom returns `''` for every
`getComputedStyle` property". Measured on jsdom 30.0.1 (this suite's
version), that is false:

| input (jsdom 30.0.1)            | visibility | display | opacity |
| --- | --- | --- | --- |
| connected, no style             | `visible` | `inline` | `1` |
| connected, inline hide          | `hidden`  | `inline` | `0` |
| **detached**, no style          | `visible` | `inline` | `1` |
| **detached**, inline hide       | `hidden`  | `inline` | `1` |

jsdom resolves plausible defaults for a detached node and reads inline
styles there; it never returns `''` for these three properties.

Measured in real Chromium (the e2e lane's own engine, probed before writing
the test):

| input (Chromium)      | visibility | display | opacity | isConnected |
| --- | --- | --- | --- | --- |
| **detached** node     | `''` | `''` | `''` | `false` |
| connected, no style   | `visible` | `inline` | `1` | `true` |
| connected, inline hide| `hidden` | `inline` | `1` | `true` |

Consequences, both baked into the design:

1. In the jsdom lane the connection check (`node.isConnected`) is the only
   signal for a detached node — the default reader cannot see it (jsdom's
   detached reading is a plausible visible default, which is exactly why the
   old body answered "visible" there).
2. The unresolved-value gate is exercised in jsdom by injecting the engine's
   shape (`''`), and in the browser lane by the engine itself: Chromium
   returns `''` for a detached node, so that lane is the only one where the
   fix is proven against the real engine's own unanalyzable output. (The
   jsdom lane's CSS-side controls are structurally inert — jsdom does not
   resolve Tailwind utilities — so per the issue, real coverage lives in the
   browser lane. Chosen lane for the load-bearing proof: **the browser
   lane**.)

## The fix: three cases

`detectIconHidden` now has five exits in order:

1. `aria-hidden="true"` — a DOM attribute, answerable even on a detached
   node, so it is decided BEFORE the indeterminate gates.
2. `indeterminate-detached` — `node.isConnected` is false. Message names the
   cause (node not connected) and the expected action (attach, then
   re-run). Keys: `icon-guard-indeterminate-detached` (en/fr).
3. `indeterminate-unresolved` — any of `visibility`/`display`/`opacity` is
   the engine's unresolvable marker (the empty string). Key:
   `icon-guard-indeterminate-unresolved` (en/fr).
4. `css-visibility` / `css-display` / `css-opacity` — the three measured
   hiding mechanisms, unchanged.
5. `null` — visible.

The `aria-hidden` ordering matters: a detached node with
`aria-hidden="true"` is still a named, answerable fact, not an
indeterminate one.

A second defect was found while proving the browser lane: the spec's page
bundle ran i18next UNINITIALIZED, and uninitialed i18next renders a key as
the empty string — so the guard's thrown error carried `message === ''`, a
loud failure that named nothing. The browser entry
(`e2e/helpers/icon-guard-browser-entry.ts`) now initializes the singleton
synchronously with the real `en/common.json` resource (`initAsync: false`,
matching `src/lib/i18n.shared.ts`), mirroring the app, which always runs
with i18n initialized. The e2e assertion therefore pins the rendered
production text (cause + action), not a stand-in.

## Evidence lanes

- **Green unit lane** —
  `src/components/table/data-table-icon-visibility-guard-indeterminable.test.ts`
  (jsdom): detached node + default reader → loud failure naming cause and
  action (asserted on the real en text via a label-mapped i18n mock);
  connected node + unresolved reader → loud failure; plus the
  no-false-positive half executed against the real jsdom engine (connected
  visible / inline-hidden / reader-hidden / reader-visible / null element —
  all verdicts unchanged). Executed: 3/3 RED before the fix (the two defect
  tests), 3/3 GREEN after.
- **Kept-red proof** —
  `tests/proofs/1899/red-1899-icon-visibility-indeterminable.test.ts`:
  asserts the DEFECT is present (`.not.toThrow()` on a detached node and on
  a connected node with an unresolved reader), 1799-style. Executed both
  directions: defected body (0924167c3) → 3/3 green (defect present);
  fixed body → 2/3 red (assertion failures), and the CI runner
  (`pnpm --filter front test:preuves`, inverted semantics) reports
  "Proof tests failed as expected".
- **Browser lane (load-bearing)** —
  `e2e/data-table-icon-visibility-guard.spec.ts`,
  `chromium-hermetic-source` project: a real detached node, the real guard
  bundle in the page, Chromium's own `getComputedStyle`. The raw probe pins
  `isConnected === false` and the unresolved `''` values, then the REAL
  guard must fail loudly naming the cause and the action in its production
  en text. Executed: 3/3 green (two #1842 tests + the new one).
- **Regression guard on the #1799 r4 divergence contract** — the three
  divergence fixtures were DETACHED nodes; under the three-case rule a
  detached node is itself a verdict, so they were attached (the contract
  they prove — class list vs measurement — is orthogonal to connection and
  keeps its meaning on healthy inputs). 3/3 green unchanged.
- **1799 kept-red proof** — comment corrected (the false `''` claim);
  verdict unchanged: 2/5 red against the fixed code, as designed.

## Adverse-mutation audit (house rule 3)

Three mutations chosen against the fix, each executed (mutate → run lanes →
restore → verify restore):

| mutation | restores | unit lane | browser lane | runner (inverted) |
| --- | --- | --- | --- | --- |
| M1: connection gate disabled | the detached-node defect | **RED** (detached test) | **RED** (indeterminate test) | green (file-level: the unresolved test still fails) |
| M2: unresolved-value gate disabled | the empty-string defect | **RED** (unresolved test) | n/a (no test for that input) | green (file-level: the detached test still fails) |
| M3: guard throws on every connected node (false positive) | the bad exchange the issue warns about | **RED** (all 6) | n/a | red (the context test would pass) |

No mutation restores the defect while keeping every green-side lane green.
Honest nuance: the kept-red runner is file-level, so a PARTIAL restoration
(M1 or M2 alone) keeps it green — it is a staleness check, not the
regression guard. The regression guard is the green unit lane (CI: `Test
front`) plus the browser lane (CI: front e2e), and both catch M1/M2.

## CI naming (house rule 6)

- Green unit lane + 1799/1899 proof files compile: workflow
  `.github/workflows/front-ci.yml`, job `supply-chain`, step
  `Test front` (`pnpm --filter front test`).
- Paired red proof replay: same workflow/job, step
  `Verify paired red proofs` (`pnpm --filter front test:preuves`); declared
  by this PR adding `tests/proofs/1899/`.
- Browser lane: workflow `.github/workflows/front-e2e.yml`, job `test`
  (`front-e2e (n/4)`), shard-4 once-only block
  `--project=chromium-hermetic-source`.
- Design-system guard (comments are read by it too): job `supply-chain`,
  step `Check front design system`.

## Verification executed (local)

- jsdom probe: 4/4 (measurements above).
- Chromium probe: 3/3 (measurements above).
- RED before: `vitest run ...indeterminable.test.ts` → 2/3 red on the
  pre-fix body.
- GREEN after: `src/components/table/` → 141/141; full
  `pnpm --filter front test` → 311 files / 2971 tests + design guards, all
  green; `pnpm --filter front typecheck` → clean.
- 1899 proof both directions (3/3 defected, 2/3 fixed) + runner green.
- Browser lane: 3/3 green (`chromium-hermetic-source`).
- Adverse mutations M1/M2/M3 as above, all restored cleanly.
- `bash ~/ai-orchestration-playbook/tools/heavy.sh just ci` — see PR body.

## What could not be verified locally

- The e2e suite as a whole (only the icon spec file, isolated, in
  `chromium-hermetic-source`); the CI front-e2e job is the full check.
- Server-side CI (check-runs) — reported in the PR body.
