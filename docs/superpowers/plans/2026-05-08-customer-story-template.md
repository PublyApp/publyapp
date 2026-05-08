# Customer Story Template — Implementation Plan

**Issue:** #372 (slice 4)
**Spec:** `docs/superpowers/specs/2026-05-08-customer-story-template-design.md`
**Branch:** `feature/customer-story-template`
**Worktree:** `C:\Users\radan\Documents\_RADAN\Dev\PublyApp\publyapp-5-customer-story`

## Pre-flight (already done)

- Worktree clean, on `feature/customer-story-template`, baseline `just check-write` + `just tsc-front` green.

## Tasks

Each task: implement → run `just check-write && just tsc-front` (both must exit 0) → commit per the message template below.

### Task 1 — Feature flag + path helper

**Files:**
- `apps/front/src/lib/features/flags.ts` — add `customerStories: readFlag('VITE_FEATURE_MARKETING_CUSTOMER_STORIES', false)` under `marketing`.
- `packages/shared-ts/lib/constants.ts` — add `customerStory: (slug: string) => makePath('customer-stories', slug)` to `FRONT_PATH_NAMES.marketing`.

Default flag value MUST be `false`.

**Verify:** `just check-write && just tsc-front`.

**Commit:** `feat(front): add customer-stories feature flag and path helper`

### Task 2 — Customer story data file

**File:** `apps/front/src/routes/marketing/_data/customer-stories.ts` (NEW)

