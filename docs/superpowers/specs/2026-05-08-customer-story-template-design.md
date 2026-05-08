# Customer Story Template Design Spec

**Issue:** #372 (AIDesigner batch — slice 4: customer story template)
**Branch:** `feature/customer-story-template`
**Date:** 2026-05-08
**Canvas ID:** `6293f725-c954-43dc-aac7-c4ea8f0cc810`

## Goal

Ship a reusable, data-driven customer story page template at `/customer-stories/:slug/` and seed it with one placeholder customer (Lumen Studio). The template is designed so adding a new customer story = adding one entry to a typed `CUSTOMER_STORIES` map; no per-page boilerplate required.

## Scope decisions (locked)

- **Template-driven**: a single page component renders any story by reading `:slug`, looking up the typed `CustomerStory` record, and rendering all sections from data.
- **Ships ONE story this PR**: Lumen Studio. Placeholder copy + Unsplash imagery; explicitly fictional.
- **No customer-stories index page** in this PR. Defer until 3+ stories exist (revisit when real customers participate).
- **No "More customer stories" / related band** in this PR — would render a 1-of-1 list. Defer alongside the index.
- **Real customer participation is a follow-up issue**, not blocked by this PR. Once a real customer is signed off, swap the data entry; the template doesn't change.
- **404 on unknown slug** via `MarketingErrorView` (404 numeral) — keeps the marketing surface error treatment consistent with `marketing-not-found-page.tsx`.
- **Feature-flag gated** (`marketing.customerStories`, default `false`). Disabled flag → route doesn't register → falls through to marketing 404 catch-all.
- **No path constant for the index** in `FRONT_PATH_NAMES.marketing` (no index page exists). Only the dynamic `customerStory(slug)` helper.

## File map

```
apps/front/src/routes/marketing/
├── _data/
│   └── customer-stories.ts                     # NEW — type + map + helpers
├── _components/
│   ├── customer-story-hero.tsx                 # NEW
│   ├── customer-story-stats-band.tsx           # NEW
│   ├── customer-story-pull-quote.tsx           # NEW
│   ├── customer-story-narrative.tsx            # NEW (h2 + body chunks renderer)
│   └── customer-story-about-aside.tsx          # NEW (sticky sidebar card)
├── customer-stories/
│   └── customer-story-route.tsx                # NEW — slug param + lookup + page assembly

apps/front/src/lib/features/flags.ts            # +1 flag entry
apps/front/src/routes/_tree/marketing.routes.ts # +1 conditional route
packages/shared-ts/lib/constants.ts             # +1 dynamic path helper
```

The page is **assembled inline in `customer-story-route.tsx`** (no extra `customer-story-page.tsx` shell) because the template's "page" is just an ordered composition of the new primitives — there is no shared shell across multiple story routes (yet). When a `/customer-stories` index page is added, it will be a separate route file.

## `CustomerStory` data type

```ts
export type CustomerStoryMetric = {
  id: string;
  iconName: IconifyName;     // e.g. 'ph:trend-up-fill'
  value: string;             // formatted: '+3x', '-40%', '12'
  label: string;             // 'Engagement Growth'
};

export type CustomerStoryQuote = {
  body: string;              // The quote text (without surrounding quotes)
  authorName: string;        // 'Elena Rostova'
  authorRole: string;        // 'Head of Strategy, Lumen Studio'
  authorPhotoSlug: string;   // Unsplash slug
};

export type CustomerStoryNarrativeBlock = {
  heading: string;           // h2
  paragraphs: string[];      // 1..n paragraphs of body copy
};

export type CustomerStoryAboutFact = {
  iconName: IconifyName;
  label: string;             // 'Founded'
  value: string;             // '2018'
};

export type CustomerStory = {
  slug: string;              // 'lumen-studio'
  customerName: string;      // 'Lumen Studio'
  customerWordmark: string;  // 'lumen.' (display string for the wordmark badge)
  industry: string;          // 'Creative Agency'
  region: string;            // 'EU'
  plan: string;              // 'Agency Plan'
  headline: string;          // 'How Lumen Studio grew engagement 3x with PublyApp'
  subhead: string;           // dek
  heroImageSlug: string;     // Unsplash slug for hero photo
  heroImageAlt: string;
  metrics: CustomerStoryMetric[];   // exactly 3 (template assumes 3-up grid)
  narrative: CustomerStoryNarrativeBlock[];
  pullQuote: CustomerStoryQuote;
  about: {
    summary: string;
    facts: CustomerStoryAboutFact[];
    integratedTools: string[];
  };
  // Per-page meta
  seoTitle: string;
  seoDescription: string;
  published?: boolean;       // default true; set false to hide
};

export const CUSTOMER_STORIES: Record<string, CustomerStory> = {
  'lumen-studio': { ... },
};

export const getPublishedCustomerStory = (slug: string): CustomerStory | undefined;
```

