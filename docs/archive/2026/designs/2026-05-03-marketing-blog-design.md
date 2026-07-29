Status: Historical — not normative
Original location: docs/superpowers/specs/2026-05-03-marketing-blog-design.md
Archive reason: Completed design retained only for architectural decision history.
Superseded by: apps/front is retired; apps/front-2 and docs/guides/front-2/conventions.md are current.

# Phase 4 — Marketing Blog Design

**Status:** Spec draft (2026-05-03)

**Goal:** Ship `/blog` (index) and `/blog/:slug` (article) under `MarketingLayout`, gated behind the existing `FEATURES.marketing.blog` flag. Static placeholder data, fully functional tag filtering with shareable URL state via nuqs, full article kit (hero + body + related posts + share rail). Build now so the routes + visual style are locked; enable when content is ready.

**Predecessors:**
- `2026-04-30-marketing-supporting-pages-design.md` (parent decomposition)
- `2026-05-01-marketing-pricing-design.md` (Phase 1)
- `2026-05-02-marketing-legal-design.md` (Phase 2)
- `2026-05-03-marketing-company-trio-and-404-design.md` (Phase 3)

**Canvas references:**
- Blog index: `42ba72a3-52de-4c9d-adf9-7e0f74953f69` (light only — derive dark from theme tokens per parent-spec pivot)
- Blog article: `a9b20a6e-02a5-4124-bd13-79e539201e3f` (light only)

---

## Scope

### In scope