Implements the type definitions in the spec and exports:
- `CustomerStoryMetric`, `CustomerStoryQuote`, `CustomerStoryNarrativeBlock`, `CustomerStoryAboutFact`, `CustomerStory` types
- `CUSTOMER_STORIES: Record<string, CustomerStory>` with one entry: `lumen-studio` (placeholder copy from canvas)
- `getPublishedCustomerStory(slug: string): CustomerStory | undefined` — returns the story IFF `published !== false`
- Reuse the `unsplashCover` URL idiom (inline a small `unsplashPhoto(slug, w, h)` helper here — keep this file self-contained, don't import from `blog.ts`)

Lumen Studio data captures all canvas content verbatim where possible:
- Headline: "How Lumen Studio grew engagement 3x with PublyApp"
- 3 metrics: +3x Engagement Growth, -40% Time on Scheduling, 12 Markets Reached Globally
- 4 narrative blocks: Challenge / Solution / Results / What's next
- Pull quote attributed to Elena Rostova, Head of Strategy
- About: founded 2018, 45 employees, Berlin Germany, 3 integrated tools

**Verify:** `just check-write && just tsc-front` (data-only file; should be silent).

**Commit:** `feat(front): seed customer-stories data with Lumen Studio placeholder`

### Task 3 — Hero + stats band primitives

**Files (NEW):**
- `apps/front/src/routes/marketing/_components/customer-story-hero.tsx`
- `apps/front/src/routes/marketing/_components/customer-story-stats-band.tsx`

`CustomerStoryHero({ story })`:
- 2-col grid (`lg`), single col (`xs`).
- Left: WordmarkCard (small white rounded card with `customerWordmark` text) + "Customer Story" eyebrow → h1 headline → subhead → 3 tag pills (industry / region / plan, with `solar:buildings-bold-duotone`, `ph:globe-bold`, `ph:sparkle-duotone` icons) → primary contained `Button` "Try PublyApp free" linking to `auth.signup` + ghost text-link "Read the full story" anchored to `#story` with `ph:arrow-down` chevron.
- Right: hero `<Image ratio="3/4" />` with rounded-card border, soft `customShadows.z16`-equivalent shadow, full-width.
- Outer wraps as `Box component={m.div} variants={varFade('inUp', { distance: 24 })} initial="initial" animate="animate"`.

`CustomerStoryStatsBand({ metrics })`:
- White card, 3-up divided grid on `md+`, stacked on `xs` with row dividers.
- Each cell: large `Iconify` icon (`color: 'primary.main'`, `width: 28`) → big numeric (`fontSize: { xs: 48, md: 64 }`, weight 800, `color: primary.main`) → uppercase letter-spaced label (`color: text.secondary`).
- Container floats with `mt: { xs: -4, md: -8 }` over the hero/narrative seam to recreate the canvas overlap.
- `borderRadius: '24px'`, `border: '1px solid divider'`, soft drop shadow.
- Wrapped in `MotionViewport` + `Box component={m.div}` with `varFade('inUp')`.

**Verify:** `just check-write && just tsc-front`.

**Commit:** `feat(front): add customer-story hero and stats band primitives`

### Task 4 — Pull quote, narrative, sticky aside primitives

**Files (NEW):**
- `apps/front/src/routes/marketing/_components/customer-story-pull-quote.tsx`
- `apps/front/src/routes/marketing/_components/customer-story-about-aside.tsx`
- `apps/front/src/routes/marketing/_components/customer-story-narrative.tsx`

`CustomerStoryPullQuote({ quote })`:
- White card, `borderRadius: '24px'`, `border: '1px solid divider'`, `p: { xs: 4, md: 5 }`.
- `position: 'relative'` with absolutely-positioned `ph:quotes-fill` icon at `top: -12, left: -8`, `width: 120`, `color: primary.main`, `opacity: 0.10`, `transform: 'rotate(-6deg)'`.
- Inner z-stacked content: italic quote body (`fontSize: { xs: 18, md: 20 }`, weight 500), then attribution row with `<Image ratio="1/1" width={56} sx={{ borderRadius: '50%' }} />` + name + role.
- Wrapped in `MotionViewport` + `Box component={m.div}` with `varFade('inUp')`.

`CustomerStoryAboutAside({ customerName, customerWordmark, about })`:
- Sticky on `lg+` at `top: calc(var(--layout-header-desktop-height) + 32px)`, regular flow on `xs`.
- White card, `borderRadius: '24px'`, padded.
- Wordmark badge (`64×64`) → "About {customerName}" h4 → summary copy → `<List>` of fact rows (icon + label / value, divider on top of each) → integrated tools as small chip pills.

`CustomerStoryNarrative({ blocks, aside, midQuote })`:
- 2-col grid on `lg` (`12/4` ratio), single col (`xs`); aside reorders below narrative on `xs`.
- Main column has `id="story"` for the hero scroll anchor.
- Renders narrative blocks in order. After block index 1, inserts `midQuote` between blocks. Each block: h2 (uses `BLOG_H2_SX`) + paragraphs (use `BLOG_P_SX`).
- Imports `BLOG_H2_SX` and `BLOG_P_SX` from `blog-article-page.tsx` so the prose typography stays in lockstep with blog articles.

**Verify:** `just check-write && just tsc-front`.

**Commit:** `feat(front): add customer-story pull-quote, narrative, and about-aside primitives`

### Task 5 — Route file with slug param + 404 handling + meta

**File (NEW):** `apps/front/src/routes/marketing/customer-stories/customer-story-route.tsx`

Composition:
1. `useParams<{ slug: string }>()`
2. If no slug → throw `Response('Not Found', 404)`
3. `getPublishedCustomerStory(slug)` lookup → if undefined, render `<MarketingErrorView numeral="404" title="Customer story not found" subhead="..." />` (NOT throw — same UX as the marketing 404 catch-all so unknown slugs don't crash, just present the friendly view inside the marketing chrome).
4. If found, render in order:
   - `<CustomerStoryHero />`
   - `<CustomerStoryStatsBand />` inside a `Container maxWidth="lg"` wrapper that lets the band overlap upward.
   - `<CustomerStoryNarrative />` with the about aside as `aside` and the pull-quote as `midQuote`.
   - `<CtaBand>` with title `Want results like {customerName}?` (split into two lines via `\n`).
5. Export `meta`: looks up the story by `params.slug`, returns `[{ title }, { name: 'description' }, og:title/description/image/type:article]`. If not found, returns `[{ title: 'Not Found | ...' }]`.

**Verify:** `just check-write && just tsc-front`.

**Commit:** `feat(front): add customer story route component (Lumen Studio first instance)`

### Task 6 — Wire route into marketing routes tree

**File:** `apps/front/src/routes/_tree/marketing.routes.ts`

Add a flag-gated branch that registers `customer-stories/:slug` pointing at the route file. Place it near the blog `:slug` route for visual grouping. Same `...(FEATURES.marketing.customerStories ? [route(...)] : [])` pattern.

**Verify:** `just check-write && just tsc-front`. With the flag off (default), the route should not be present in typegen output.

**Commit:** `feat(front): register flag-gated customer-stories route`

### Task 7 — Final verification + push + open PR

1. Run final `just check-write && just tsc-front`. Both 0.
2. `git push -u origin feature/customer-story-template`.
3. `gh pr create` with the structured body (Summary / Closes #372 (slice 4) / Test plan).
4. Capture PR URL.

## Commit message template

Each commit:
```
<type>(<scope>): <subject>

Refs #372

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## Risks / watch items

- **Image ratios**: the canvas has the hero image as a tall rectangle. `<Image ratio="3/4" />` should fit; if it visually clips, adjust at the call site (don't change the primitive).
- **Sticky aside on tall narratives**: with only 4 narrative blocks, the aside should not run out of viewport. If on a 4K screen the aside gets parked above the narrative top during scroll-up, that's acceptable; we mirror the blog article aside behavior.
- **`Box component={m.div}` typing**: this pattern is used throughout the marketing surface; relying on the existing TS shape in `cta-band.tsx`. If TS complains, look at `cta-band.tsx` for the imports.
- **TS strict mode on `useParams`**: `slug` is `string | undefined`, so the early-return `if (!slug)` is mandatory before calling `getPublishedCustomerStory`.
