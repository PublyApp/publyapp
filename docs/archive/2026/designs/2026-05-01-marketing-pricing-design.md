Status: Historical — not normative
Original location: docs/superpowers/specs/2026-05-01-marketing-pricing-design.md
Archive reason: Completed design retained only for architectural decision history.
Superseded by: apps/front is retired; apps/front-2 and docs/guides/front-2/conventions.md are current.

# Phase 1 — Marketing Pricing Page Design

**Date:** 2026-05-01
**Status:** Design approved, ready for implementation plan
**Predecessor:** `docs/superpowers/specs/2026-04-30-marketing-supporting-pages-design.md` (parent spec; canvas IDs and brand kit live there)
**Branch:** `feature/marketing-supporting-pages`

## Context

The parent spec generated 14 AIDesigner canvases for the marketing supporting pages. Code adoption was decomposed into 6 sequential implementation phases. This spec covers Phase 1 — the dedicated `/pricing` page — derived from canvases `35a6d196` (light) and `6c3e35f3` (dark), brand kit `31329e88-32ed-4dc2-9130-c5f5018e1c67`.

Phase 1 also lays down conventions inherited by all subsequent phases: shared data modules, canvas-to-MUI translation discipline, dark-mode hybrid strategy, and a Tailwind→sx cheat-sheet that grows phase by phase.

## Goal

Ship `/pricing` as a fully-rendered SSR page that visually matches both AIDesigner canvases, replaces no existing surface (the home pricing strip stays), and pulls tier data from a single source of truth shared with the home strip.

## Non-goals

- **Topbar route-link nav variant** — deferred to a future "unified mega-menu nav" effort. Topbar stays as today during Phase 1 and onward (until that effort lands).
- **Footer 4-column expansion** — deferred to the same mega-menu effort. New marketing routes are reachable by direct URL during Phase 1+, not by global footer link.
- **Marketing primitive extraction** (`MarketingHero`, `ContentBand`, `CtaBand`, `LegalDocPage`) — primitives emerge only when a second consumer appears (Phase 2+). Phase 1 builds Pricing inline.
- **Pricing FAQ copywriting** — placeholder copy from canvas; real copy edited in flight or as a follow-up.
- **CMS/API-driven pricing** — out of scope; tier data lives in a TS module.
- **i18n / localization of marketing copy** — marketing surface stays English-only (matches existing `home/parts/*.tsx` precedent). Can be retrofitted via `useTranslate()` later.

## Conventions established in Phase 1 (inherited by Phase 2+)

These are precedents the rest of the marketing implementation effort follows. Documenting them here so later specs reference rather than re-decide.

### 1. Marketing primitives: extract on second consumer

Build each marketing page inline. When a structural pattern appears in a *second* page, extract it to `apps/front/src/routes/marketing/_components/<primitive-name>.tsx` at that point — not speculatively from canvas inspection. This produces sturdier primitives shaped by real consumers.

Phase 1 establishes the empty `_components/` folder.

### 2. Shared data modules: `apps/front/src/routes/marketing/_data/`

Static content shared across marketing pages lives in `_data/<topic>.ts`. Phase 1 creates `_data/pricing.ts`. Future phases add `blog-articles.ts`, `changelog-entries.ts`, etc. The `_data/` folder is a new convention specific to marketing.

### 3. Canvas-to-MUI translation: hand-translate + cheat-sheet

Canvases are Tailwind HTML; marketing code is MUI v6 + `sx` per `AGENTS.md`. Translation is
hand-done with the canvas open side-by-side. Recurring Tailwind patterns were codified in the
retired app's Tailwind-to-`sx` mapping note, seeded in Phase 1 and appended in later phases as new
patterns appeared.

Where a Tailwind utility maps to a theme token (e.g., `text-slate-600` ≈ `text.secondary`), the theme token always wins over a literal hex — preserving the dark-mode token-swap mechanism.

### 4. Dark mode: hybrid token-driven + canvas-diff overrides

Default for every styled element: theme tokens, which dark-swap automatically via `theme.applyStyles('dark', ...)` in `theme-config.ts`. Where the dark canvas shows a deliberate divergence from the light canvas that tokens can't express, add an explicit `applyStyles('dark', { ... })` override prefixed by a `// dark-diff:` comment.