- Two routes: `/blog` (index) and `/blog/:slug` (single article)
- `_data/blog.ts` — single source of truth: tags, authors, posts (4–5 placeholders)
- `_components/blog-post-card.tsx` — `variant: 'standard' | 'featured' | 'compact'` prop, single source for index grid + featured slot + related-posts footer
- `_components/blog-article-page.tsx` — article-page skeleton (hero + body slot + related posts footer + share rail), exports `BLOG_H2_SX` / `BLOG_P_SX` for shared prose typography (mirrors legal pages' `LEGAL_H2_SX` / `LEGAL_P_SX`)
- One article file per post: `routes/marketing/blog/articles/<slug>-article.tsx`. Each composes `<BlogArticlePage>` with metadata + inline JSX body
- Tag filter UI on index, fully functional, URL-state via nuqs (`?tag=growth`)
- Featured post pinning: one post designated `featured: true` in data, rendered at the top of the index in the `featured` card variant
- Article share rail: Twitter, LinkedIn, copy-link buttons. Sticky vertical column on `lg+`, inline horizontal row on `< lg`
- Related posts footer: 3 cards filtered by current article's tag (excluding self)
- Per-route SEO `meta` exports (title, description, og:image)
- All blog covers via the existing `<Image>` component (`apps/front/src/components/image/image.tsx`) with `ratio` prop — never `<Box component="img">`
- Both routes gated by `FEATURES.marketing.blog` (already wired in Phase 3 — flip the constant when launching)
- Footer "Blog" link entry under Resources column already in place; appears when flag is on
- 404 popular destinations entry: NOT added (the marketing 404 popular-destinations grid intentionally promotes shipped, evergreen pages — Pricing/About/Contact/Security/Login/Signup. Adding /blog there is a separate decision once the blog has actual content worth promoting)

### Out of scope (explicitly)

- **Real backend / CMS** — no Sanity, Contentful, Strapi. Static data only. Migrate to MDX or CMS in a Phase 4.x once content needs justify it.
- **MDX bodies** — bodies are inline JSX (legal-page idiom). MDX is the natural upgrade path but adds dependency + Vite plugin work that's not justified for placeholder content.
- **Search** — no search input, no client-side full-text search. Tag filter is the only navigation aid in v1.
- **Pagination / load-more** — render all posts. With 4–5 placeholders this is a non-issue. Add when post count exceeds ~9.
- **Comments / claps / reactions** — no engagement features.
- **Author profile pages** — bylines link nowhere; no `/blog/author/:slug` routes.
- **RSS feed** — out for v1. Easy to add as a static `_routes/blog.rss.xml` builder later.
- **Reading-time auto-calculation** — `readingMinutes` is hardcoded per post. Walking JSX trees to estimate word count is engineering effort with no payoff for placeholder content.
- **Analytics events on filter clicks / share clicks** — out for v1. PostHog is wired in the app (`VITE_POSTHOG_PROJECT_TOKEN` in env) but adding event names is its own product decision; revisit when blog has actual readers.
- **Cover image upload UI / asset pipeline** — covers reference Unsplash hot-link slugs, same pattern as `TEAM_MEMBERS`.

### Follow-ups (out of phase, but worth noting)

- **Retroactively migrate `/about` `TEAM_MEMBERS` `<Box component="img">` → `<Image ratio="1/1">`** — Phase 3 used the raw img element before this spec surfaced the `<Image>` primitive. Low-priority cleanup.
- **404 destinations — promote Blog when content exists** — once `/blog` has real evergreen content, add a `Blog` entry to `DEFAULT_POPULAR_DESTINATIONS` in `marketing-error-view.tsx` (flag-guarded by `FEATURES.marketing.blog`).
- **Topbar nav — add Blog link** — once Blog is enabled, the marketing topbar should have a "Blog" link alongside the existing anchor links. The topbar is currently homepage-anchor-driven; deciding when to add named routes there is its own design call.

---

## Architecture

### Routes

Add two routes to `marketing.routes.ts`, both flag-guarded:

```ts
...(FEATURES.marketing.blog
  ? [
      route('blog', 'routes/marketing/blog/blog-index-page.tsx'),
      route('blog/:slug', 'routes/marketing/blog/blog-article-route.tsx'),
    ]
  : []),
```

The article route is `blog/:slug` — slug is the post identifier directly under `/blog`. Disabled routes fall through to the marketing 404 catch-all (Phase 3 behavior).

The article-route file is a thin shim: looks up `BLOG_POSTS.find(p => p.slug === params.slug)` and either renders the matching lazy-loaded `<*Article>` component from `_articles/` or throws a `404 Response` (caught by `MarketingLayout`'s `ErrorBoundary` and rendered as the standard marketing 404 — Phase 3 wiring).

### Files to create

```
apps/front/src/routes/marketing/
├── _components/
│   ├── blog-post-card.tsx              # NEW — variant prop, used by index + related-posts
│   └── blog-article-page.tsx           # NEW — exports <BlogArticlePage> + BLOG_H2_SX + BLOG_P_SX + share-rail sub-components
├── _data/
│   └── blog.ts                         # NEW — types + BLOG_TAGS + BLOG_AUTHORS + BLOG_POSTS + unsplashCover helper
└── blog/
    ├── blog-index-page.tsx             # NEW — composes featured card + tag filter pills + grid
    ├── blog-article-route.tsx          # NEW — slug → article shim with lazy imports
    └── _articles/                      # NEW — per-post body files; underscore-prefixed (not a route folder)
        ├── post-1-slug-article.tsx     # NEW — composes <BlogArticlePage> with body JSX
        ├── post-2-slug-article.tsx
        ├── post-3-slug-article.tsx
        └── post-4-slug-article.tsx
```

`_articles/` follows the repo convention from Phase 3: any non-route folder under `routes/` is underscore-prefixed (`_components`, `_data`, `_layout`, `_parts`, `_errors`, and now `_articles`). The route file (`blog-article-route.tsx`) sits at the blog folder root alongside `blog-index-page.tsx`.

### Data shape (`_data/blog.ts`)

```ts
import type { IconifyName } from '#app/components/iconify/register-icons.ts';

// ----------------------------------------------------------------------

export type BlogTag = 'product' | 'engineering' | 'growth' | 'ops';

export const BLOG_TAGS: { value: BlogTag; label: string; icon?: IconifyName }[] = [
  { value: 'product', label: 'Product' },
  { value: 'engineering', label: 'Engineering' },
  { value: 'growth', label: 'Growth' },
  { value: 'ops', label: 'Ops' },
];

// ----------------------------------------------------------------------

export type BlogAuthor = {
  id: string;
  name: string;
  role: string;
  photoUrl: string;
};

// 2–3 reused authors so the byline rotation feels real on a 4–5 post catalogue.
export const BLOG_AUTHORS: Record<string, BlogAuthor> = {
  'marcus-reynolds': { id: 'marcus-reynolds', name: 'Marcus Reynolds', role: 'CEO & Co-founder', photoUrl: '...' },
  'sarah-jenkins':   { id: 'sarah-jenkins',   name: 'Sarah Jenkins',   role: 'CTO & Co-founder', photoUrl: '...' },
  'elena-rodriguez': { id: 'elena-rodriguez', name: 'Elena Rodriguez', role: 'Head of Product',  photoUrl: '...' },
};
// Reuse photoUrl values from TEAM_MEMBERS in _data/about.ts — same Unsplash slugs.

// ----------------------------------------------------------------------

export type BlogPost = {
  slug: string;             // URL segment: /blog/<slug>
  title: string;
  excerpt: string;          // 1–2 line summary for the index card
  coverSlug: string;        // Unsplash photo slug (e.g. '1551434678-e076c223a692')
  tag: BlogTag;
  publishedAt: string;      // ISO date 'YYYY-MM-DD'
  readingMinutes: number;   // hardcoded per post
  authorId: string;         // looks up into BLOG_AUTHORS
  featured?: boolean;       // pin to top of index. Exactly one post should be designated.
};

export const BLOG_POSTS: BlogPost[] = [ /* 4–5 entries; one with featured:true */ ];

// ----------------------------------------------------------------------

// Unsplash hot-link helper. Keep one source of truth for cover URL formatting.
export const unsplashCover = (slug: string, opts: { w: number; h: number }): string => {
  return `https://images.unsplash.com/photo-${slug}?w=${opts.w}&h=${opts.h}&fit=crop&auto=format&q=80`;
};
```

### `BlogPostCard` variants

```tsx
type BlogPostCardProps = {
  post: BlogPost;
  variant?: 'standard' | 'featured' | 'compact';
};
```

| Variant | Used by | Layout | Cover ratio | Cover dimensions |
|---|---|---|---|---|
| `standard` (default) | Index grid + related-posts footer | Cover on top, title + excerpt + byline below | `'16/9'` | `{ w: 600, h: 338 }` |
| `featured` | Index pinned-featured slot (top of grid) | 2-col on `md+` (cover left ~6/12, text right ~6/12); 1-col on `xs` | `'2/1'` | `{ w: 1080, h: 540 }` |
| `compact` | Reserved (future sidebar list) | Cover left as small thumbnail, text right | `'1/1'` | `{ w: 200, h: 200 }` |

Card content (all variants):
- Tag pill (canon `MarketingEyebrow`-style chip) with the tag label
- Title (h3 in `featured`, h4 elsewhere)
- Excerpt
- Byline row: avatar (40px circle for featured, 32px elsewhere) + author name + author role
- Date + reading-time inline text below byline

Card behavior:
- Whole card is a `<Box component={RouterLink} href={`/blog/${post.slug}`}>` — clickable surface
- Hover: standard transform + shadow, same as Phase 3 `MarketingErrorView` destination pills
- No nested anchor inside the card (a11y — single navigation target per card)

### `BlogArticlePage` primitive

Slot-based, similar to `LegalDocPage` but with article-specific chrome:

```tsx
type BlogArticlePageProps = {
  post: BlogPost;
  children: ReactNode;  // body JSX (Stack of Typography + custom blocks)
};
```

Renders, in order:

1. **Hero** — full-width container, breadcrumb (`Blog / <Tag>`), tag chip, h1 title, byline row (avatar + author + role + date + reading time), then full-width cover `<Image ratio="2/1">` capped at ~1024px maxWidth.
2. **Body grid** — single column on `md and below`; on `lg+` a 12-col grid where body sits in cols 2-10 and the share rail occupies col 11 (sticky vertical). Body width matches the legal-page reading column (~700–760px) for prose comfort.
3. **Share rail** — 3 buttons (Twitter, LinkedIn, copy link). Vertical sticky on `lg+`, inline horizontal row above the related-posts footer on `< lg`.
4. **Related posts footer** — section with eyebrow chip "More to read" + h2 "Related posts" + 3-card grid. Cards filtered by `BLOG_POSTS.filter(p => p.tag === post.tag && p.slug !== post.slug).slice(0, 3)`.

Exports:
- `BlogArticlePage` — the primitive
- `BLOG_H2_SX`, `BLOG_P_SX` — shared prose typography (mirror of legal)
- `BlogArticleByline` — internal sub-component (not exported), used by hero
- `BlogShareRail` — internal sub-component (not exported), used by article shell

Why a separate primitive (not `LegalDocPage` reuse): the visual surface is too different. Legal has a hero with no cover image + a TOC sidebar; blog has a cover hero + share rail (different sidebar) + related-posts footer (legal has nothing). Reusing `LegalDocPage` would force generalization of the sidebar slot for one new consumer — premature.

### Tag filter UI (index)

Renders below the featured card, above the grid:

- Row of pill buttons: `All` + one per `BLOG_TAGS` entry. Active pill has primary-color bg + white text.
- State via nuqs: `useQueryState('tag', parseAsStringEnum([...BLOG_TAGS.map(t => t.value)]))` — `null` means all-posts.
- When `activeTag` is `null` (no filter): the featured slot renders ABOVE the grid, and the grid excludes the featured post (no double-rendering). Render order: featured card → filter pills → standard grid (everything except featured).
- When `activeTag` is set (any filter active): the featured slot is HIDDEN entirely, and the grid renders all posts matching `activeTag` (including the featured post if it matches the tag). Render order: filter pills → grid only.
- Edge case: filter has zero matches → render an empty state ("No posts in this category yet — check back soon" + button "Show all" that clears the `?tag` param).

### Article body composition

Each article file looks like:

```tsx
import { BlogArticlePage, BLOG_H2_SX, BLOG_P_SX } from '#app/routes/marketing/_components/blog-article-page.tsx';
import { BLOG_POSTS } from '#app/routes/marketing/_data/blog.ts';

const POST = BLOG_POSTS.find((p) => p.slug === 'multi-tenant-architecture-lessons');
if (!POST) throw new Error('Post not found in BLOG_POSTS — slug mismatch');

const MultiTenantArchitectureLessonsArticle = () => (
  <BlogArticlePage post={POST}>
    <Stack spacing={4}>
      <Typography sx={BLOG_P_SX}>Lead paragraph...</Typography>

      <Box component="section">
        <Typography component="h2" id="why-multi-tenancy" sx={BLOG_H2_SX}>Why multi-tenancy</Typography>
        <Typography sx={BLOG_P_SX}>...</Typography>
      </Box>

      {/* more sections... */}
    </Stack>
  </BlogArticlePage>
);

export default MultiTenantArchitectureLessonsArticle;
```

Per-section h2s get id attributes — not consumed in v1 (no in-article TOC) but ready if we add one.

### Article route shim

`blog-article-route.tsx`:

```tsx
import { useParams } from 'react-router';
import { lazy, Suspense } from 'react';

import { BLOG_POSTS } from '#app/routes/marketing/_data/blog.ts';

// Static map of slug → lazy-loaded article component. Keeps each article's
// body bundle out of the index page payload.
const ARTICLE_COMPONENTS: Record<string, ReturnType<typeof lazy>> = {
  'post-1-slug': lazy(() => import('./_articles/post-1-slug-article.tsx')),
  // ...
};

const BlogArticleRoute = () => {
  const { slug } = useParams();
  if (!slug) throw new Response('Not Found', { status: 404 });

  const post = BLOG_POSTS.find((p) => p.slug === slug);
  if (!post) throw new Response('Not Found', { status: 404 });

  const ArticleComponent = ARTICLE_COMPONENTS[slug];
  if (!ArticleComponent) throw new Response('Not Found', { status: 404 });

  return (
    <Suspense fallback={null}>
      <ArticleComponent />
    </Suspense>
  );
};

export default BlogArticleRoute;
```

The thrown `404 Response` is caught by `MarketingLayout`'s `ErrorBoundary` (Phase 3 wiring) and rendered as the marketing 404 view. No special handling needed in this file.

### SEO meta

Each blog route exports `meta` (React Router pattern, used by `root.tsx` already):

```tsx
// blog-index-page.tsx
export const meta = () => [
  { title: `Blog | ${APP_NAME}` },
  { name: 'description', content: 'Stories, lessons, and product updates from the PublyApp team.' },
  { property: 'og:title', content: `Blog | ${APP_NAME}` },
  { property: 'og:description', content: '...' },
];

// blog-article-route.tsx (uses params + post lookup)
export const meta = ({ params }: Route.MetaArgs) => {
  const post = BLOG_POSTS.find((p) => p.slug === params.slug);
  if (!post) return [{ title: `Not Found | ${APP_NAME}` }];
  return [
    { title: `${post.title} | ${APP_NAME}` },
    { name: 'description', content: post.excerpt },
    { property: 'og:title', content: post.title },
    { property: 'og:description', content: post.excerpt },
    { property: 'og:image', content: unsplashCover(post.coverSlug, { w: 1200, h: 630 }) },
  ];
};
```

og:image dimensions match the standard Open Graph 1200×630 social-share preview spec.

---

## Component conventions (carried from Phase 3)

- Eyebrows = canon `MarketingEyebrow` chip (white-bg pill + optional primary icon). Tag pills on cards are MarketingEyebrow-styled with the tag label.
- Buttons that navigate use `<Box component={RouterLink} href={...}>`, never MUI `<Button>`. Submit buttons (none in this phase) are the exception.
- All hardcoded colors in `_data/blog.ts` and components MUST be either theme tokens or one of the approved-exceptions list (Unsplash photo URLs are external assets, not colors — fine).
- Hover discipline: stable bg/color/border, only `transform` + `boxShadow` change.
- All section eyebrows centered (ContentBand convention from Phase 3). Featured card on index uses left-aligned text in its right column (2-col layout, similar to /about's Our Story).
- `<Image>` primitive for all blog covers (NOT raw `<img>` or `<Box component="img">`). Use the `ratio` prop.

---

## Data flow

```
URL                                    Render
/blog                                  blog-index-page.tsx
                                          ├─ Hero band (eyebrow + h1 + subhead — MarketingHero)
                                          ├─ Featured BlogPostCard (variant="featured", post.featured === true)
                                          ├─ Tag filter pills (nuqs ?tag=)
                                          └─ Grid of BlogPostCard variant="standard" (filtered)

/blog?tag=growth                       same page; activeTag drives grid filter

/blog/multi-tenant-...                 blog-article-route.tsx
                                          → BLOG_POSTS.find(slug match)
                                          → lazy import articles/multi-tenant-...-article.tsx
                                          → which renders <BlogArticlePage post={POST}> children </>
                                              ├─ Hero (cover, byline, h1, tag, reading time)
                                              ├─ Body grid (12-col on lg+: body in 2..10, share rail in 11)
                                              ├─ Share rail (sticky on lg+, inline above related on <lg)
                                              └─ Related posts footer (3 cards by tag match)

/blog/non-existent                     404 Response thrown by route shim
                                          → caught by MarketingLayout ErrorBoundary
                                          → renders MarketingErrorView numeral="404" ...
```

---

## Error handling

- Article slug not in `BLOG_POSTS` → route shim throws `404 Response` → MarketingLayout ErrorBoundary catches → renders `MarketingErrorView` (Phase 3 wiring, no new code).
- Article slug exists in `BLOG_POSTS` but no matching `ARTICLE_COMPONENTS` entry (data/code drift) → route shim throws `404 Response` (defensive — this should be impossible in healthy code; if it fires, the shim message tells you which slug is missing a component).
- Unsplash cover URL fails to load → `<Image>` renders its built-in placeholder (existing component behavior; no new handling needed).
- Tag query param value not in `BLOG_TAGS` → nuqs `parseAsStringEnum` rejects → falls back to `null` (all posts) automatically.
- Empty filter result → "No posts in this category yet" empty state with "Show all" reset button.
- Share-rail copy-link button click without `navigator.clipboard` → fallback to `prompt('Copy this URL', url)` (handles older Safari + edge cases). Show "Copied!" toast/inline confirmation on success.

---

## Testing

No new automated tests planned for this phase. The `apps/front` test suite is currently empty (Phase 1–3 also added no tests; the marketing surface relies on browser smoke + tsc-front + check-write).

Browser smoke checklist for Task 12-style verification (in the implementation plan):

- `/blog` renders with featured + 4 grid cards in light + dark mode
- Tag filter clicks change `?tag=` URL and the visible grid; "All" resets to no param
- Empty state renders for a tag with zero posts (force this by clicking through every tag)
- Each `/blog/<slug>` renders with hero cover + byline + body + share rail (sticky on lg+) + related posts (≤3, all sharing the tag)
- `/blog/non-existent` renders the marketing 404
- Share rail buttons: Twitter opens correct URL, LinkedIn opens correct URL, copy-link copies the page URL and shows "Copied!" feedback
- View page source: per-page `<title>` and `<meta name="description">` reflect the post (or generic blog meta on the index)
- Dark-mode parity: covers stay readable, prose is legible, tag pills have correct contrast
- `FEATURES.marketing.blog` flipped to `false`: `/blog` and `/blog/<slug>` both 404 to MarketingErrorView; footer drops "Blog" entry; (when added) topbar drops "Blog" link

---

## Decisions log

| Question | Decision | Why |
|---|---|---|
| Backend / data source | Static `_data/blog.ts` only | Matches Phase 2/3 idiom; ships fast; no new deps. MDX/CMS upgrade path stays open. |
| Filter UI | Functional + nuqs | nuqs already in repo; URL state makes filter selections shareable. |
| Article scope | Hero + body + related + share rail | "Full kit" — modest engineering, real reader value. |
| Cover variants | `BlogPostCard variant` prop with per-variant `<Image ratio>` | One component, three uses, performance-correct image sizes per slot. |
| Cover component | Existing `<Image>` (lazy-loaded, ratio prop, blur placeholder) | Established repo primitive; `<Box component="img">` was a Phase 3 oversight. |
| Article body shape | Inline JSX per article file | Legal-page idiom; smooth migration path to MDX later. |
| Reuse `LegalDocPage` for article? | No — separate `BlogArticlePage` | Different chrome (cover hero, share rail, related posts vs sticky TOC). Premature generalization to fit both. |
| Reading time | Hardcoded `readingMinutes` per post | Walking JSX trees is engineering for placeholder content. |
| Pagination | Out — render all | <10 posts; not justified yet. |
| Search | Out | Tag filter covers v1 navigation. |
| Comments / claps | Out | Engagement features are a separate product decision. |
| RSS | Out | Easy add later. |
| Featured selection | Manual `featured: true` boolean on BlogPost | Editorial choice, not algorithmic. One post designated. |
| 404 destinations include `/blog` | No (yet) | Promote when there's evergreen content worth promoting. |
| Topbar `/blog` link | Out — separate decision | Topbar is currently anchor-driven; named-route nav is its own design problem. |
