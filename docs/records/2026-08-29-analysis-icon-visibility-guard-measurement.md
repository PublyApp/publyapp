# 2026-08-29 — analysis: icon visibility guard, measurement-based (#1799)

## Summary

PR #1842 fixes issue #1799 on `lane/wt-1799`: the icon visibility guard in
`apps/front/src/components/table/data-table-icon-visibility-guard.ts` used to
be a **class-name enumeration**. It asserted the check state a test claims by
listing Tailwind utility class names (`invisible`, `hidden`) instead of
measuring the icon's actual visibility. A class enumeration is, by
construction, never exhaustive. This record analyses the defect, the
measurement fix, and the evidence lanes that now prove the guard measures
rather than enumerates (round 4 of review re-forged the evidence; see
`.dump/verdict-r2.md`).

## The defect

`assertIconIsVisible` answered "is the icon the user sees?" by checking two
specific class names. The issue's two named escapes both slipped through:

- `opacity-0` (Tailwind → `opacity:0`): the icon is painted but fully
  transparent.
- `aria-hidden="true"` on the icon element: a DOM attribute with no CSS
  counterpart at all.

The same defect class extends to `clip-path-*`, `size-0`, off-screen
`translate-*`, inline styles, and runtime stylesheet swaps: every new entry
re-opens the gap.

## The fix: MEASURE, not enumerate

The helper body now reads the icon's visibility from the user's perspective,
never from a list of class names:

1. `aria-hidden="true"` — a DOM attribute, direct read.
2. `visibility:hidden` — a computed style (`getComputedStyle`).
3. `display:none` — a computed style.
4. `opacity:0` — a computed style.

The style reads go through an injected `ComputedStyleReader`
(`data-table-icon-visibility-guard-reader.ts`) so the measurement is
exercisable in jsdom (which cannot parse the Tailwind stylesheet) and in a
real browser (Chromium's own `getComputedStyle`).

## Evidence lanes (round 4)

The round-2 review showed the pre-round-4 suite could not tell a measurement
from a read-and-discard enumeration: restoring an enumeration body that calls
`readComputed` and discards its result produced byte-identical test outcomes.
Round 4 closes that with three lanes:

1. **Divergence contract tests**
   (`apps/front/src/components/table/data-table-icon-visibility-guard.test.ts`):
   cases where the class list and the computed style DISAGREE, so only a body
   that actually measures can answer correctly:
   - computed `visibility:hidden` with none of the enumerated classes → the
     guard must raise (an enumeration says "visible" and passes silently);
   - `opacity-0` class present but computed `opacity:1` → the guard must NOT
     raise (an enumeration says "hidden" and throws a false positive);
   - reader-driven sanity: an `opacity:0` reader value flips the verdict both
     ways.
   Executed against the round-2 lethal mutation (classList enumeration of
   `invisible`/`hidden`/`opacity-0` + kept `aria-hidden`, calling and
   discarding `readComputed`): 3/3 RED. Restored to the measurement body:
   3/3 GREEN. Evidence: `.dump/preuve-1799-r4-mut-enumeration.txt` and
   `.dump/preuve-1799-r4-fixed.txt`.

2. **Kept-red proof** (`apps/front/tests/proofs/1799/red-1799-icon-visibility-guard.test.tsx`):
   5 vitest cases replaying the ORIGINAL defect (the proof asserts the bug is
   present; against the fixed code exactly the `opacity-0` and `aria-hidden`
   cases go red — 2/5). Replayed by the `Verify paired red proofs` CI step
   with inverted semantics.

3. **Real-guard real-browser spec**
   (`apps/front/e2e/data-table-icon-visibility-guard.spec.ts`): the round-2
   review found the spec re-implemented the measurement in-page
   (`assertIconVisibleToBrowser`) and never called the guard. Round 4 removes
   the copy: `getIconGuardBrowserScript` (esbuild, once per worker) bundles
   the REAL guard module verbatim, `icon-guard-browser-entry.ts` exposes it on
   `window`, and the spec calls `assertIconIsVisible` in the page with
   Chromium's own `getComputedStyle` as the default reader. Each mutation is
   verified twice: the raw engine probe proves the DOM actually hides the
   icon, and the bundled real guard must agree (raise for hidden, pass for the
   painted baseline).

The i18n round (#1842) wrapped the guard's messages in `i18n.t()` calls
(`icon-hidden-aria`, `icon-hidden-visibility`, `icon-hidden-display`,
`icon-hidden-opacity`, `icon-guard-context-null`) with keys in both
`en/common.json` and `fr/common.json`, satisfying the `i18n-key-coverage`
guard.

## Verification executed

- `pnpm --filter front exec vitest run --config vitest.config.ts
  src/components/table/data-table-icon-visibility-guard.test.ts` — 3/3 green.
- Divergence lane under the enumeration mutation — 3/3 red (see lane 1).
- `pnpm --filter front test:preuves` — replay of the declared kept-red proof.
- `pnpm --filter front exec playwright test --project=chromium-hermetic-source
  e2e/data-table-icon-visibility-guard.spec.ts` — real Chromium, real guard
  bundle.
- `pnpm --filter front typecheck`, `just ci` — see the PR body for results and
  what could not run in this environment.

## Scope notes

- The two `#1829` fixture-harness commits (`f5bb17abc`, `92cb0fe38`, net-zero
  rebase leftovers) were dropped from the branch; #1829's work shipped via
  #1843.
- The historical count claim "307/307 files, 2933/2933 tests" from earlier
  rounds has no traceable evidence and is not repeated in this record or the
  PR body.