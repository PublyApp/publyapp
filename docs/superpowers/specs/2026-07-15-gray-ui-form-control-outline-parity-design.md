# Gray UI Form-Control Outline Parity Design

**Issue:** [#829](https://github.com/radandevist/publyapp/issues/829)

## Problem

PublyApp's shared `Input`, `Textarea`, and `SelectTrigger` primitives use a
stronger surface and focus treatment than the local Gray UI CSM reference.
Their `bg-input/35` fill differs from the reference surface, and their opaque
three-pixel `ring-ring` halo makes keyboard focus visually heavy. The three
recipes also encode slightly different expectations from the Gray UI invalid
state, which makes future drift likely.

This is a visual-parity change, not a component redesign. The controls already
have PublyApp-specific geometry and typography that fit the surrounding product
surfaces.

## Goals

- Align the shared text input, textarea, and select trigger with Gray UI's
  `bg-input/50` surface and `focus-visible:ring-ring/30` halo.
- Keep a normal `border-border` edge and the existing lightweight
  `shadow-[var(--publy-shadow-input)]` elevation.
- Preserve a clear, contrast-compliant primary keyboard-focus indicator by
  pairing the translucent halo with an opaque focus border.
- Preserve destructive semantics for invalid controls, including while they
  are focused, while adopting Gray UI's `/20` light-mode and `/40` dark-mode
  invalid-ring opacities.
- Lock the shared state contract in primitive tests and the focus-contrast
  guard, then verify the rendered treatment for all three controls in both
  themes.

## Non-Goals

- No changes to radii, heights, widths, padding, gaps, font sizes, typography,
  placeholder styling, or resize behavior.
- No Gray UI `rounded-3xl` or pill geometry.
- No changes to `SelectContent`, popup alignment, popup width, menu items,
  separators, animation, backdrop, shadow, or z-index behavior.
- No changes to field validation logic, form submission, Base UI behavior, or
  public component props.
- No global color-token or focus-token redesign.
- No broad refactor of other controls or route-local input-like composites.

## Reference And Current Delta

The local reference files are
`.references/gray-ui-csm/components/ui/input.tsx` and
`.references/gray-ui-csm/components/ui/select.tsx`.

| Concern | Current PublyApp | Target |
| --- | --- | --- |
| Surface | `bg-input/35` | `bg-input/50` |
| Default edge | `border border-border` | unchanged |
| Elevation | `shadow-[var(--publy-shadow-input)]` | unchanged; it is already the PublyApp lightweight input shadow |
| Focus edge | `focus-visible:border-ring` | unchanged and treated as the primary focus indicator |
| Focus halo | `focus-visible:ring-3 focus-visible:ring-ring` | `focus-visible:ring-3 focus-visible:ring-ring/30` |
| Invalid halo, light | `aria-invalid:ring-destructive/12` | `aria-invalid:ring-destructive/20` |
| Invalid edge, dark | full-strength destructive | `dark:aria-invalid:border-destructive/50` when not focused |
| Invalid halo, dark | no dedicated dark opacity | `dark:aria-invalid:ring-destructive/40` |

Gray UI's shape, select popup treatment, and typography are deliberately not
copied. PublyApp keeps `--publy-radius-input`, its responsive input height and
type size, textarea sizing, and both SelectTrigger size variants.

The reference's translucent focus ring cannot be copied in isolation. The
existing `focus-ring-contrast.test.ts` correctly establishes a 3:1 local
contrast floor, while `ring-ring/30` alone falls below that floor. In the target
treatment, the opaque one-pixel focus border is the primary indicator and the
three-pixel `/30` ring is a supplementary halo. The guard must model that
combined treatment; it must not exempt these files or lower the contrast floor.

## Component Boundary

Only the root control recipes change:

- `Input` in `apps/front-2/src/components/ui/input.tsx`
- `Textarea` in `apps/front-2/src/components/ui/textarea.tsx`
- `SelectTrigger` in `apps/front-2/src/components/ui/select.tsx`

The three primitives should retain their existing, explicit class strings. A
new shared class helper is not justified for this change: primitive-specific
sizing and content rules dominate each recipe, while focused tests can enforce
the small common state subset without adding another ownership layer.

For an invalid and focused control, the destructive state remains visible and
the focus indicator remains compliant. Use a full-strength destructive focus
border in both themes, with the reference-aligned destructive halo opacity.
This is an intentional PublyApp accessibility refinement over the reference's
dark `/50` invalid border: `/50` is appropriate for the resting invalid edge,
but not for the primary focus indicator.

Encode that precedence explicitly with
`aria-invalid:focus-visible:border-destructive` and
`aria-invalid:focus-visible:ring-destructive/20`, plus the corresponding
`dark:aria-invalid:focus-visible:border-destructive` and
`dark:aria-invalid:focus-visible:ring-destructive/40` classes. Do not rely on
Tailwind generation order to decide whether the focus or invalid utility wins.

## State Matrix

All entries apply equally to Input, Textarea, and SelectTrigger unless a row
explicitly says otherwise.

| State | Light theme | Dark theme | Invariants |
| --- | --- | --- | --- |
| Default | `border-border`, `bg-input/50`, input shadow | same semantic classes, resolved through dark tokens | Existing radius, dimensions, spacing, and typography remain unchanged. |
| Focus-visible | Opaque `border-ring` plus three-pixel `ring-ring/30` halo | same semantic classes | Focus is keyboard-visible only; `outline-none` remains because the authored focus treatment replaces the UA outline. |
| Invalid, resting | `border-destructive` plus three-pixel `ring-destructive/20` | `border-destructive/50` plus `ring-destructive/40` | `aria-invalid` remains the state source; no error behavior or text changes. |
| Invalid + focus-visible | Full-strength `border-destructive` plus three-pixel `ring-destructive/20` | Full-strength `border-destructive` plus three-pixel `ring-destructive/40` | Destructive color remains visible while the full-strength border supplies the primary focus indicator. |
| Disabled | Existing disabled pointer/cursor behavior and `opacity-50` | same | Disabled controls do not gain hover/focus styling; native/Base UI semantics remain unchanged. |

The disabled state composes with the new resting surface but otherwise does not
change. Select placeholder styling and Input file-input pseudo-element styling
also remain untouched.

## Focus-Contrast Guard

`apps/front-2/src/styles/focus-ring-contrast.test.ts` currently resolves and
tests ring colors but not focus border colors. Extend its state evaluator so a
focus treatment is compliant when at least one authored primary indicator for
the active state clears 3:1. For these controls, that indicator is the opaque
focus border; the translucent outer ring remains deliberately supplementary.

The guard change must remain fail-closed:

- Parse static `focus-visible:border-*` and combined
  `aria-invalid:focus-visible:border-*` utilities through the same known-token,
  opacity, theme, and active-variant machinery used for rings.
- Reject unknown, dynamic, or unresolvable border colors rather than skipping
  them.
- Add a planted failure proving `ring-ring/30` without a compliant border does
  not pass.
- Add a planted success proving the target opaque-border plus `/30`-halo
  treatment passes in light and dark modes.
- Exercise focused and focused-plus-invalid states so the dark invalid case
  cannot silently fall back to a low-opacity border.
- Do not add a path allowlist, special-case the three primitive filenames, or
  reduce `CONTRAST_FLOOR`.

`apps/front-2/src/styles/app.css` requires no token change. Its `--input`,
`--ring`, and `--publy-shadow-input` values remain the source of truth. The
route-specific search and page-size-select focus overrides are outside this
component boundary and remain unchanged.

## Test Strategy

### Primitive Tests

Update the corresponding tests beside each primitive:

- Assert `bg-input/50`, the normal border, the PublyApp input shadow, the opaque
  focus border, and `focus-visible:ring-ring/30`.
- Assert the light and dark invalid border/ring classes, including the
  full-strength destructive border for invalid focus.
- Assert removed classes such as `bg-input/35`, the exact standalone
  `focus-visible:ring-ring` token, and `ring-destructive/12` are absent. Tokenize
  the class list so the assertion does not mistake the target
  `focus-visible:ring-ring/30` token for the removed opaque token.
- Retain semantic assertions (`input`, `textarea`, `combobox`, and data slots).
- Lock each primitive's existing geometry classes so parity work cannot import
  Gray UI's `rounded-3xl`, alter responsive heights, or change SelectTrigger
  size variants.
- Keep the existing Select popup behavior tests unchanged; add trigger styling
  assertions without coupling them to `SelectContent`.

Run the three primitive test files together, then run the complete
`focus-ring-contrast.test.ts` suite. The guard's planted-defect tests are part
of acceptance, not optional fixtures.

### Static Gates

Run `npx oxlint` over every changed TS/TSX file with zero errors, followed by
the front-2 typecheck and design-system guard. No dependency changes or client
generation are involved.

## Visual Verification

Use the existing feature-gated `/field-validation` demo as the visual fixture;
the Docker e2e build enables it while production leaves it unavailable. Extend
that fixture with labeled, stable examples of Input, Textarea, and SelectTrigger
without changing its existing email-validation behavior.

In `apps/front-2/e2e/field-validation.spec.ts`, verify at a desktop viewport in
both light and dark themes:

1. Focus each control by keyboard or `.focus()` and confirm its bounding box is
   unchanged across focus.
2. Assert computed background, border color, and box shadow show the target
   surface, opaque focus edge, and translucent halo. Use computed browser values
   rather than authored Tailwind strings.
3. Set each fixture to invalid and repeat the focused assertions, confirming the
   destructive edge remains visible in both themes.
4. Capture named screenshots under `test-results/gray-ui/` for owner review,
   with all three controls visible in one frame and focus moved between captures.

The screenshots are review artifacts, not committed baselines. This follows the
existing screenshot-capture policy and avoids blessing the current pixels
without owner approval. The e2e test must still contain computed-style and
geometry assertions, so it cannot pass solely because a screenshot file was
written.

## Expected File Surface

Implementation is expected to touch only:

- `apps/front-2/src/components/ui/input.tsx`
- `apps/front-2/src/components/ui/input.test.tsx`
- `apps/front-2/src/components/ui/textarea.tsx`
- `apps/front-2/src/components/ui/textarea.test.tsx`
- `apps/front-2/src/components/ui/select.tsx` (`SelectTrigger` only)
- `apps/front-2/src/components/ui/select.test.tsx`
- `apps/front-2/src/styles/focus-ring-contrast.test.ts`
- `apps/front-2/src/routes/field-validation.tsx` (feature-gated visual fixture only)
- `apps/front-2/e2e/field-validation.spec.ts`

`apps/front-2/src/styles/app.css` is read-only for this implementation. Any need
to change tokens, select popup code, public routes, control geometry, or files
outside the list above is a scope change that requires a new design decision.

## Acceptance Criteria

- All three shared controls render the target surface, normal border,
  lightweight shadow, and `/30` focus halo without geometry changes.
- Invalid controls use the reference-aligned halo opacities and retain a
  full-strength destructive primary focus edge.
- Primitive tests lock common state classes and primitive-specific geometry.
- The contrast guard proves the combined focus treatment in light and dark,
  and proves a low-opacity halo alone is insufficient.
- Computed-style visual verification covers Input, Textarea, and SelectTrigger
  in default focus and invalid focus across both themes.
- Select popup/menu geometry and behavior are unchanged.
- Targeted tests, oxlint, typecheck, design-system checks, and the front-2 e2e
  harness pass.