## Per-section breakdown (canvas → template)

The canvas has 7 sections; this PR ships the 5 that are story-content-bearing and skips the 2 that don't make sense for a single-customer launch.

### 1. Hero — `<CustomerStoryHero story={story} />`

- 2-column on `lg`, single-column on `xs`.
- **Left** (`lg:col-span-7`): customer wordmark badge + "Customer Story" eyebrow → headline (`<h1>`) → subhead → 3 tag pills (industry / region / plan) → primary CTA "Try PublyApp free" + ghost "Read the full story" anchor link to `#story`.
- **Right** (`lg:col-span-5`): hero photo via `<Image ratio="3/4" />` with rounded card + soft shadow (no grayscale filter — canvas-only effect we drop for cleaner brand alignment).
- Canvas wordmark is rendered as text inside a small white outlined card (NOT a real logo — fictional customer).
- Animation: outer wraps as `Box component={m.div} variants={varFade('inUp', { distance: 24 })} initial="initial" animate="animate"` with a subtle stagger between text and image (image gets `transition: { delay: 0.1 }` via opts).

### 2. Stats band — `<CustomerStoryStatsBand metrics={story.metrics} />`

- White card, 3-up divided grid on `md+`, stacked on `xs`.
- Each cell: large icon (color `primary.main`) → big numeric (h3-sized, color `primary.main`, weight 800) → uppercase letter-spaced label (color `text.secondary`).
- Floats `mt: -8` over the hero/narrative seam (reuses the canvas overlap idiom), `borderRadius: 24`, soft shadow.
- Animation: `varFade('inUp')` on viewport enter via `MotionViewport`.

### 3. Narrative + sticky sidebar — `<CustomerStoryNarrative blocks={story.narrative} aside={...} />`

- 2-column grid on `lg`, single column on `xs`. Sidebar order is reversed on `xs` (narrative first).
- **Sidebar (`lg:col-span-4`)**: sticky `<CustomerStoryAboutAside about={story.about} customerName customerWordmark />`
  - Wordmark card → "About {customerName}" h4 → summary copy → fact list (founded / team size / HQ / integrated tools) with iconified labels and divider rows.
  - Sticky at `top: calc(var(--layout-header-desktop-height) + 32px)` matching the blog article aside.
- **Main (`lg:col-span-8`)**: per `narrative` block: h2 + paragraphs, with the **pull quote** rendered between block index 1 and 2 (i.e. right after "The Solution"). The placement is hardcoded in the template — the canvas places it there, and the data shape only carries one quote.
- Reuse `BLOG_H2_SX` and `BLOG_P_SX` from `blog-article-page.tsx` so prose typography is identical across blog and customer stories. (No data-driven typography variants — not worth the abstraction.)
- Top of main column gets an `id="story"` anchor so the hero's "Read the full story" link works.

### 4. Pull quote — `<CustomerStoryPullQuote quote={story.pullQuote} />`

