# Comparison page (vs Buffer) — design spec

Date: 2026-05-08
Surface: marketing
Issue: #372 (slice 1)
Slug: `comparison-page`
Branch: `feature/comparison-page`

## Goal

Ship the first competitor-comparison marketing page (PublyApp vs Buffer) at
`/compare/buffer` while structuring the data + page component as a reusable
`/compare/:competitor` template so future entries (Hootsuite, Sprout Social,
Later) drop in with only a new data record.

## Scope decisions (canvas-driven; locked)

- **One route, multiple competitors.** Single page component reads a
  competitor record (keyed by URL slug) and renders the same canvas-faithful
  layout for every variant.
- **Buffer is the only competitor seeded today.** Hootsuite/Sprout/Later are
  out of scope for this PR; adding them later is a data-only PR.
- **Canvas sections are kept 1:1.** No new sections invented; no canvas
  sections dropped. Translation Tailwind → MUI sx is purely cosmetic.
- **Feature-flag gated.** `marketing.comparison` defaults to `false`; flipping
  the flag (or `VITE_FEATURE_MARKETING_COMPARISON=true`) enables the route.
  Footer/topbar entries are deferred — the orchestrator brief explicitly
  forbids adding nav entries in this PR.
- **Path helper.** Use existing `makePath()` (no `marketingPath` exists in
  this branch; the orchestrator brief mentions one but the codebase
  convention is `makePath`). Marketing paths in `FRONT_PATH_NAMES.marketing`
  do not currently use trailing slashes; the new entries follow that
  convention to stay consistent.
