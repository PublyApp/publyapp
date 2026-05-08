# Marketing SEO infrastructure — design spec

**Date:** 2026-05-08
**Issue:** [#374 — Marketing SEO infrastructure: sitemap.xml, robots.txt, structured data](https://github.com/radandevist/publyapp-5/issues/374)
**PR scope:** single PR. Sitemap, robots, JSON-LD primitive + per-surface schemas, canonical URLs, OG/Twitter meta builder, marketing-only trailing-slash enforcement.

## Goal

Add the SEO infrastructure layer that lets search engines and social-media crawlers discover, index, and richly render the marketing surface. Per-page `<title>`/`<meta name="description">` already exist (PR #367). This PR adds discovery (sitemap, robots), structured data (JSON-LD), social previews (OG + Twitter Card), canonical URLs, and trailing-slash enforcement.

## Scope decisions (locked)

| # | Decision | Rationale |
|---|---|---|
| 1 | Single `sitemap.xml` (not split + index) | Current surface is ~26 URLs (10 static + 4 blog + 12 changelog years). Single file is well below the 50k limit. Split-with-index is over-engineering until 1000+ URLs |
| 2 | Default OG image at `/public/og-image-default.jpg` (placeholder) | Single 1200×630 placeholder, swap later. Blog overrides with cover; legal/about use default. Pragmatic |
| 3 | Trailing slashes enforced (sitemap + canonical + redirect + internal links via `FRONT_PATH_NAMES`) | User preference for compliance + discoverability uniformity |
| 4 | Trailing-slash enforcement scoped to **marketing routes only** | Auth + dashboard routes aren't indexed (per the new robots.txt). Changing their URL shape risks invitation/reset deep-link regressions |
| 5 | All 5 JSON-LD schemas added (Organization, BlogPosting, BreadcrumbList, FAQPage, WebSite) | Per issue body; standard set for a SaaS marketing surface |
| 6 | `VITE_APP_URL` env var holds the canonical hostname | Avoids hardcoding `https://publyapp.com`; dev gets a safe fallback |

## Architecture overview

### File map

```
apps/front/src/
├── routes/
│   ├── sitemap[.]xml.tsx                  (NEW)
│   └── robots[.]txt.tsx                   (NEW)
├── components/
│   └── json-ld.tsx                        (NEW)
├── lib/seo/
│   ├── schemas.ts                         (NEW)
│   ├── canonical.ts                       (NEW)
│   └── meta.ts                            (NEW)
└── routes/marketing/
    ├── _layout/marketing-layout.tsx       (MODIFIED — add slash-redirect loader)
    ├── home/home-page.tsx                 (MODIFIED — meta + JSON-LD)
    ├── pricing/pricing-page.tsx           (MODIFIED — meta + JSON-LD FAQ)
    ├── about/about-page.tsx               (MODIFIED — meta + JSON-LD Organization)
    ├── contact/contact-page.tsx           (MODIFIED — meta + JSON-LD FAQ)
    ├── security/security-page.tsx         (MODIFIED — meta)
    ├── terms/terms-page.tsx               (MODIFIED — meta)
    ├── privacy/privacy-page.tsx           (MODIFIED — meta)
    ├── cookies/cookies-page.tsx           (MODIFIED — meta)
    ├── blog/blog-index-page.tsx           (MODIFIED — meta)
    ├── blog/blog-article-route.tsx        (MODIFIED — meta + JSON-LD BlogPosting + BreadcrumbList)
    ├── changelog/changelog-page.tsx       (MODIFIED — meta + JSON-LD BreadcrumbList)
    └── changelog/changelog-redirect-route.tsx (no change — redirects to /changelog/{year}/)

apps/front/public/
└── og-image-default.jpg                   (NEW — 1200×630 placeholder)

packages/shared-ts/lib/constants/
└── (FRONT_PATH_NAMES.marketing.* updated to add trailing slashes)

.env.development.example                   (MODIFIED — document VITE_APP_URL)
```

## Sitemap

### Route

`apps/front/src/routes/sitemap[.]xml.tsx` — React Router v7 escape syntax: `[.]xml` becomes literal `.xml` in the URL (e.g. `/sitemap.xml`). Loader-only route; no default export needed (matches `clear-session.tsx` pattern).

### Loader output

```tsx
export const loader = ({ request }: Route.LoaderArgs) => {
  const baseUrl = getBaseUrl();   // VITE_APP_URL or window.location.origin fallback
  const entries = buildSitemapEntries(baseUrl);
  const xml = renderSitemapXml(entries);
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',  // 1h CDN cache
    },
  });
};
```

### Entry shape

```ts
type SitemapEntry = {
  loc: string;          // full URL with trailing slash
  lastmod: string;      // ISO date 'YYYY-MM-DD'
  changefreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority: number;     // 0.0 to 1.0
};
```

### Entries built

| Source | Entries | lastmod source | changefreq | priority |
|---|---|---|---|---|
| Static | `/`, `/pricing/` | hardcoded recent date | `monthly` | `1.0` (home), `0.9` (pricing) |
| Static (flagged) | `/about/`, `/contact/`, `/security/` | hardcoded | `monthly` | `0.7` |
| Static (legal) | `/terms/`, `/privacy/`, `/cookies/` | from each `_data/legal-*.ts` `LAST_UPDATED` constant | `yearly` | `0.3` |
| Static (blog index) | `/blog/` (if `FEATURES.marketing.blog`) | latest published post `publishedAt` | `weekly` | `0.8` |
| Static (changelog) | `/changelog/` (if `FEATURES.marketing.changelog`) | latest entry date | `weekly` | `0.7` |
| Blog dynamic | `/blog/<slug>/` for each `getPublishedPosts()` post | post.`publishedAt` | `monthly` | `0.7` |
| Changelog dynamic | `/changelog/<year>/` for each `getAvailableYears()` year | latest entry date in that year | `monthly` | `0.6` |

Routes whose feature flag is OFF are skipped entirely. Same gating semantics as the route registration.

### XML rendering

Hand-written template string (no XML library):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://publyapp.com/</loc>
    <lastmod>2026-05-01</lastmod>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
  ...
</urlset>
```

URL values are XML-escaped (`&` → `&amp;`, etc.) via a tiny inline helper.

## Robots.txt

### Route

`apps/front/src/routes/robots[.]txt.tsx` — same pattern as sitemap. Loader-only.

### Loader output

```tsx
export const loader = () => {
  const baseUrl = getBaseUrl();
  const body = `User-agent: *
Allow: /
Disallow: /api/
Disallow: /staff/
Disallow: /auth/
Disallow: /unauthorized/

Sitemap: ${baseUrl}/sitemap.xml
`;
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
```

**Note on tenant routes:** tenant URLs are `/<tenantId>/...` — no shared prefix. Cannot disallow them via a fixed prefix. The `Disallow: /` exclusion via `Allow: /` plus the explicit disallows above means crawlers can index marketing routes (which all share the marketing layout root paths) but not the rest. Tenant URLs aren't crawlable from outside (require auth, no public links), so they won't naturally end up in any crawler's queue.

## JSON-LD primitive

`apps/front/src/components/json-ld.tsx`:

```tsx
type JsonLdProps = {
  schema: Record<string, unknown>;
};

export const JsonLd = ({ schema }: JsonLdProps) => {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
};
```

The `dangerouslySetInnerHTML` is intentional — `<script>` content can't be set via children in React. The `JSON.stringify` output is safe (no injection vector since the schema object is built from typed application data). If a future caller passes user-controlled string fields into the schema, they MUST sanitize first.

## Schema builders

`apps/front/src/lib/seo/schemas.ts` exports five builder functions, each returning a typed `Record<string, unknown>` matching schema.org shape:

### `buildOrganizationSchema(): Record<string, unknown>`

```ts
{
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'PublyApp',
  url: getBaseUrl(),
  logo: `${getBaseUrl()}/logo-512.png`,
  sameAs: ['https://x.com/publyapp', 'https://linkedin.com/company/publyapp'],
}
```

(Social URLs are placeholders — match what `HOME_FOOTER_SOCIALS` uses or note as TODO with constants.)

### `buildWebSiteSchema(): Record<string, unknown>`

```ts
{
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  url: getBaseUrl(),
  name: 'PublyApp',
  potentialAction: {
    '@type': 'SearchAction',
    target: `${getBaseUrl()}/blog/?tag={search_term_string}`,
    'query-input': 'required name=search_term_string',
  },
}
```

(Sitelinks search box. Optional but free SEO win on the home page.)

### `buildBlogPostingSchema(post: BlogPost, author: BlogAuthor): Record<string, unknown>`

```ts
{
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: post.title,
  description: post.excerpt,
  image: unsplashCover(post.coverSlug, 1200, 630),
  datePublished: post.publishedAt,
  dateModified: post.publishedAt,
  author: {
    '@type': 'Person',
    name: author.name,
    jobTitle: author.role,
    image: author.photoUrl,
  },
  publisher: {
    '@type': 'Organization',
    name: 'PublyApp',
    logo: { '@type': 'ImageObject', url: `${getBaseUrl()}/logo-512.png` },
  },
  mainEntityOfPage: { '@type': 'WebPage', '@id': `${getBaseUrl()}/blog/${post.slug}/` },
}
```

### `buildBreadcrumbListSchema(items: { name: string; url: string }[]): Record<string, unknown>`

```ts
{
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((item, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: item.name,
    item: item.url,
  })),
}
```

### `buildFaqPageSchema(faqs: { question: string; answer: string }[]): Record<string, unknown>`

```ts
{
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((faq) => ({
    '@type': 'Question',
    name: faq.question,
    acceptedAnswer: { '@type': 'Answer', text: faq.answer },
  })),
}
```

### Per-surface usage

| Surface | Schema(s) |
|---|---|
| `home-page.tsx` | `Organization` + `WebSite` |
| `pricing-page.tsx` | `FAQPage` (built from `PRICING_FAQ` data) |
| `about-page.tsx` | `Organization` |
| `contact-page.tsx` | `FAQPage` (built from contact "Quick answers" section data) |
| `blog-article-route.tsx` | `BlogPosting` + `BreadcrumbList` |
| `changelog-page.tsx` | `BreadcrumbList` |
| Other (legal, security) | none — not value-add |

Schema is rendered as a JSX child of each page (NOT in `meta` export — meta export only handles meta tags):

```tsx
return (
  <>
    <JsonLd schema={buildOrganizationSchema()} />
    <JsonLd schema={buildWebSiteSchema()} />
    {/* rest of page */}
  </>
);
```

## Canonical URLs + meta builder

### Canonical helper

`apps/front/src/lib/seo/canonical.ts`:

```ts
export const getBaseUrl = (): string => {
  return import.meta.env.VITE_APP_URL ?? 'https://publyapp.com';
};

export const buildCanonicalUrl = (pathname: string): string => {
  const base = getBaseUrl();
  // Strip query string (canonical points to the parameter-less form)
  const cleanPath = pathname.split('?')[0] ?? pathname;
  // Force trailing slash
  const withSlash = cleanPath.endsWith('/') ? cleanPath : `${cleanPath}/`;
  return `${base}${withSlash}`;
};
```

For `/blog?tag=engineering` → returns `https://publyapp.com/blog/`. For `/blog/<slug>` → `https://publyapp.com/blog/<slug>/`.

### Meta builder

`apps/front/src/lib/seo/meta.ts` exports a single `buildSeoMeta(input)` returning a `MetaDescriptor[]` for each page's `meta` export:

```ts
type SeoMetaInput = {
  title: string;
  description: string;
  pathname: string;            // for canonical + og:url
  ogImage?: string;            // absolute URL; default '/og-image-default.jpg'
  ogType?: 'website' | 'article';   // default 'website'
  twitterCard?: 'summary' | 'summary_large_image';   // default 'summary_large_image'
};

export const buildSeoMeta = (input: SeoMetaInput): MetaDescriptor[] => {
  const canonical = buildCanonicalUrl(input.pathname);
  const ogImage = input.ogImage ?? `${getBaseUrl()}/og-image-default.jpg`;
  const ogType = input.ogType ?? 'website';
  const twitterCard = input.twitterCard ?? 'summary_large_image';

  return [
    { title: input.title },
    { name: 'description', content: input.description },
    { tagName: 'link', rel: 'canonical', href: canonical },
    { property: 'og:title', content: input.title },
    { property: 'og:description', content: input.description },
    { property: 'og:url', content: canonical },
    { property: 'og:image', content: ogImage },
    { property: 'og:type', content: ogType },
    { property: 'og:site_name', content: 'PublyApp' },
    { name: 'twitter:card', content: twitterCard },
    { name: 'twitter:title', content: input.title },
    { name: 'twitter:description', content: input.description },
    { name: 'twitter:image', content: ogImage },
  ];
};
```

### Per-page integration

Every marketing page's `meta` export becomes a one-liner like:

```tsx
export const meta = ({ location }: Route.MetaArgs) => {
  return buildSeoMeta({
    title: `Pricing — ${APP_NAME}`,
    description: 'Choose the plan that fits your team size and posting volume.',
    pathname: location.pathname,
  });
};
```

Blog article uses cover override:

```tsx
return buildSeoMeta({
  title: `${post.title} — ${APP_NAME}`,
  description: post.excerpt,
  pathname: location.pathname,
  ogImage: unsplashCover(post.coverSlug, 1200, 630),
  ogType: 'article',
});
```

## Trailing-slash enforcement (marketing-only)

### Layout-level redirect

`apps/front/src/routes/marketing/_layout/marketing-layout.tsx` gets a new `loader`:

```tsx
import { redirect } from 'react-router';

export const loader = ({ request }: Route.LoaderArgs) => {
  const url = new URL(request.url);
  // Skip non-routable paths (sitemap.xml, robots.txt, asset files)
  if (url.pathname.includes('.')) {
    return null;
  }
  // Skip the root '/' (already a canonical form)
  if (url.pathname === '/') {
    return null;
  }
  // Redirect any non-slash marketing path to its slash form
  if (!url.pathname.endsWith('/')) {
    url.pathname += '/';
    throw redirect(url.toString(), 301);
  }
  return null;
};
```

### `FRONT_PATH_NAMES` constants update

`packages/shared-ts/lib/constants/front-path-names.ts` (or wherever the constants live) — every `FRONT_PATH_NAMES.marketing.*` value gets a trailing slash:

```ts
marketing: {
  home: '/',
  pricing: '/pricing/',
  terms: '/terms/',
  privacy: '/privacy/',
  cookies: '/cookies/',
  about: '/about/',
  contact: '/contact/',
  security: '/security/',
  blog: '/blog/',
  changelog: '/changelog/',
  // Dynamic helpers also append trailing slash
  blogArticle: (slug: string) => `/blog/${slug}/`,
  changelogYear: (year: number | string) => `/changelog/${year}/`,
  // ...
}
```

Auth/staff/tenant constants are unchanged.

### Internal link cascade

Because internal links throughout the codebase reference `FRONT_PATH_NAMES.marketing.*`, updating the constants automatically propagates trailing slashes to:
- `apps/front/src/layouts/main/footer.tsx` (Legal column links, Product/Company/Resources links)
- `apps/front/src/layouts/nav-config-main.tsx` (top nav)
- `apps/front/src/routes/marketing/**` (cross-page CTAs)
- `apps/front/src/routes/marketing/_components/marketing-error-view.tsx` (popular destinations)
- Any other consumer

A grep confirms the cascade is complete (`git grep "FRONT_PATH_NAMES.marketing"` post-change shows no orphaned hardcoded paths).

### Out of scope

- Auth route trailing slashes (would risk breaking invitation/reset/verify-email deep-links)
- Dashboard route trailing slashes (no SEO benefit; high regression risk on toast deep-links, email links, etc.)
- These can be tackled in a future PR if desired

## Open Graph + Twitter Card

The meta builder above (`buildSeoMeta`) emits all OG + Twitter tags per page. No separate component or system needed — every page's existing `meta` export is replaced by a `buildSeoMeta(...)` call.

### Default OG image

`apps/front/public/og-image-default.jpg` — 1200×630 placeholder JPG, ~80KB target. Created once, swapped at any time without code changes.

For now, generate a simple branded placeholder (gradient background + "PublyApp" wordmark + tagline). The `Write` tool can't produce binary, so the implementation task will:
1. Create a documentation note in the plan instructing the user to drop a 1200×630 placeholder JPG at the path
2. Add a tiny `og-image-default.jpg.placeholder` text file with instructions if the JPG is missing at PR time

## Environment

### New env var: `VITE_APP_URL`

The canonical hostname for absolute URLs in sitemap / canonical / og:url. Documented in `.env.development.example`:

```
VITE_APP_URL=http://localhost:5050
```

Production sets this via Dokploy env config to `https://publyapp.com` (or whatever the actual domain becomes).

The `getBaseUrl()` helper falls back to `'https://publyapp.com'` if the var is unset, so the sitemap doesn't break in dev.

## Testing strategy

No automated frontend tests in this repo. Quality gates:

| Gate | Command | What it catches |
|---|---|---|
| Lint + format | `just check-write` | style |
| Type check | `just tsc-front` | broken meta exports, schema builder signatures |
| Manual smoke | `just dev-front`, fetch + inspect | sitemap.xml validity, robots.txt validity, JSON-LD presence, meta tags |
| External validators | Google Rich Results Test, Facebook Sharing Debugger, Twitter Card Validator | post-deploy schema/OG correctness |

### Manual smoke checklist

1. `curl http://localhost:5050/sitemap.xml` — XML validates, has all expected entries (count ≥ 14: 10 static + 4 blog + the changelog years), every `<loc>` ends with `/`.
2. `curl http://localhost:5050/robots.txt` — text/plain, mentions `Sitemap:` URL.
3. `view-source:http://localhost:5050/` — has 1× `<script type="application/ld+json">` for Organization, 1× for WebSite, 1× `<link rel="canonical">` ending in `/`, full OG + Twitter set.
4. `view-source:http://localhost:5050/blog/<slug>/` — has BlogPosting + BreadcrumbList JSON-LD.
5. `view-source:http://localhost:5050/pricing/` — has FAQPage JSON-LD with the actual FAQ items.
6. Navigate to `http://localhost:5050/pricing` (no trailing slash) — observe 301 redirect to `/pricing/`.
7. Open Google's Rich Results Test, paste the home URL — Organization + WebSite both detected, no errors.
8. Verify `og:image` resolves to a real JPG (default or per-page).
9. Click every internal `RouterLink` in the footer → URL bar shows trailing slash (no extra redirect happens because constants already have the slash).

## Out of scope

- Real OG image asset (placeholder; design pass later)
- Real social URLs in `Organization` schema (placeholder; replace when accounts exist)
- Real `logo-512.png` (placeholder; design pass later)
- `hreflang` (depends on language switcher being flipped on — separate issue)
- Auth/dashboard trailing-slash enforcement (high risk, no SEO benefit)
- Performance optimization (separate concern)
- Sitemap index split (single sitemap is correct for current scale)
- Submitting to Google Search Console / Bing Webmaster Tools (manual post-merge step)

## Acceptance criteria

- [ ] `/sitemap.xml` returns valid XML, lists every public marketing page (gated on flags), every URL has trailing slash
- [ ] `/robots.txt` returns text/plain with the documented Allow/Disallow rules + Sitemap reference
- [ ] `<JsonLd>` component shipped at `apps/front/src/components/json-ld.tsx`
- [ ] All 5 schema builders shipped at `apps/front/src/lib/seo/schemas.ts`
- [ ] Each per-surface schema rendered on the right page (home: Org+WebSite, pricing: FAQ, about: Org, contact: FAQ, blog article: BlogPosting+Breadcrumb, changelog year: Breadcrumb)
- [ ] `buildSeoMeta(...)` shipped at `apps/front/src/lib/seo/meta.ts`; every marketing page's meta export uses it
- [ ] `<link rel="canonical">` emitted on every page, with trailing slash
- [ ] `og:image` defaults to `/og-image-default.jpg`; blog overrides with cover
- [ ] `twitter:card` is `summary_large_image` by default
- [ ] Marketing-layout loader redirects non-slash URLs to slash form (301)
- [ ] `FRONT_PATH_NAMES.marketing.*` constants updated to include trailing slashes; helper functions append slash
- [ ] `VITE_APP_URL` env var documented in `.env.development.example`
- [ ] Manual smoke checklist completed
- [ ] `just check-write` passes
- [ ] `just tsc-front` passes

## References

- Issue [#374](https://github.com/radandevist/publyapp-5/issues/374)
- PR #367 (per-page meta foundation)
- `apps/front/src/routes/marketing/_data/blog.ts` (`getPublishedPosts`, `unsplashCover`)
- `apps/front/src/routes/marketing/_data/changelog.tsx` (`getAvailableYears`)
- `apps/front/src/routes/auth/clear-session.tsx` (loader-only route pattern)
- `apps/front/src/lib/features/flags.ts` (FEATURES gating)
- AGENTS.md → Frontend Architecture (React Router v7 meta exports)
- schema.org docs for each schema type
- Google Rich Results Test: <https://search.google.com/test/rich-results>
