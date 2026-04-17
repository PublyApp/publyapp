# Homepage Factory: Assistantly Clean Mint + Higher Frequency

## Summary

Improve the visual quality of generated PublyApp homepages by introducing a new default-preferred
creative bundle inspired by `assistantly.com`, and by tightening the prompt contract so generated
implementations:

- establish a deliberate design language first (via the `hue` skill)
- load a distinct marketing font from the web for `/homepage-gen/:id` previews
- produce cleaner, calmer, more premium marketing layouts by default

This change is focused on the homepage factory output quality and preview route results. It does
not automate Codex execution.

## Goals

- Increase average visual appeal of generated homepages (more “clean marketing site”, less “admin
  dashboard”).
- Prefer a “clean mint” design direction by default (higher frequency) without eliminating variety.
- Make the prompt force a design-language step before implementation (colors, type scale, spacing,
  radii, elevation).
- Ensure generated preview pages can reliably use the chosen marketing font by loading it from the
  web.
- Keep generation deterministic for a given batch seed.

## Non-Goals

- Building a full bespoke design system for marketing pages.
- Replacing the runtime `/homepage-gen/:id` model.
- Automating Codex or agent execution to fill the scaffold files.
- Changing the product strategy model (audience overlays, archetypes, promise angles, proof
  strategies) beyond what is needed to support the new clean bundle preference.

## Problem

Generated homepages are often visually unconvincing even when the content structure is adequate.
The generator currently treats creative bundles as peers, so “clean” options do not appear often
enough to establish a baseline of high-quality marketing output.

Additionally, the prompt does not strongly enforce “design language first” behavior, and generated
implementations may rely on default MUI look-and-feel.

## Proposed Changes

### 1) New Creative Bundle: `assistantly-clean-mint`

Add a new creative bundle to `scripts/homepage-factory/creative-bundles.json` with concrete, clean
marketing direction inspired by `assistantly.com`:

- **Canvas:** bright neutral background, generous whitespace
- **Surfaces:** soft 1px borders, subtle shadows, restrained gradients
- **CTAs:** pill buttons (primary mint accent, secondary outlined)
- **Typography:** large, confident headline hierarchy; clean sans
- **Components:** cards with consistent radii/elevation; tight spacing rhythm

Include `https://www.assistantly.com/` as a reference anchor in `referenceAnchors`.

Compatibility tags should include the archetypes and audiences that it supports (initially broad
coverage is acceptable as long as it passes config validation and produces coherent outputs).

### 2) Higher-Frequency Preference (Deterministic Quota)

Prefer the new `assistantly-clean-mint` bundle by default using a deterministic quota-based
selection algorithm.

Target: approximately **40%** of variants in a batch should use `assistantly-clean-mint`, capped by
available unique compatible recipes.

Algorithm (deterministic):

1. For a given `seed`, compute the existing deterministic recipe ordering.
2. Also compute an ordered list of recipes filtered to those whose creative bundle is
   `assistantly-clean-mint`.
3. Compute:
   - `preferredCount = min(round(variants * 0.4), variants, preferredRecipes.length)`
4. Emit the first `preferredCount` variants from `preferredRecipes`.
5. Emit remaining variants from the full ordered list, skipping recipes already used.
6. If unique recipes are exhausted, cycle as the current implementation does.

This keeps outputs stable for a given seed while consistently increasing “clean mint” frequency.

### 3) Prompt Contract: Require `hue` Before Implementation

Update the prompt template so it explicitly instructs the agent to use the `hue` skill to define a
design language before writing UI code.

Prompt additions:

- A required **Design Language** step (call `hue`):
  - type scale + font usage
  - color tokens (neutral base + mint accent)
  - radii and elevation recipe (border + shadow)
  - spacing scale + section rhythm
  - CTA styles (pill primary + outlined secondary)
- Explicit anti-default constraints:
  - avoid generic MUI defaults (flat layout, default blue buttons, mismatched radii/shadows)
  - enforce coherent spacing and consistent surface styling

The prompt must still stay strategy-first and implementation-ready.

### 4) Web Font Loading for `/homepage-gen/:id`

Generated homepage previews should be able to reliably use a distinct marketing font stack.

Add a route-level `links()` in the `/homepage-gen/:generatedHomepageId` route so that the preview
pages load the chosen marketing font from Google Fonts. This should not affect the application’s
main theme globally; it applies only to the preview route.

Implementation direction:

- Add preconnect and stylesheet links similar to `apps/front/src/root.tsx`, but for the chosen
  marketing font (e.g. `Manrope` or `Plus Jakarta Sans`).
- Update the prompt to instruct use of a font-family stack that starts with the marketing font and
  falls back to `Roboto`/system fonts.

## Acceptance Criteria

- Running `pnpm generate:homepage-batch -- 10 <label>` produces a batch where roughly 4 variants use
  `assistantly-clean-mint` (subject to available unique compatible recipes).
- The generated prompt explicitly instructs the agent to use the `hue` skill to define the design
  language before implementing UI.
- Preview route `/homepage-gen/:id` loads the marketing font from the web and allows generated pages
  to use it without requiring system-installed fonts.
- The change is deterministic for a given seed and remains append-only for batch artifacts.

## Risks and Mitigations

- **Risk:** too much preference reduces exploration.
  - **Mitigation:** quota is partial (40%), and remaining variants still come from the full pool.

- **Risk:** bundle overuse causes visual sameness.
  - **Mitigation:** keep strategy layers varying (audience/archetype/promise/proof) and keep multiple
    clean bundles possible in the future.

- **Risk:** route-level font loading could clash with CSP.
  - **Mitigation:** follow existing `root.tsx` pattern; keep links limited to the preview route if
    global policy needs to stay stable.

## Out of Scope Follow-Ups

- Add a CLI flag to control preferred bundle/quota per run.
- Add multiple “clean” bundles (mint/blue/amber) with per-batch selection.
- Auto-apply design tokens in a shared marketing theme instead of per-page `sx` styling.