The `// dark-diff:` comment is the only routinely-allowed comment in the marketing surface (per `AGENTS.md`'s "default to no comments" rule) — because the override IS the non-obvious decision and future readers need to know it was deliberate.

### 5. Path constants: `FRONT_PATH_NAMES.marketing.*`

A new `marketing` namespace is added to `FRONT_PATH_NAMES` in Phase 1. Every marketing route reference in code goes through this namespace — no hardcoded strings. Each later phase appends its own routes to the namespace.

## Scope

### In scope (Phase 1 ships)

1. **`/pricing` route** — dedicated page from canvases `35a6d196` (light) + `6c3e35f3` (dark)
2. **`FRONT_PATH_NAMES.marketing.pricing`** — first entry in the new `marketing` namespace
3. **Marketing route tree update** — `marketing.routes.ts` registers `/pricing`
4. **Shared pricing data module** — `routes/marketing/_data/pricing.ts` exporting `TIERS`, `COMPARISON_MATRIX`, `PRICING_FAQS`
5. **Refactor `home-pricing.tsx`** — consume `TIERS` from shared module, add a "See full pricing →" link to `/pricing`
6. **Tailwind→sx cheat-sheet seed** — the retired app's Tailwind-to-`sx` mapping note populated
   with patterns from Pricing translation
7. **Empty `_components/` folder** — established for Phase 2+ extractions

### Out of scope (deferred or later phases)

- Topbar nav variant (deferred to mega-menu effort)
- Footer expansion (deferred to mega-menu effort)
- Other marketing pages (Phases 2–6)
- Error component refactor (Phase 6, parallel)
- Marketing primitives (extracted in later phases on second consumer)
- Pricing FAQ copy editing (placeholder for now)

## File layout

```
apps/front/src/routes/marketing/
├── _components/                       (NEW empty folder + .gitkeep; populated in later phases)
├── _data/
│   └── pricing.ts                     (NEW — shared TIERS, COMPARISON_MATRIX, PRICING_FAQS)
├── pricing/
│   ├── pricing-page.tsx               (NEW — route entry, composes parts top-to-bottom)
│   └── parts/
│       ├── pricing-hero.tsx           (NEW)
│       ├── pricing-tiers.tsx          (NEW — 3 tier cards + monthly/annual toggle)
│       ├── pricing-comparison.tsx     (NEW — full feature matrix)
│       ├── pricing-faq.tsx            (NEW — pricing-specific Q&A accordion)
│       └── pricing-enterprise.tsx     (NEW — "talk to sales" band)
└── home/
    └── parts/
        └── home-pricing.tsx           (MODIFIED — consume TIERS, add link to /pricing)

apps/front/src/routes/_tree/
└── marketing.routes.ts                (MODIFIED — add /pricing route)

packages/shared-ts/lib/
└── constants.ts                       (MODIFIED — add FRONT_PATH_NAMES.marketing namespace)

docs/guides/
└── tailwind-to-sx-mapping.md          (NEW — cheat-sheet, seeded with Phase 1 patterns)
```

The `parts/` pattern matches the existing `home/parts/` precedent — no new convention.

## Data shapes (`_data/pricing.ts`)

```ts
export type PricingTier = {
  id: 'creator' | 'scale' | 'enterprise';
  name: string;
  tagline: string;
  pricing: { monthly: number | 'custom'; annually: number | 'custom' };
  features: string[];
  cta: { label: string; href: string };
  highlighted?: boolean;
};

export const TIERS: PricingTier[] = [ /* creator, scale, enterprise */ ];

export type ComparisonRow = {
  category: 'Workspace' | 'Publishing' | 'AI' | 'Analytics' | 'Support';
  feature: string;
  tiers: Record<PricingTier['id'], boolean | string>;
};

export const COMPARISON_MATRIX: ComparisonRow[] = [ /* ... */ ];

export type FaqItem = { question: string; answer: string };
export const PRICING_FAQS: FaqItem[] = [ /* 5–7 items from canvas */ ];
```

**Why these shapes:**
- `pricing.{monthly,annually}: number | 'custom'` discriminates numeric tiers from enterprise without a separate component path; the renderer formats `'custom'` as "Custom".
- `tiers: Record<id, boolean | string>` in the comparison matrix expresses both ✓/— booleans and per-tier limits like `"100/mo"` or `"Unlimited"` — matches what the canvas shows.
- `category` is a literal union to keep matrix rows grouped without a separate map.

`home-pricing.tsx` consumes `TIERS.slice(0, 2)` (Creator + Scale only). The dedicated page renders all 3 tiers.

## Page composition + SSR

**Route registration** in `marketing.routes.ts`:

```ts
route('pricing', 'routes/marketing/pricing/pricing-page.tsx'),
```

Mounts inside the existing `marketing-layout.tsx` — no layout changes.

**SSR + loaders.** Pricing has no remote data (`TIERS`, `COMPARISON_MATRIX`, `PRICING_FAQS` are static module imports). Per `AGENTS.md`, marketing pages are SSR-rendered, but no `loader` is needed when there's no async data. The page renders fully server-side.

**`pricing-page.tsx`** is a thin composer ordering parts top-to-bottom:

```tsx
<PricingHero />
<PricingTiers />
<PricingComparison />
<PricingFaq />
<PricingEnterprise />
<HomeCta />   // reused from routes/marketing/home/parts/home-cta.tsx
```

`HomeCta` is imported from its current home location for now — the first cross-page consumer of a home part. Phase 2 promotes it to `_components/cta-band.tsx` if it remains the cleanest reuse path (per the "extract on second consumer" rule).

**Per-part responsibilities:**

| Part | Responsibility | Local state |
|---|---|---|
| `PricingHero` | Eyebrow + h1 + subhead, optional value-prop strip | none |
| `PricingTiers` | 3 tier cards + monthly/annual billing toggle | `useState<'monthly' \| 'annually'>` |
| `PricingComparison` | Full feature matrix table; mobile = stacked cards | none |
| `PricingFaq` | Accordion of `PRICING_FAQS` | accordion expand state |
| `PricingEnterprise` | "Talk to sales" band with contact CTA | none |

Each part is self-contained: owns its `Box` + `Container` wrapper, imports its data directly from `_data/pricing.ts`, takes no props (keeps `pricing-page.tsx` thin).

## Path constants

Extending `packages/shared-ts/lib/constants.ts`:

```ts
export const FRONT_PATH_NAMES = {
  home: '/',
  // ... existing ...
  marketing: {
    pricing: makePath('pricing'),
    // future phases extend here:
    // blog: { _root, article: (slug) => ... },
    // changelog: makePath('changelog'),
    // about, contact, security, terms, privacy, cookies, ...
  },
  auth: { /* ... */ },
  tenant: (tenantId = '') => { /* ... */ },
  staff: { /* ... */ },
};
```

The "See full pricing →" link in `home-pricing.tsx` uses `FRONT_PATH_NAMES.marketing.pricing` — never a hardcoded `/pricing` string.

## Dark mode mechanics

Default = theme tokens (`background.default`, `text.primary`, `text.secondary`, `divider`, `primary.main`, `grey.100`, etc.). These dark-swap automatically.

Where the dark canvas (`6c3e35f3`) shows a deliberate divergence from the light canvas (`35a6d196`) that tokens can't express:

```tsx
sx={(theme) => ({
  background: `radial-gradient(... ${theme.palette.primary.main} ...)`,
  // dark-diff: dark canvas uses a denser glow + cooler edge
  ...theme.applyStyles('dark', {
    background: `radial-gradient(... ${varAlpha(theme.vars.palette.primary.mainChannel, 0.4)} ...)`,
  }),
})}
```

During implementation, diff the two canvases section-by-section. Expected number of `// dark-diff:` overrides on Pricing: 3–5 (likely the hero glow, highlighted-tier accent, comparison row hover, possibly FAQ expanded state). Most of the page uses tokens unchanged.

## Cheat-sheet doc seed

**File:** the retired app's Tailwind-to-`sx` mapping note

Lookup table for the recurring Tailwind patterns used across the 14 marketing canvases. Phase 1 seeds it with patterns encountered during Pricing translation; later phases append rows as new patterns appear. If a pattern appears only once across all canvases, it doesn't need a row.

**Initial sections:**
- Spacing & sizing (`p-6 md:p-7`, `aspect-[16/10]`, `max-w-[1100px]`, etc.)
- Radii (`rounded-[24px]`, `rounded-[16px]`, `rounded-full`)
- Shadows (`shadow-card-rest`, `shadow-card-hover`)
- Color tokens (canvas class → theme token mapping)
- Group hover (parent-child sx selector pattern)
- Animations (no perpetual animations; hover transitions only on `transform` + `boxShadow` per marketing convention)

The cheat-sheet documents *patterns we used*, not every possible Tailwind class.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Translation drift — code visual diverges from canvas | Reviewer opens canvases `35a6d196` + `6c3e35f3` side-by-side with the dev server during PR review. The cheat-sheet's "color tokens" row prevents the most common drift (literal hex vs theme token). |
| `home-pricing.tsx` regression after refactor to consume shared `TIERS` | Manual visual check on `/` after refactor; tier labels, prices, and feature bullets must read identically. The strip's monthly/annual toggle and switch styling stay unchanged — only the data source changes. |
| `FRONT_PATH_NAMES.marketing` namespace collision with future plans | Confirmed no existing `marketing` key. Namespace is new in Phase 1, extended incrementally by every later phase. |
| Pricing page heavy enough to hurt LCP | Page is static SSR, no images in the hero (per canvas), no async fetches. Risk is low. If it surfaces: lazy-mount the comparison matrix below the fold. |
| Comparison matrix doesn't render well on mobile | Canvas already shows mobile collapse pattern. Implementation matches it (cards stack on `xs`, full table from `md` up). |

## Testing

- **No automated tests for marketing pages.** Matches existing precedent (`home/parts/*.tsx` have no tests). Visual snapshots would be brittle and not the right tool.
- **Verification before "done":**
  - `just dev-front`, open `/pricing` in light + dark
  - Click monthly/annual toggle on tier cards
  - Verify "See full pricing →" link from home navigates correctly
  - Run `just check-write`, `just tsc-front`, `just knip`
- **Browser check** (per `AGENTS.md` "test UI in browser"):
  - **Golden path:** land on `/pricing`, scroll through all 5 sections, toggle billing period, click an enterprise CTA
  - **Edge cases:** dark mode, mobile breakpoint (cards-stack-to-table boundary), keyboard nav on FAQ accordion

## Acceptance criteria

- [ ] `/pricing` route registered, renders SSR, no console errors
- [ ] Page matches light canvas `35a6d196` to a "looks the same" review bar
- [ ] Page matches dark canvas `6c3e35f3` with documented `// dark-diff:` overrides where applicable
- [ ] Monthly/annual toggle works on tier cards
- [ ] FAQ accordion expands/collapses
- [ ] `home-pricing.tsx` consumes shared `TIERS`, prices/labels unchanged from today
- [ ] "See full pricing →" link visible at the bottom of home strip, navigates to `/pricing`
- [ ] `FRONT_PATH_NAMES.marketing.pricing` exported and used everywhere `/pricing` is referenced
- [ ] `tailwind-to-sx-mapping.md` exists with at least the seeded patterns
- [ ] `_components/` folder created (empty, ready for Phase 2+)
- [ ] `just check-write` + `just tsc-front` + `just knip` all clean

**Definition of done:** all checkboxes ticked, PR opened, browser-verified.

## Open questions

- **`HomeCta` reuse cleanliness** — answered during Phase 2: if pricing's reuse of the home CTA stays clean, promote it to `_components/cta-band.tsx`; if Phase 2's About/Security needs diverge, generalize then.
- **Pricing FAQ copy** — placeholder text from canvas now; real copy is a separate non-blocking task.
- **Enterprise CTA target** — "Contact" page doesn't exist yet (Phase 3). Phase 1 enterprise CTA points to `mailto:` or to a placeholder anchor; updated to `/contact` when Phase 3 ships.

## References

- Parent spec: `docs/superpowers/specs/2026-04-30-marketing-supporting-pages-design.md`
- Canvas IDs (Pricing): `35a6d196-5354-45b9-943c-4417adf150c9` (light), `6c3e35f3-c07f-4ec8-917d-95c78b07597e` (dark)
- Brand kit: `31329e88-32ed-4dc2-9130-c5f5018e1c67` (PublyApp Marketing v3 light)
- Marketing surface conventions for the retired app
- Frontend coding standards for the retired app
