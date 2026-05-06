# Phase 5 — Marketing Changelog Design

**Status:** Spec draft (2026-05-06)

**Goal:** Ship `/changelog` and `/changelog/:year` under `MarketingLayout`, gated behind the existing `FEATURES.marketing.changelog` flag. Single-page vertical timeline of releases (no per-release detail pages), year-as-pagination via path segments, body content powered by the existing `blog-content-elements.tsx` kit. Closes the last unfinished page from the original 11-page Phase 1–4 scope (issue #344).

**Predecessors:**

- `2026-04-30-marketing-supporting-pages-design.md` (parent decomposition)
- `2026-05-01-marketing-pricing-design.md` (Phase 1)
- `2026-05-02-marketing-legal-design.md` (Phase 2)
- `2026-05-03-marketing-company-trio-and-404-design.md` (Phase 3)
- `2026-05-03-marketing-blog-design.md` (Phase 4 — and the source of `blog-content-elements.tsx` reused here)

**Canvas references:**

- Changelog: `f0f2cb18-b79f-41b7-935a-da9100190f1e` ("Changelog", AIDesigner v1, light only — derive dark from theme tokens per parent-spec pivot)

---

## Scope

### In scope

- Two routes:
  - `/changelog` — bare URL, redirects to `/changelog/{latest year}` via React Router loader
  - `/changelog/:year` — renders that year's entries
- Both routes gated by `FEATURES.marketing.changelog` (flag already exists; flip on at launch)
- `_data/changelog.tsx` — single source of truth: types, entries (placeholder), helpers (`getAvailableYears`, `getLatestYear`, `getEntriesForYear`, `getPublishedEntries`)
- 8-type entry classification: `feature` / `improvement` / `fix` / `performance` / `security` / `breaking` / `deprecation` / `documentation` (multi-tag supported per entry)
- Per-entry anchor + click-to-copy on the version pill (`#v1.4.2`)
- Per-entry optional `relatedBlogSlug` → "Read full release notes →" link to a companion blog article (only renders when set)
- Year chips as **navigation** (not filtering): each chip is a `<RouterLink>` to `/changelog/{year}`. No "All" option. Default = most recent year with entries. Years derived from data.
- Body content composes from the existing `apps/front/src/routes/marketing/_components/blog-content-elements.tsx` kit (lead/h2-4/p/code/callout/figure/etc.) — no parallel "changelog-elements" file
- Two new flags (default OFF) for opt-in surface elements:
  - `marketing.changelogStats` — controls the 3-stat row under the hero
  - `marketing.changelogSubscribe` — controls the email-subscribe band
- Per-route SEO `meta` export (title + description per year)
- Sticky date column on `lg+` (140px wide), inline date above content on mobile
- Reuse existing primitives: `MarketingHero`, `CtaBand`, `MarketingErrorView` (via the catch-all 404)
- Footer "Changelog" link entry already wired in Phase 3 (appears when `FEATURES.marketing.changelog` is on)
- Validation: `:year` must match `/^\d{4}$/` AND exist in `getAvailableYears()`. Anything else → 404 via the marketing catch-all.

### Out of scope (explicitly)

- **Per-release detail pages** (`/changelog/v1.4.2`) — entries stand alone on the index. If a release deserves a deep-dive, link to a blog post via `relatedBlogSlug`.
- **Real backend / CMS** — no Sanity/Contentful. Static data in-repo. Migrate when content needs justify it.
- **MDX bodies** — bodies are inline JSX in the data module (`changelog.tsx`), composing from `blog-content-elements.tsx`. Same idiom as legal pages and blog articles.
- **Search** across releases.
- **Filter by entry type** (feature/fix/etc) — year nav is the only navigation aid in v1.
- **RSS / Atom feed** — out for v1. Easy to add as a static `_routes/changelog.rss.xml` builder later.
- **Subscribe form backend** — flag exists, off by default; the form is `preventDefault()` no-op when rendered. Wire an endpoint before flipping the flag in production.
- **Stats from real data** — flag exists, off by default; numbers are hardcoded props for v1. Source from a real API or status page when wiring on.
- **OG image per year** — would need an image generator. Per-year `meta` exports skip `og:image` for v1.
- **Per-entry framer-motion entry animations** (canvas's "waterfall reveal" with staggered delays) — skip for v1; add only if visual review demands it post-implementation.
- **Pagination *within* a year** — all entries in a year render at once. With placeholder data this is fine; revisit when a single year exceeds ~30 entries.
- **404 popular-destinations entry for `/changelog`** — same call as the blog: `DEFAULT_POPULAR_DESTINATIONS` only promotes shipped, evergreen pages. Add when changelog has actual content worth promoting.

### Follow-ups (out of phase, but worth noting)

- **Topbar nav — add Changelog link** — once Changelog is enabled and content exists, the marketing topbar should add a "Changelog" entry alongside the existing anchor links. Same call as the blog topbar follow-up.
- **`relatedBlogSlug` → 404 if blog post is unpublished or missing** — entries currently link blindly. Add a build-time validator or a defensive runtime check that warns in dev when a `relatedBlogSlug` doesn't resolve to a published `BlogPost`.
- **Promote `copyToClipboard` to a shared util** — the helper already lives inline in `blog-article-page.tsx`'s `ShareRow`. Extract to `apps/front/src/lib/clipboard.ts` so the new `<VersionPill>` can reuse it. Tracked in the implementation plan.

---

## Architecture

### Routes

In `apps/front/src/routes/_tree/marketing.routes.ts`, append (inside the existing `FEATURES.marketing.changelog` flag-guard spread):

```ts
...(FEATURES.marketing.changelog
  ? [
      route('changelog', 'routes/marketing/changelog/changelog-redirect-route.tsx'),
      route('changelog/:year', 'routes/marketing/changelog/changelog-page.tsx'),
    ]
  : []),
```

When the flag is off, both routes fall through to the catch-all `route('*', ...)` and 404 cleanly.

### Bare-URL redirect

`apps/front/src/routes/marketing/changelog/changelog-redirect-route.tsx`:

- Defines a React Router `loader` that:
  1. Calls `getLatestYear()` from `_data/changelog.tsx`
  2. If a year is returned → `throw redirect('/changelog/{year}')`
  3. If `null` (no published entries) → render an empty-state page (no redirect) showing "No releases yet — check back soon." with a back-to-home link
- The route component itself renders the empty state for the no-entries branch only.

### Year route

`apps/front/src/routes/marketing/changelog/changelog-page.tsx`:

- Reads `:year` from `useParams<{ year?: string }>()`
- Validates:
  1. `year` defined
  2. matches `/^\d{4}$/`
  3. `parseInt(year, 10)` is in `getAvailableYears()`
- Any failure → `throw new Response('Not Found', { status: 404 })` (caught by `MarketingLayout`'s `ErrorBoundary` → renders `MarketingErrorView`)
- Composes the page sections; exports `meta` with year-aware title + description.

### Data module

`apps/front/src/routes/marketing/_data/changelog.tsx` (note `.tsx` — entries carry JSX bodies):

```ts
import type { ReactNode } from 'react';

export type ChangelogEntryType =
  | 'feature'
  | 'improvement'
  | 'fix'
  | 'performance'
  | 'security'
  | 'breaking'
  | 'deprecation'
  | 'documentation';

export type ChangelogEntry = {
  version: string;            // 'v1.4.2' — also serves as anchor id when slugified to lowercase + dot-replaced
  date: string;               // ISO 'YYYY-MM-DD'
  title: string;
  types: ChangelogEntryType[];
  body: ReactNode;            // inline JSX, composed from blog-content-elements.tsx
  heroImageSlug?: string;     // optional Unsplash slug for an inline image (uses BlogFigure)
  relatedBlogSlug?: string;   // optional companion blog post → 'Read full release notes →' link
  published?: boolean;        // hide without deleting (mirrors blog pattern)
};

export const CHANGELOG_ENTRIES: ChangelogEntry[] = [/* placeholder data, sorted desc by date */];

export const getPublishedEntries = (): ChangelogEntry[] => /* filter published !== false */;
export const getAvailableYears = (): number[] => /* deduped, desc, from getPublishedEntries() */;
export const getLatestYear = (): number | null => /* getAvailableYears()[0] ?? null */;
export const getEntriesForYear = (year: number): ChangelogEntry[] => /* filter + sort desc */;
export const slugifyVersion = (version: string): string => /* 'v1.4.2' → 'v1-4-2' (anchor-safe) */;
```

**Anchor format**: `slugifyVersion('v1.4.2') === 'v1-4-2'` so the URL fragment `#v1-4-2` is HTML-id-safe (dots are valid but escaping them in CSS selectors is ugly; underscores would also work but dashes match the rest of our slug conventions).

### Feature flags

In `apps/front/src/lib/features/flags.ts`, extend the marketing branch:

```ts
marketing: {
  // existing
  changelog: readFlag('VITE_FEATURE_MARKETING_CHANGELOG', true),
  // new
  changelogStats: readFlag('VITE_FEATURE_MARKETING_CHANGELOG_STATS', false),
  changelogSubscribe: readFlag('VITE_FEATURE_MARKETING_CHANGELOG_SUBSCRIBE', false),
  // …other marketing flags
},
```

Defaults: `changelog` stays `true` (page is shippable), `changelogStats` and `changelogSubscribe` default `false` (lean ship, opt-in via env when ready).

---

## Components

### Page composition (top → bottom)

```
ChangelogPage (route)
├── MarketingHero (existing)        — eyebrow chip + h1 + subhead, no CTAs
├── ChangelogStats (gated)          — 3 stat cards (releases shipped / features YTD / uptime)
├── ChangelogYearChips              — pill row, only renders if availableYears.length > 1
├── ChangelogTimeline               — Container maxWidth="md" (~900px)
│   └── ChangelogEntry[]            — one per published entry for that year
│       ├── (sticky) date column    — desktop only (lg+), 140px
│       └── content column
│           ├── VersionPill         — '#v1-4-2' mono, copy-on-click + scroll-into-view
│           ├── EntryTypePill[]     — one per type tag, multi-tag supported
│           ├── h3 title
│           ├── body (entry.body)   — JSX from blog-content-elements
│           ├── BlogFigure (opt)    — heroImageSlug → wrapped in BlogFigure
│           └── related-blog link   — relatedBlogSlug → 'Read full release notes →'
├── ChangelogSubscribeBand (gated)  — email + button, preventDefault no-op
└── CtaBand (existing)              — dark #242424, 'Start using the latest features today'
```

### New files

```
apps/front/src/routes/marketing/_data/changelog.tsx
apps/front/src/routes/marketing/changelog/changelog-page.tsx
apps/front/src/routes/marketing/changelog/changelog-redirect-route.tsx
apps/front/src/routes/marketing/_components/changelog-entry.tsx
apps/front/src/routes/marketing/_components/changelog-stats.tsx
apps/front/src/routes/marketing/_components/changelog-year-chips.tsx
apps/front/src/routes/marketing/_components/changelog-subscribe-band.tsx
apps/front/src/routes/marketing/_components/version-pill.tsx
apps/front/src/routes/marketing/_components/entry-type-pill.tsx
apps/front/src/lib/clipboard.ts                                         ← extracted helper
```

### Modified files

```
apps/front/src/routes/_tree/marketing.routes.ts          ← add 2 routes
apps/front/src/lib/features/flags.ts                     ← add 2 flags
apps/front/src/routes/marketing/_components/blog-article-page.tsx  ← swap inline copyToClipboard for the new shared util
```

### Component contracts

| Component | Props | Notes |
|---|---|---|
| `ChangelogHero` | none (composes `MarketingHero` with hardcoded labels) | Eyebrow "Changelog", h1 "What's new in PublyApp", subhead "Product updates, fixes, and behind-the-scenes wins. Updated weekly." |
| `ChangelogStats` | `{ releasesShipped: number; featuresYtd: number; uptime: string }` | Hardcoded numbers in caller for v1 |
| `ChangelogYearChips` | `{ years: number[]; activeYear: number }` | Each chip is `<RouterLink to="/changelog/{year}">`, active style on `activeYear`. Returns `null` if `years.length <= 1`. |
| `ChangelogTimeline` | `{ entries: ChangelogEntry[] }` | Renders dashed-line container; defensively renders an empty state if `entries.length === 0` |
| `ChangelogEntry` | `{ entry: ChangelogEntry }` | Owns the date column (sticky on lg+), node dot, content column |
| `VersionPill` | `{ version: string }` | Renders `#vX-Y-Z` mono pill with copy-icon. Click → preventDefault, copy absolute URL, swap icon to check for 2s, smooth-scroll into view. |
| `EntryTypePill` | `{ type: ChangelogEntryType }` | Lookup in `ENTRY_TYPE_VISUALS` map for bg/text/label |
| `ChangelogSubscribeBand` | none | Form is `preventDefault()`. Email input + Subscribe button. |

### Entry-type visual map

Defined as a `Record<ChangelogEntryType, { bg: string; color: string; label: string }>` in `entry-type-pill.tsx`:

| Type | bg | color | label |
|---|---|---|---|
| `feature` | `primary.main` (#10B981) | `common.white` | Feature |
| `improvement` | `info.lighter` | `info.dark` | Improvement |
| `fix` | `background.neutral` | `text.primary` | Fix |
| `performance` | `secondary.lighter` | `secondary.dark` | Performance |
| `security` | `error.lighter` | `error.dark` | Security |
| `breaking` | `#D97706` (warning amber, hardcoded) | `common.white` | Breaking |
| `deprecation` | `text.disabled` | `common.white` | Deprecation |
| `documentation` | `info.lighter` | `info.dark` | Docs |

Hardcoded `#D97706` for `breaking` is added to the marketing-surface-conventions.md "approved hardcoded-color exceptions" list.

### Shared `copyToClipboard` extraction

The helper currently inline at `blog-article-page.tsx` (`copyToClipboard(text: string): Promise<boolean>`) moves to `apps/front/src/lib/clipboard.ts` with the same signature. `blog-article-page.tsx`'s `ShareRow` is updated to import from the new location. The new `<VersionPill>` consumes the same util.

---

## Data flow

### Initial load (`/changelog/2026`)

1. React Router matches `changelog/:year` → `changelog-page.tsx`
2. `useParams()` → `{ year: '2026' }`
3. Validate: 4-digit ✓ AND in `getAvailableYears()` ✓
4. Render: hero → (stats?) → year chips → timeline (`getEntriesForYear(2026)`) → (subscribe?) → CtaBand
5. `meta` export emits `title: 'Changelog · 2026 | PublyApp'`, year-aware description

### Bare URL (`/changelog`)

1. React Router matches `changelog` → `changelog-redirect-route.tsx`
2. `loader` calls `getLatestYear()`
3. If non-null → `throw redirect('/changelog/{year}')` (browser sees 302, lands on year route)
4. If null → loader returns; route renders empty-state component

### Year switch (chip click)

1. `<RouterLink to="/changelog/2025">` triggers RR navigation
2. RR's default scroll restoration scrolls to top
3. Same render path as initial load with new year

### Anchor click (version pill)

1. `<a href="#v1-4-2">` + `onClick`:
   1. `event.preventDefault()`
   2. Build absolute URL `${window.location.origin}/changelog/2026#v1-4-2`
   3. `await copyToClipboard(url)` → swap icon to `ph:check-bold` for 2 seconds
   4. `entry.scrollIntoView({ behavior: 'smooth', block: 'start' })` — entry has `scrollMarginTop: calc(var(--layout-header-desktop-height) + 24px)` so it clears the topbar

### Direct anchor URL load (`/changelog/2026#v1-4-2`)

1. Page renders normally (year route validates, loads entries)
2. Browser auto-scrolls to `#v1-4-2` after first paint
3. `scrollMarginTop` ensures the entry sits below the fixed topbar

---

## Error handling

| Scenario | Behavior |
|---|---|
| `/changelog/foo` (non-numeric) | `throw new Response('Not Found', { status: 404 })` → `MarketingLayout`'s `ErrorBoundary` renders `MarketingErrorView` |
| `/changelog/2050` (not in `getAvailableYears()`) | Same — 404 |
| `/changelog/2026` valid, `getEntriesForYear(2026).length === 0` | Render the page with a defensive empty-state in the timeline area ("No releases for this year"). Shouldn't occur normally — `getAvailableYears()` derives from published entries — but covered defensively. |
| `/changelog` bare with `getLatestYear() === null` (no published entries anywhere) | Loader does NOT redirect; route renders empty-state component ("No releases yet — check back soon.") with back-to-home link. Year chips not rendered. |
| `getLatestYear()` returns most-recent year with entries (which may not equal current calendar year) | Loader redirects to that year — there's no concept of "current year if empty"; we always navigate to a year that has content |
| User shares `/changelog/2026#v1-4-2` but the entry is later unpublished | Page renders 2026 (assuming 2026 still has other entries), the anchor doesn't resolve to anything, browser scrolls to top. Acceptable — same behavior as a deleted blog-post anchor. |
| `relatedBlogSlug` set but blog post is unpublished or missing | Link still renders (we don't validate at runtime). Click → 404 on the blog article route. Tracked in Follow-ups for a defensive validator. |
| `FEATURES.marketing.changelog === false` | Both routes don't register; `/changelog/*` falls through to the catch-all 404 cleanly. Footer "Changelog" entry already hidden by the same flag. |

---

## SEO

Per-year `meta` export from `changelog-page.tsx`:

```ts
export const meta = ({ params }: { params: { year?: string } }) => {
  const year = params.year ?? '';
  const entries = getEntriesForYear(parseInt(year, 10));
  return [
    { title: `Changelog · ${year} | ${APP_NAME}` },
    { name: 'description', content: `${entries.length} releases shipped in ${year}. Features, fixes, and behind-the-scenes wins.` },
    { property: 'og:title', content: `Changelog · ${year} | ${APP_NAME}` },
    { property: 'og:description', content: `${entries.length} releases shipped in ${year}.` },
    // og:image deferred — would need a per-year image generator
  ];
};
```

The bare `/changelog` route (redirect) doesn't ship its own meta (the redirect happens before render).

---

## Visual / styling

- Container width: `Container maxWidth="md"` for the timeline body (~900px, matches canvas's `max-w-4xl`)
- Hero: composes `MarketingHero` (already container-bound)
- Stats: `Container maxWidth="md"` to match
- Year chips: centered pill row in a `Stack direction="row"` inside the same `md` container
- Date column: `position: sticky; top: calc(var(--layout-header-desktop-height) + 32px)` on `lg+`; flat block above content on `xs/sm/md`
- Vertical line: `borderLeft: 1px dashed; borderLeftColor: 'divider'` on the content column, with the node dot positioned at `-5.5px` left to overlap the line
- Node dot: 10×10px green circle (`primary.main`), white ring (4px ring matches `background.paper` for the punched-out look)
- Marketing dark CtaBand: identical to the existing `CtaBand` primitive

Spacing and motion otherwise follow existing marketing conventions (no per-entry framer-motion entry animations in v1).

---

## Cross-references

- Reuses `blog-content-elements.tsx` (Phase 4) for body content — new doc rule (already codified) says marketing blog/changelog/future-docs all share this kit.
- Extracts `copyToClipboard` from `blog-article-page.tsx` (Phase 4) into `lib/clipboard.ts` — small refactor with two consumers (blog ShareRow + changelog VersionPill).
- Adds `marketing.changelogStats` + `marketing.changelogSubscribe` to the centralized `FEATURES` registry (Phase 3 system).
- Hardcoded `#D97706` (breaking-pill bg) added to "approved hardcoded-color exceptions" in `marketing-surface-conventions.md`.
- New "Page composition primitives" entries in the conventions guide for `<ChangelogEntry>`, `<VersionPill>`, `<EntryTypePill>`.

---

## Acceptance / test plan

- [ ] `just tsc-front` clean
- [ ] `just check-write` clean (oxlint + oxfmt)
- [ ] `just knip` reports no NEW unused exports beyond the established `_data/*.tsx` types pattern
- [ ] `npx react-doctor . --diff` clean on touched files
- [ ] `/changelog` (bare) redirects to `/changelog/{latest year}` (302)
- [ ] `/changelog/{latest year}` renders entries for that year sorted desc by date
- [ ] `/changelog/2025` renders 2025 entries; year chip for 2025 shows active state
- [ ] `/changelog/foo` and `/changelog/2050` → marketing 404 view
- [ ] Year chips: clicking navigates, scroll restores to top, active state moves
- [ ] Year chips hidden when only one year of data exists
- [ ] Direct load of `/changelog/2026#v1-4-2` scrolls the entry below the fixed topbar (no overlap)
- [ ] Clicking a `#vX-Y-Z` pill copies the absolute URL, swaps the icon to check for 2s, smooth-scrolls the entry into view
- [ ] All 8 entry-type pills render with their visual mapping in light + dark mode
- [ ] An entry with `relatedBlogSlug` set renders the "Read full release notes →" RouterLink that navigates to that blog post
- [ ] An entry without `relatedBlogSlug` does NOT render the link
- [ ] Toggle `FEATURES.marketing.changelog = false` → both routes 404, footer link hides
- [ ] Toggle `FEATURES.marketing.changelogStats = true` → stats row renders
- [ ] Toggle `FEATURES.marketing.changelogSubscribe = true` → subscribe band renders, form `preventDefault()`s on submit
- [ ] Empty state: set every entry's `published: false`, visit `/changelog` → bare empty state renders, year chips hidden
- [ ] Per-year SEO `<title>` reflects the year (`Changelog · 2026 | PublyApp`)
- [ ] Sticky date column on `lg+` stays parked under the topbar while scrolling within an entry
- [ ] On `xs/sm/md`, date renders inline above the content (no sticky)
- [ ] CtaBand renders identically to other marketing pages
