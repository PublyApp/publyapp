# Feature Page Template (with Scheduling) — Design

> **Status:** approved (2026-05-08)
> **Issue:** #372 (AIDesigner batch — slice 3)
> **Canvas:** AIDesigner `d205ab66-1cd1-4f0c-b03f-d288bf553121` (Scheduling Feature)

## Goal

Ship a single, data-driven **feature page template** that renders a marketing
deep-dive for any product feature. Mount it on the dynamic route
`/features/:slug/` and ship **Scheduling** as the first instance. Future
features (analytics, automation, etc.) become future PRs that just append
new entries to the `FEATURES_DATA` map — no new route, no new page file.

## Locked scope decisions

- **Template-driven**, not bespoke per-feature. One page component reads a
  typed `Feature` record from `FEATURES_DATA`.
- Ships **exactly one feature**: `scheduling`. Other features are out of
  scope and explicitly future PRs.
- **No `/features` index** — the issue scope is the template + first
  instance. Direct hits to `/features` are not supported in this slice.
- **Unknown slug** → `MarketingErrorView` 404 (already shipped in
  `marketing-not-found-page.tsx` — same primitive, same UX).
- **Feature flag default OFF** (`marketing.featurePages`) — opt-in via
  `VITE_FEATURE_MARKETING_FEATURE_PAGES=true`.
- **No footer changes** — Scheduling is not yet linked from the global
  footer; that's a follow-up once more features land.

## File map

```
apps/front/src/lib/features/flags.ts                                  (edit)  + featurePages flag
apps/front/src/routes/_tree/marketing.routes.ts                       (edit)  register dynamic route
apps/front/src/routes/marketing/_data/features.ts                     (new)   Feature type + FEATURES_DATA map
apps/front/src/routes/marketing/_components/feature-hero.tsx          (new)   split hero (eyebrow, headline, subhead, dual CTA, calendar mockup)
apps/front/src/routes/marketing/_components/feature-step-band.tsx     (new)   "How it works" 3-step band
apps/front/src/routes/marketing/_components/feature-benefit-grid.tsx  (new)   icon + title + body grid (6 cards)
apps/front/src/routes/marketing/_components/feature-screenshot.tsx    (new)   browser-chrome mockup wrapping <Image>
apps/front/src/routes/marketing/_components/feature-comparison.tsx    (new)   3-up comparison strip ("vs spreadsheets / native / legacy")
apps/front/src/routes/marketing/_components/feature-quote.tsx         (new)   blockquote card with attribution
apps/front/src/routes/marketing/features/feature-page.tsx             (new)   route component: param → data → template; meta export
packages/shared-ts/lib/constants.ts                                   (edit)  + marketing.featurePage(slug) helper
```

## `Feature` data type

Typed shape that drives every section of the template. All copy lives in the
data record, not the components — adding a new feature is purely a data PR.

```ts
export type FeatureCta = {
  label: string;
  href: string;
};

export type FeatureBenefit = {
  id: string;
  title: string;
  body: string;
  icon: IconifyName;
};

export type FeatureStep = {
  id: string;
  title: string;
  body: string;
};

export type FeatureComparisonItem = {
  id: string;
  title: string;
  body: string;
  icon: IconifyName;
  tone: 'danger' | 'warning' | 'primary';
};

export type FeatureQuote = {
  body: string;
  authorName: string;
  authorRole: string;
  authorAvatarUrl: string;
};

export type Feature = {
  slug: string;                  // URL slug, primary key
  metaTitle: string;             // <title> + og:title
  metaDescription: string;       // og:description
  hero: {
    eyebrow: string;
    title: string;               // supports \n for visual line break
    subhead: string;
    primaryCta: FeatureCta;
    secondaryCta: FeatureCta;
    socialProofText: string;     // "Used by 10,000+ teams weekly"
  };
  steps: {
    title: string;               // section heading
    items: [FeatureStep, FeatureStep, FeatureStep];
  };
  benefits: {
    eyebrow: string;
    title: string;
    items: FeatureBenefit[];     // 3, 6, or 9 cards (display in 3-col grid)
  };
  screenshot: {
    eyebrow: string;
    title: string;
    imageSlug: string;           // unsplash slug for unsplashCover()
    imageAlt: string;
  };
  comparison: {
    title: string;
    items: [FeatureComparisonItem, FeatureComparisonItem, FeatureComparisonItem];
  };
  quote: FeatureQuote;
  cta: {
    eyebrowLabel: string;
    title: string;
    subhead: string;
    ctaLabel: string;
    ctaHref: string;
    microcopy: string;
  };
};

export const FEATURES_DATA: Record<string, Feature> = {
  scheduling: { /* … verbatim canvas copy … */ },
};

export const getFeature = (slug: string | undefined): Feature | undefined => {
  if (!slug) return undefined;
  return FEATURES_DATA[slug];
};
```

