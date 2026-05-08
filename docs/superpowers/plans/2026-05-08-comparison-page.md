# Plan — Comparison page (vs Buffer)

Date: 2026-05-08
Spec: docs/superpowers/specs/2026-05-08-comparison-page-design.md
Branch: feature/comparison-page
Issue: #372

## Tasks

### 1. Add feature flag, path entries, and required icons

- `apps/front/src/lib/features/flags.ts` — add
  `comparison: readFlag('VITE_FEATURE_MARKETING_COMPARISON', false)`.
- `packages/shared-ts/lib/constants.ts` — add
  `comparison: makePath('compare')` and
  `compareCompetitor: (slug = '') => makePath('compare', slug)` to
  `FRONT_PATH_NAMES.marketing`.
- `apps/front/src/components/iconify/icon-sets.ts` — add
  `ph:star-fill` and `ph:arrows-left-right-bold` (used by testimonial
  ratings and the migration timeline middle node respectively).
- Verify: `just check-write && just tsc-front` (both exit 0).

Commit:
```
feat(front): add marketing comparison feature flag and path entries
```

### 2. Build comparison data file

- `apps/front/src/routes/marketing/_data/comparisons.ts` with the type
  graph from the spec (`Competitor`, `ComparisonRow`, etc.) and the
  `BUFFER` instance + `COMPETITORS` lookup.
- Copy verbatim from canvas where the canvas had real copy; lift the
  testimonial avatar URLs from the canvas (unsplash) since other
  marketing data files (about.ts) use the same pattern.
- Verify: `just tsc-front` (no consumers yet, so just type sanity).

Commit:
```
feat(front): seed marketing comparison data with Buffer competitor
```

### 3. Build the five new primitives

- `_components/comparison-quick-verdict-cards.tsx`
- `_components/comparison-feature-table.tsx`
- `_components/comparison-pricing-pair.tsx`
- `_components/comparison-migration-timeline.tsx`
- `_components/comparison-testimonial-card.tsx`

Each uses MUI v6 (`Box`, `Stack`, `Typography`, `Container` only as
needed), `sx` prop with theme palette tokens, `Iconify` with already-
registered names. No raw HTML, no hex literals. Animation uses
`varFade('inUp', { distance: 24 })` via `Box component={m.div}` +
`MotionViewport` consistent with `cta-band.tsx`/`security-page.tsx`.

Verify after each component: `just check-write && just tsc-front`.

Commit (one commit, all 5 primitives — they're a coherent set, no
consumer until task 4):
```
feat(front): add comparison-page primitives (verdict, table, pricing, timeline, testimonial)
```

### 4. Build the page component + register the route

- `apps/front/src/routes/marketing/comparison/comparison-page.tsx`
  - Reads `useParams()` competitor slug, looks up `COMPETITORS[slug]`,
    returns `null` (→ catch-all 404) on miss.
  - Composes: `MarketingHero` → quick-verdict cards → feature table →
    pricing pair → migration timeline → testimonials grid →
    `MarketingFaqAccordion` → `CtaBand`.
  - Exports `meta` returning a `MetaDescriptor[]` derived from the
    selected competitor (mirrors `blog-article-route.tsx`).
- `apps/front/src/routes/_tree/marketing.routes.ts` — add
  `route('compare/:competitor', ...)` gated on
  `FEATURES.marketing.comparison`.
- Verify: `just check-write && just tsc-front`.

Commit:
```
feat(front): wire /compare/:competitor route behind comparison flag
```

### 5. Final verification + open PR

- Final `just check-write && just tsc-front` (both must exit 0).
- `git push -u origin feature/comparison-page`.
- `gh pr create --title "feat(front): comparison page (vs Buffer)"
  --body <heredoc>`.

## Notes / risks

- The orchestrator brief mentions `marketingPath()` and a trailing-slash
  marketing convention; neither exists in this branch. Consistency wins
  → using `makePath()` like every other marketing entry.
- The orchestrator brief mentions `buildSeoMeta`; not in this branch
  (lives in #405). Plain `MetaDescriptor[]` export, mirrored on
  `blog-article-route.tsx`.
- The canvas has a "Recommended Scale" pill on the PublyApp pricing
  card that uses primary green — fine, that's already a palette token.
- The canvas uses a navy bottom CTA. Existing `CtaBand` already uses
  `#242424` as the dark surface; visually equivalent; reuse as-is.