- **Per-page SEO.** Plain `export const meta` returning a `MetaDescriptor[]`
  — the `buildSeoMeta` helper from `feature/seo-infra` (#405) is not
  available on this branch.

## File map

```
apps/front/src/lib/features/flags.ts                                       # +1 flag
packages/shared-ts/lib/constants.ts                                        # +2 path entries
apps/front/src/routes/_tree/marketing.routes.ts                            # +1 conditional route
apps/front/src/routes/marketing/_data/comparisons.ts                       # NEW — Competitor type + BUFFER record
apps/front/src/routes/marketing/_components/comparison-quick-verdict-cards.tsx   # NEW
apps/front/src/routes/marketing/_components/comparison-feature-table.tsx         # NEW
apps/front/src/routes/marketing/_components/comparison-pricing-pair.tsx          # NEW
apps/front/src/routes/marketing/_components/comparison-migration-timeline.tsx    # NEW
apps/front/src/routes/marketing/_components/comparison-testimonial-card.tsx      # NEW
apps/front/src/routes/marketing/comparison/comparison-page.tsx                   # NEW — page entry
apps/front/src/components/iconify/icon-sets.ts                                   # +2 phosphor icons
```

## Per-section breakdown (canvas → impl)

Sections numbered 1-8 in the canvas. Section 9 (footer) belongs to the
shared marketing layout — not part of this surface.

### 1. Hero

- Eyebrow pill: `vs Buffer · Comparison` (icon `ph:check-circle-fill`).
- H1 (verbatim): "Why teams switching from Buffer choose PublyApp"
- Subhead (verbatim from canvas).
- Primary CTA: "Start free trial" → `FRONT_PATH_NAMES.auth.signup`.
- Secondary CTA: "Book a demo" → `FRONT_PATH_NAMES.marketing.contact`
  (gated on `FEATURES.marketing.contact` for safe fallback to mailto).
- "Trusted by 5,000+ modern teams" mini logo cloud — wordmarks-only,
  matches the existing marketing surface convention (no third-party
  brand SVGs).

Built with the existing `MarketingHero` primitive. The eyebrow pill +
trust strip render as additional content beneath the hero in the page
component (no new primitive).

### 2. Quick verdict band (3 cards)

Three cards: "Best For", "Pricing Model", "Stand-out Feature". Each card
has a PublyApp row (highlighted with green check) and a Buffer row
(neutral dot). Copy is verbatim from canvas.

→ NEW primitive `ComparisonQuickVerdictCards` driven by
`competitor.quickVerdict[]`.

### 3. Detailed feature comparison table

Grouped table (3 groups × 2-3 rows each) with columns: Feature, PublyApp,
Buffer, Notes. Cells render either:

- check icon (green = "yes", muted = "yes but weak"),
- minus icon (gray = "missing"),
- a tag pill (e.g. `Limited`, `$ Extra`).

→ NEW primitive `ComparisonFeatureTable` driven by
`competitor.featureGroups[]`. Cell value type = discriminated union
`{ kind: 'yes' | 'no' | 'tag'; tagLabel?: string }`.

### 4. Pricing comparison (2 cards side-by-side)

Buffer card (neutral) + PublyApp card (recommended, with green border +
"Recommended Scale" pill). Copy verbatim.

→ NEW primitive `ComparisonPricingPair` driven by
`competitor.pricing.{us, them}`.

### 5. Migration callout band

3-step horizontal timeline (1. Connect accounts → 2. Sync data →
3. Publish). Below, "Talk to our migration team" secondary CTA.

→ NEW primitive `ComparisonMigrationTimeline` driven by
`competitor.migrationSteps[]` + `competitor.migrationCta`.

### 6. Testimonials (3 cards)

3 quote cards from "Ex-Buffer" customers. Stars + quote + avatar + role
+ "Ex-Buffer" pill (label is `competitor.exCustomerBadgeLabel`, e.g.
"Ex-Buffer").

→ NEW primitive `ComparisonTestimonialCard` (single card; the page
maps the array to a 3-up grid). Avatars use unsplash URLs already
present in the canvas (existing conventions in `about.ts` use the
same approach).

### 7. FAQ accordion

4 Q/A rows. Reuses the existing `MarketingFaqAccordion` primitive — no
new component needed.

### 8. Bottom CTA band

Reuses existing `CtaBand` primitive (dark surface with green CTA).
"Ready to make the switch?" + "Start 14-day free trial" → `auth.signup`.

## New primitives — justifications

| Primitive | Reused elsewhere? | Why new |
| --- | --- | --- |
| `ComparisonQuickVerdictCards` | No (this surface) | 2-row "us vs them" card layout is unique to comparison surfaces |
| `ComparisonFeatureTable` | No | Grouped feature-vs-product matrix; cell-kind discrim union |
| `ComparisonPricingPair` | No | Side-by-side asymmetric pricing pair (theirs neutral, ours highlighted) |
| `ComparisonMigrationTimeline` | No | 3-step horizontal stepper with dashed connectors |
| `ComparisonTestimonialCard` | No | Star row + quote + author + "Ex-Buffer" badge |

All primitives live in `_components/` so a future Hootsuite/Sprout
comparison page reuses them with zero changes.

## Data model

```ts
// comparisons.ts
export type ComparisonCellKind =
  | { kind: 'yes' }                        // bright green check
  | { kind: 'weak' }                       // muted check (technically yes, but weak)
  | { kind: 'no' }                         // muted minus
  | { kind: 'tag'; label: string };        // pill ("Limited", "$ Extra", ...)

export type ComparisonRow = {
  feature: string;
  us: ComparisonCellKind;
  them: ComparisonCellKind;
  notes: string;
  notesEmphasis?: boolean;                 // e.g. "PublyApp Exclusive"
};

export type ComparisonFeatureGroup = {
  id: string;
  label: string;                           // "Publishing & Scheduling"
  rows: ComparisonRow[];
};

export type ComparisonQuickVerdict = {
  id: string;
  heading: string;                         // "Best For"
  us: { title: string; body: string };
  them: { title: string; body: string };
};

export type ComparisonPricingTier = {
  productName: string;
  price: string;                           // "$49"
  period: string;                          // "/mo"
  highlight: string;                       // "Flat fee. Up to 15 channels included."
  features: { label: string; included: boolean; emphasis?: boolean }[];
  ctaLabel?: string;                       // present only on the "us" tier
};

export type ComparisonMigrationStep = {
  index: number;
  title: string;
  body: string;
  highlight?: boolean;                     // step 2 in the canvas
};

export type ComparisonTestimonial = {
  id: string;
  quote: string;
  authorName: string;
  authorRole: string;
  authorAvatarUrl: string;
  rating: 1 | 2 | 3 | 4 | 5;
};

export type Competitor = {
  slug: 'buffer' /* | 'hootsuite' | 'sprout' | 'later' */;
  displayName: string;                     // "Buffer"
  initial: string;                         // "B"
  hero: { eyebrowPill: string; title: string; subhead: string };
  quickVerdict: ComparisonQuickVerdict[];
  featureGroups: ComparisonFeatureGroup[];
  pricing: { us: ComparisonPricingTier; them: ComparisonPricingTier };
  migrationSteps: ComparisonMigrationStep[];
  migrationCta: { label: string; href: string };
  testimonials: ComparisonTestimonial[];
  testimonialBadgeLabel: string;           // "Ex-Buffer"
  faq: MarketingFaqItem[];
  bottomCta: { eyebrow: string; title: string; subhead: string; ctaLabel: string };
};

export const COMPETITORS: Record<string, Competitor> = { buffer: BUFFER };
```

Page receives `params.competitor`, looks up `COMPETITORS[slug]`. If
unknown, renders the existing `MarketingNotFoundPage` via the same
trick as other gated routes (return null + the marketing layout 404
catch-all already covers it). For initial scope, only `buffer` is keyed,
so any other slug returns `null` and the `*` catch-all renders 404.

## Routing

```ts
// marketing.routes.ts
...(FEATURES.marketing.comparison
  ? [route('compare/:competitor', 'routes/marketing/comparison/comparison-page.tsx')]
  : []),
```

Constants additions:

```ts
// FRONT_PATH_NAMES.marketing
comparison: makePath('compare'),                          // index (reserved, not used yet)
compareCompetitor: (slug = '') => makePath('compare', slug),
```

## Out of scope

- `/compare/hootsuite`, `/compare/sprout`, `/compare/later` (each adds a
  record to `COMPETITORS` later).
- Footer entry for the comparison hub — orchestrator brief defers this.
- Dark-mode-specific styling — page must work in dark mode but uses theme
  palette tokens so this is automatic.
- Top nav entry — explicitly forbidden in this PR.
- Real `<img>` competitor logos (we use letter-mark + initial in a colored
  square, matching the canvas).

## Acceptance criteria

- `VITE_FEATURE_MARKETING_COMPARISON=true` makes `/compare/buffer` render
  the eight canvas sections in order.
- With the flag off (default), `/compare/buffer` 404s through the
  marketing layout's `*` catch-all.
- An unknown slug (e.g. `/compare/hootsuite`) 404s when the flag is on.
- All MUI components, no raw HTML elements, no Tailwind classes, no hex
  literals (theme palette tokens only) — `just check-write` passes.
- `just tsc-front` passes after generating route types.
- Page renders correctly in light and dark mode (theme tokens only).
- New primitives are colocated under `_components/` and not imported
  outside the comparison surface.
