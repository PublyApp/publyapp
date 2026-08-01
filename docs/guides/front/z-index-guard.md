# z-index scale guard

Normative. Defends the invariant that every z-index utility in `apps/front/src` routes through the
`--publy-z-*` scale declared in `src/styles/app.css`. The guard is
`apps/front/scripts/check-zindex-guard.mjs` (run by `pnpm --filter front check:zindex`, wired into
`pnpm --filter front test` and therefore `just ci-front`); its fixture suite is
`apps/front/scripts/check-zindex-guard.test.mjs`.

## The invariant

Every z-index utility (a Tailwind `z-*` class) in `apps/front/src` must route through the scale:

```
:root {
  --publy-z-raised: 10;          /* small affordances inside a surface */
  --publy-z-shell-topbar: 20;    /* the app-shell topbar */
  --publy-z-selection-bar: 40;   /* bulk-selection floating bar */
  --publy-z-overlay: 70;         /* modal/drawer backdrops */
  --publy-z-drawer-surface: 80;  /* drawer + dialog surfaces */
  --publy-z-menu: 100;           /* dropdowns, tooltips, pickers */
  --publy-z-select: 110;         /* select popups */
  --publy-z-toast: 120;          /* toasts */
}
```

Allowed spellings:

- `z-(--publy-z-…)` and `z-[var(--publy-z-…)]` / `z-[--publy-z-…]`, with variants and `!`
  (e.g. `md:z-(--publy-z-menu)`, `!z-(--publy-z-raised)`).
- `z-auto` and the other non-numeric CSS-wide keywords (`inherit`, `initial`, `unset`, `revert`,
  `revert-layer`) — these cannot participate in stacking, so no tier is needed.
- `z-index: var(--publy-z-…)` in inline `style` objects and `@apply`.

Anything else is a violation: `z-10`, `z-50`, `z-[60]`, `-z-10`, `!z-50`, `z-[var(--publy-z-menu,50)]`
(a scale reference with a raw fallback is still a raw value when the token is unset), and any
dynamic assembly (`z-${…}` across a template substitution).

## Mechanism

The guard builds on the installed Tailwind extractor (`@tailwindcss/oxide`'s `Scanner`), because it
reports exactly the candidates the production compiler recognises — re-implementing class extraction
from a TypeScript AST is what failed twice before (#987). The scanner's sources are derived from
`@import 'tailwindcss' source('../')` in `app.css` via `@tailwindcss/node`'s `compile()`, exactly the
way `@tailwindcss/vite` builds them, so the scanned file set is the production file set.

Four components:

1. **Candidate scan.** Every extractor candidate that is a raw z-index utility is reported unless it
   sits in a position that can never become a delivered class. Comments are stripped first (string-
   aware, position-preserving), then these positions are suppressed: literal/template-literal types,
   non-`className`/`class` JSX attributes, comparison operands, and every quoted string in CSS. Every
   other occurrence — including a plain variable initializer in one module that is consumed as a
   class in another — is a delivery position and is reported.
2. **`@apply` scan.** The extractor drops the token that ends an `@apply` directive right before `;`
   (`@apply block z-50;` yields no `z-50` candidate), so directive text is scanned directly.
3. **Substitution-boundary scan.** `z-${level}` has no candidate at extractor time; a class-delivery
   template literal whose static parts carry a z-index fragment across a `${…}` boundary is reported.
4. **Compiled-CSS gate.** The production-equivalent build output is scanned for `z-index:`
   declarations that do not resolve through `var(--publy-z-…)`. This proves what actually ships —
   the exact failure that killed the previous attempt, whose own fixture literals reached the shipped
   stylesheet. It is the reason fixtures live in `scripts/`, outside any path the scanner watches.

## Out of scope — stated, not silent

A guard that silently does not cover something invites the belief that it does. These are declared
gaps, each with its current evidence:

- **Raw `z-index:` declarations in `app.css`.** Not Tailwind utilities. The single existing one,
  `.publy-data-table thead`'s sticky header (`z-index: 5`), is allowlisted in
  `KNOWN_RAW_Z_INDEX_DECLARATIONS` in the script with its reason: it sits inside the table card's
  own stacking context, deliberately below `--publy-z-raised: 10`.
- **Inline `style={{ zIndex }}` objects.** `toaster.tsx` already uses `var(--publy-z-toast)`;
  `initials-avatar.tsx` stacks overlapping avatars with `visible.length - index`, which has no scale
  meaning. Component 1 ignores these because inline styles are not extractor candidates, and
  component 4 cannot see inline styles either.
- **z-index assembled at runtime from values that never appear literally in `src`** (e.g. from an
  API response). No static guard can see this.

One deliberate interaction to understand: an innocent-looking string that *literally contains* a
z-index utility (a `data-*` attribute value, a type literal, a test comment) still makes the
extractor emit that utility into the built stylesheet when it sits under `src/`, because the
production scanner is blind to context. Component 4 therefore turns red on it. That red is a true
positive — the shipped CSS is polluted — not a false positive on the source construct; component 1
stays green on all of the innocent constructs in the fixture suite. If you need such a literal under
`src/`, break the utility token so the scanner cannot see it (e.g. `z-[60]` → `z-\\[60\\]`, or spell
it "a numeric stacking value"). The cleanest place for fixtures is `scripts/`, which the scanner
never watches.