- White card with subtle border, `borderRadius: 24`, internal padding `{ xs: 4, md: 5 }`.
- Big translucent `ph:quotes-fill` icon background-positioned absolute (rotated -6deg, `color: primary.main`, opacity ~0.10) — direct port of the canvas idiom.
- Body: large italic text, weight 500, `color: text.primary`.
- Attribution: avatar (`<Image ratio="1/1" width={56} borderRadius="50%" />`) + name + role.
- Animation: `varFade('inUp')` via `MotionViewport`.

### 5. CTA band

- Reuse the existing `<CtaBand>` primitive (already used by the blog article page).
- Title interpolates the customer name: `Want results like {customerName}?` → uses `\n`-split title to render on two lines (matching `<CtaBand>` API).

### Sections explicitly skipped this PR

- **"What they shipped" gallery band** — implies real customer screenshots / mockups. With placeholder Unsplash, it adds visual filler with zero narrative weight. Defer until real customer assets land.
- **"More customer stories" band** — would render a 1-item list (or empty). Defer until 3+ stories.

These omissions are noted in the PR description so reviewers understand why the canvas is partially mapped.

## New primitives (recap)

- `customer-story-hero.tsx` — exports `CustomerStoryHero({ story })`. Internal-only `WordmarkCard` sub-component.
- `customer-story-stats-band.tsx` — exports `CustomerStoryStatsBand({ metrics })`. Renders 3-up overlap card.
- `customer-story-pull-quote.tsx` — exports `CustomerStoryPullQuote({ quote })`. Card + big background quote icon.
- `customer-story-narrative.tsx` — exports `CustomerStoryNarrative({ blocks, aside, midQuote? })`. Owns the 2-col + sticky-sidebar layout. The pull quote is passed as `midQuote` and inserted between blocks[1] and blocks[2].
- `customer-story-about-aside.tsx` — exports `CustomerStoryAboutAside({ customerName, customerWordmark, about })`. Sticky on `lg+`, regular flow on `xs`.

All primitives are arrow components, MUI v6 only, `sx` prop styling, theme palette tokens (`primary.main`, `text.primary`, `text.secondary`, `divider`, `background.paper`, `background.neutral`).

## Out of scope

- Multiple customer stories (only Lumen Studio ships)
- `/customer-stories` index page
- "More customer stories" related band
- "What they shipped" gallery band
- Real customer participation (separate issue)
- Image hover animations beyond shared presets
- Reading-progress bar (canvas had one — out of scope; defer)
- Share buttons in the sidebar (canvas had them — defer; blog article already owns the share row pattern, no need to duplicate here)
- Footer / topbar changes (already covered by `marketing-layout.tsx`)
- New iconify registrations (use existing `ph:`, `solar:` icons only)
- Dark-mode-specific overrides beyond what theme tokens already provide

## Acceptance criteria

1. `VITE_FEATURE_MARKETING_CUSTOMER_STORIES=true` + `/customer-stories/lumen-studio/` renders the full template with hero, stats, narrative, pull quote, and CTA band.
2. `/customer-stories/nonexistent/` (with flag on) renders `<MarketingErrorView numeral="404" ... />` — does not crash.
3. With flag off (default), both `/customer-stories/lumen-studio/` and `/customer-stories/nonexistent/` fall through to the marketing layout's catch-all 404.
4. `FRONT_PATH_NAMES.marketing.customerStory('lumen-studio')` returns `/customer-stories/lumen-studio`.
5. `just check-write` exits 0; `just tsc-front` exits 0.
6. No raw HTML elements (`<div>`, `<h1>`, `<img>`, etc.) — all MUI primitives or the project `<Image>` component.
7. No Tailwind classes; no `className` for styling (only animation hooks like `dest-icon` if mirrored from existing patterns).
8. All colors via theme tokens; no `#hex` literals except dark-surface CTAs already canonized in `blog-article-page.tsx` (`#242424` on `AsideTrialCard`-style elements). The hero / stats / narrative use only theme tokens.
9. All content imagery uses `<Image>` primitive with `ratio` prop.
10. Animation uses `varFade('inUp', { distance: 24 })` + `MotionViewport` (entry-on-scroll) and the `Box component={m.div}` pattern.