## Per-section breakdown (template ↔ data)

Section order mirrors the canvas:

| # | Section            | Component                | Data field          |
|---|--------------------|--------------------------|---------------------|
| 1 | Hero (split, copy + visual decoration) | `FeatureHero`            | `hero`              |
| 2 | "How it works" 3-step band | `FeatureStepBand`        | `steps`             |
| 3 | Benefit grid (3-col, ph icons) | `FeatureBenefitGrid`     | `benefits`          |
| 4 | Screenshot showcase (browser chrome + `<Image>`) | `FeatureScreenshot`      | `screenshot`        |
| 5 | Comparison strip (3-up, "vs X / Y / Z") | `FeatureComparison`      | `comparison`        |
| 6 | Customer quote     | `FeatureQuote`           | `quote`             |
| 7 | Bottom CTA band    | reuse `CtaBand`          | `cta`               |

The canvas also has a logo strip (#2) and a use-cases tabs section (#6).
Both are **out of scope for this slice** — they require client-side state
(tab switching) and partner logo assets we don't have. Future PR.

## New primitives

All new primitives live in `apps/front/src/routes/marketing/_components/`,
follow MUI v6 + `sx` rules, and accept their data via props. No new
animation variants — uses the existing `varFade('inUp', { distance: 24 })`
entry animation and `hoverLift()` for cards.

- **`FeatureHero`** — full-width section, 7/5 column split on `lg+`, single
  column on `xs–md`. Left: eyebrow pill, h1 title, subhead, dual CTA stack,
  social-proof microcopy with stacked avatars. Right: a CSS-only stylized
  "calendar mockup" (no external assets) using `Box` + `Stack` to evoke the
  product UI; rotates -2°/+2° on hover via `hoverLift({ y: 0, scale: 1.02 })`.
- **`FeatureStepBand`** — neutral-tinted band, centered title, then 3 numbered
  step circles (1/2/3) connected by a dashed horizontal line on `md+`.
  Middle step uses `bgcolor: primary.main` + `color: common.white` to
  highlight.
- **`FeatureBenefitGrid`** — `ContentBand` wrapper, then a 3-col responsive
  grid of cards. Each card: 48×48 rounded icon plate (`primary.lighter` bg
  + `primary.main` icon), title (h3), body. Hover: `hoverLift({ y: -4 })`.
- **`FeatureScreenshot`** — centered eyebrow + h2, then a max-1000px wide
  browser-chrome mockup: 36px-tall fake macOS title bar (3 colored dots +
  monospace URL), then a 16:9 `<Image>` rendering the screenshot via
  `unsplashCover(imageSlug, { w: 1600, h: 900 })`. Subtle outer shadow.
- **`FeatureComparison`** — light-neutral background band, centered h2,
  then 3 columns separated by vertical dividers on `md+` / horizontal on
  `xs`. Each item: small tinted icon (red/orange/green per `tone`), title,
  short body.
- **`FeatureQuote`** — centered max-720px card with subtle primary-tinted
  background, decorative `ph:quotes-fill` watermark, blockquote, then
  `<Box component="img">`-style avatar (32px) + name + role.

## Out of scope

- Other feature pages (analytics, automation, AI writer, …) — future
  data-only PRs append to `FEATURES_DATA`.
- `/features` index page — no use case until 2+ features exist.
- Logo strip, partner brand assets — no real assets.
- Use-cases tabs (Agencies / Creators / E-commerce) — requires client
  state + 3 sub-mockups; defer.
- Footer/topbar links to `/features/scheduling` — defer until Scheduling
  is a first-class navigation item.
- Analytics tracking on the page — covered by global pageview tracking
  already in the marketing layout.

## Acceptance criteria

- `VITE_FEATURE_MARKETING_FEATURE_PAGES=true` → `/features/scheduling/`
  renders the full Scheduling page using the canvas copy.
- Flag default (off) → `/features/scheduling/` falls through to
  `MarketingNotFoundPage` (existing 404 surface).
- Flag on, unknown slug (`/features/nonexistent/`) →
  `MarketingErrorView` 404 with `numeral="404"`.
- Page-level `meta` returns the feature's `metaTitle` / `metaDescription`
  (`{title} | PublyApp` format), with og: variants populated.
- All sections render verbatim canvas copy.
- `just check-write` and `just tsc-front` both pass.
- No raw HTML elements (`<div>`, `<h1>`, `<img>` for content) — MUI v6
  primitives + `<Image>` for the screenshot.
- No Tailwind classes, no `className` for styling — `sx` everywhere.
- Page uses theme palette tokens (`primary.main`, `text.primary`, etc.)
  for everything except the canvas brand-green decorative gradient (matches
  the existing marketing surface convention).
- Adding a new feature is a single-file data PR (`features.ts` only).
