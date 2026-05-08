# Marketing SEO infrastructure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship sitemap.xml + robots.txt routes, JSON-LD primitive + 5 schema builders, per-page meta builder for OG/Twitter/canonical, and marketing-only trailing-slash enforcement (constants + layout-level redirect + cascade through internal links).

**Architecture:** Two new loader-only routes (`sitemap[.]xml.tsx`, `robots[.]txt.tsx`) returning raw `Response` with appropriate `Content-Type`. New `apps/front/src/lib/seo/` library with `canonical.ts`, `meta.ts`, `schemas.ts`. New `apps/front/src/components/json-ld.tsx` primitive. `FRONT_PATH_NAMES.marketing.*` constants gain trailing slashes via a new `marketingPath()` helper + new `blogArticle()` and `changelogYear()` dynamic helpers. Marketing-layout `loader` redirects non-slash URLs to slash form. `MarketingLayout` is the only layout where this enforcement runs — auth/dashboard URLs are intentionally NOT changed (no SEO benefit, deep-link regression risk).

**Tech Stack:** React 19, MUI v6, React Router v7 (loaders + meta exports), TypeScript 6 native imports, schema.org JSON-LD.

**Spec:** `docs/superpowers/specs/2026-05-08-marketing-seo-infrastructure-design.md`

**Branch:** `feature/seo-infra` (already created; spec already committed)

---

## Pre-flight context (read before starting)

- **No automated frontend tests in this repo** — quality gates per task: `just check-write` + `just tsc-front` + manual smoke (curl + view-source) for visible behavior.
- **Trailing-slash enforcement is marketing-scoped only.** Auth/dashboard route constants stay unchanged. Verify by leaving `auth.*`, `staff.*`, `tenant()` blocks in `FRONT_PATH_NAMES` alone.
- **The `FRONT_PATH_NAMES.marketing.*` shape change is not backward-compatible** — every consumer that builds URLs by string-concatenating onto `marketing.blog` etc. will break. Task 2 migrates the known consumers; if more turn up later, the symptom is a doubled slash like `/blog//some-slug`.
- **Sitemap + robots routes use React Router v7's `[.]` escape syntax** in the filename: `sitemap[.]xml.tsx` becomes the URL `/sitemap.xml`. The `[.]` escapes the `.` in the route segment so React Router doesn't treat it as a file extension separator.
- **`<JsonLd>` uses `dangerouslySetInnerHTML`** because React doesn't allow children inside `<script>`. The schema object is built from typed application data; if you ever need to inject user-controlled string fields, sanitize first.
- The existing `getPublishedPosts()` helper is at `apps/front/src/routes/marketing/_data/blog.ts:263`. The existing `getAvailableYears()` and `getEntriesForYear(year)` are at `apps/front/src/routes/marketing/_data/changelog.tsx:702` and `:718`.
- `FRONT_PATH_NAMES` lives at `packages/shared-ts/lib/constants.ts:90` (not in a `constants/` directory — single file).

---

## Task 1: `FRONT_PATH_NAMES.marketing.*` trailing-slash refactor + dynamic helpers

**Files:**
- Modify: `packages/shared-ts/lib/constants.ts`

Add a `marketingPath()` helper that wraps `makePath()` and appends `/` (preserving the `'/'` root). Update every `marketing.*` static entry to use it. Add new dynamic helpers `blogArticle(slug)` and `changelogYear(year)` so callers stop building URLs inline.

- [ ] **Step 1: Read the current marketing block**

`packages/shared-ts/lib/constants.ts` lines 90-107 currently:

```ts
export const FRONT_PATH_NAMES = {
	home: '/',
	unauthorized: makePath('unauthorized'),
	marketing: {
		pricing: makePath('pricing'),
		terms: makePath('terms'),
		privacy: makePath('privacy'),
		cookies: makePath('cookies'),
		about: makePath('about'),
		contact: makePath('contact'),
		security: makePath('security'),
		blog: makePath('blog'),
		changelog: makePath('changelog'),
		integrations: makePath('integrations'),
		help: makePath('help'),
		community: makePath('community'),
	},
	// ...
};
```

- [ ] **Step 2: Add `marketingPath()` helper + update marketing block + new dynamic helpers**

Above the `FRONT_PATH_NAMES` definition (or just before the `marketing:` object literal), add:

```ts
// Marketing routes use trailing slashes for SEO canonical consistency.
// Auth/staff/tenant intentionally don't (no SEO benefit, deep-link risk).
const marketingPath = (...params: string[]): string => {
	const path = makePath(...params);
	if (path === '/') {
		return '/';
	}
	return `${path}/`;
};
```

Replace the `marketing:` block with:

```ts
marketing: {
	pricing: marketingPath('pricing'),
	terms: marketingPath('terms'),
	privacy: marketingPath('privacy'),
	cookies: marketingPath('cookies'),
	about: marketingPath('about'),
	contact: marketingPath('contact'),
	security: marketingPath('security'),
	// Blog index + dynamic article helper.
	blog: marketingPath('blog'),
	blogArticle: (slug: string) => marketingPath('blog', slug),
	// Changelog index + dynamic year helper.
	changelog: marketingPath('changelog'),
	changelogYear: (year: number | string) => marketingPath('changelog', String(year)),
	integrations: marketingPath('integrations'),
	help: marketingPath('help'),
	community: marketingPath('community'),
},
```

- [ ] **Step 3: Verify lint + tsc**

Run: `just check-write && just tsc-front`
Expected: 0 errors. Note: this change cascades into many consumers — any breakage in this step indicates a usage that builds URLs inline (Task 2 will catch and fix those).

If `tsc` errors complain about `string` vs `(slug: string) => string` type mismatch on usages of `FRONT_PATH_NAMES.marketing.blog` or `.changelog`, those are call sites that previously concatenated `${...blog}/${slug}` and now need migrating. Note them but proceed — Task 2 fixes them.

- [ ] **Step 4: Commit**

```bash
git add packages/shared-ts/lib/constants.ts
git commit -m "refactor(shared-ts): trailing slashes on FRONT_PATH_NAMES.marketing

Adds marketingPath() helper that wraps makePath() with trailing slash
(preserves '/' root). All marketing.* entries updated. New dynamic
helpers blogArticle(slug) and changelogYear(year) so consumers stop
building URLs inline (those would otherwise produce '/blog//slug'
after the slash addition).

Auth/staff/tenant routes intentionally untouched — no SEO benefit
and changing them risks invitation/reset deep-link regressions.

Refs #374

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Migrate inline URL builders to use new helpers

**Files:**
- Modify: `apps/front/src/routes/marketing/_components/blog-post-card.tsx`
- Modify: `apps/front/src/routes/marketing/_components/changelog-entry.tsx`
- Modify: `apps/front/src/routes/marketing/_components/changelog-year-chips.tsx`
- Modify: `apps/front/src/routes/marketing/blog/blog-index-page.tsx`

Seven inline `${...blog}/${slug}` and `${...changelog}/${year}` patterns need migrating to the new helpers from Task 1.

- [ ] **Step 1: Migrate `blog-post-card.tsx` (3 occurrences)**

Open `apps/front/src/routes/marketing/_components/blog-post-card.tsx`. Find these three lines:

- Line 341: `href={`/blog/${post.slug}`}`
- Line 373: `href={`/blog/${post.slug}`}`
- Line 494: `href={`/blog/${post.slug}`}`

Replace each with:

```tsx
href={FRONT_PATH_NAMES.marketing.blogArticle(post.slug)}
```

Confirm `FRONT_PATH_NAMES` is already imported at the top of the file. If not, add:

```tsx
import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';
```

- [ ] **Step 2: Migrate `changelog-entry.tsx` (1 occurrence)**

Open `apps/front/src/routes/marketing/_components/changelog-entry.tsx`. Find line 183:

```tsx
href={`/blog/${entry.relatedBlogSlug}`}
```

Replace with:

```tsx
href={FRONT_PATH_NAMES.marketing.blogArticle(entry.relatedBlogSlug)}
```

Confirm `FRONT_PATH_NAMES` is already imported, add the import if needed.

- [ ] **Step 3: Migrate `changelog-year-chips.tsx` (1 occurrence)**

Open `apps/front/src/routes/marketing/_components/changelog-year-chips.tsx`. Find line 83:

```tsx
href={`/changelog/${year}`}
```

Replace with:

```tsx
href={FRONT_PATH_NAMES.marketing.changelogYear(year)}
```

Confirm `FRONT_PATH_NAMES` is already imported, add the import if needed.

- [ ] **Step 4: Migrate `blog-index-page.tsx` (2 occurrences)**

Open `apps/front/src/routes/marketing/blog/blog-index-page.tsx`. Find these two lines:

- Line 204: `href={`/blog/${post.slug}`}`
- Line 231: `href={`/blog/${post.slug}`}`

Replace both with:

```tsx
href={FRONT_PATH_NAMES.marketing.blogArticle(post.slug)}
```

Confirm `FRONT_PATH_NAMES` is already imported.

- [ ] **Step 5: Verify lint + tsc**

Run: `just check-write && just tsc-front`
Expected: 0 errors. Run `git grep -nE "/blog/\\$\\{|/changelog/\\$\\{" apps/front/src` to confirm no remaining inline builders. If any turn up, migrate them following the same pattern.

- [ ] **Step 6: Commit**

```bash
git add apps/front/src/routes/marketing/_components/blog-post-card.tsx apps/front/src/routes/marketing/_components/changelog-entry.tsx apps/front/src/routes/marketing/_components/changelog-year-chips.tsx apps/front/src/routes/marketing/blog/blog-index-page.tsx
git commit -m "refactor(front): use blogArticle/changelogYear helpers (no inline URLs)

Migrates 7 inline \`/blog/\${slug}\` and \`/changelog/\${year}\` patterns
to the new typed helpers from FRONT_PATH_NAMES.marketing. Required
because the trailing-slash refactor (previous commit) means a string
concat would otherwise produce '/blog//slug'.

Refs #374

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Marketing-layout loader — trailing-slash redirect

**Files:**
- Modify: `apps/front/src/routes/marketing/_layout/marketing-layout.tsx`

Add a `loader` to `marketing-layout.tsx` that 301-redirects any marketing URL without a trailing slash to its slash form. Skip the root `/` (already canonical) and skip paths containing `.` (asset-like, e.g., `/sitemap.xml`).

- [ ] **Step 1: Add the loader export**

Open `apps/front/src/routes/marketing/_layout/marketing-layout.tsx`. Find the existing imports block. Add this import (or merge with existing `react-router` imports if any):

```tsx
import { redirect } from 'react-router';
```

Also check if `Route` type import exists for typing the loader args:

```tsx
import type { Route } from './+types/marketing-layout';
```

Add it if missing (matches the pattern in other React Router v7 layouts in the codebase).

Add the loader export (place it after the existing imports and before the `MarketingLayout` component definition, or wherever existing exports live in the file):

```tsx
export const loader = ({ request }: Route.LoaderArgs) => {
	const url = new URL(request.url);

	// Skip root path (already in canonical '/' form).
	if (url.pathname === '/') {
		return null;
	}
	// Skip asset-like paths (anything with a '.' — e.g. /sitemap.xml, /robots.txt
	// when those become available in this layout's catchment).
	if (url.pathname.includes('.')) {
		return null;
	}
	// Already has trailing slash → no-op.
	if (url.pathname.endsWith('/')) {
		return null;
	}

	url.pathname += '/';
	throw redirect(url.toString(), 301);
};
```

- [ ] **Step 2: Verify lint + tsc**

Run: `just check-write && just tsc-front`
Expected: 0 errors. The `Route.LoaderArgs` typegen is generated by `react-router typegen` (which runs as part of `just tsc-front`).

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/routes/marketing/_layout/marketing-layout.tsx
git commit -m "feat(front): redirect non-slash marketing URLs to slash form (301)

Marketing-layout loader 301-redirects /pricing -> /pricing/, etc.
Skips the root '/' (already canonical) and paths with '.' (asset-like).
Auth + dashboard routes don't get this treatment (separate issue).

Refs #374

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `<JsonLd>` primitive

**Files:**
- Create: `apps/front/src/components/json-ld.tsx`

Tiny structural component for emitting `<script type="application/ld+json">` blocks.

- [ ] **Step 1: Create the file**

Create `apps/front/src/components/json-ld.tsx` with:

```tsx
type JsonLdProps = {
	schema: Record<string, unknown>;
};

// Renders a JSON-LD <script> tag. Uses dangerouslySetInnerHTML because
// React doesn't allow children inside <script>. Safe as long as the
// `schema` object is built from typed application data — sanitize first
// if any user-controlled string ever lands inside.
export const JsonLd = ({ schema }: JsonLdProps) => {
	return (
		<script
			type="application/ld+json"
			dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
		/>
	);
};
```

- [ ] **Step 2: Verify lint + tsc**

Run: `just check-write && just tsc-front`
Expected: 0 errors. The `dangerouslySetInnerHTML` usage may trigger a lint rule warning — if it does, suppress it inline with `// eslint-disable-next-line react/no-danger` immediately above the `dangerouslySetInnerHTML` line, with a comment explaining why (script tags can't take children in React).

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/components/json-ld.tsx
git commit -m "feat(front): add JsonLd primitive for structured-data scripts

Tiny component emitting <script type=\"application/ld+json\"> blocks.
dangerouslySetInnerHTML is intentional (React doesn't allow children
inside <script>); safe given typed-data inputs.

Refs #374

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: SEO library — canonical, meta, schemas

**Files:**
- Create: `apps/front/src/lib/seo/canonical.ts`
- Create: `apps/front/src/lib/seo/meta.ts`
- Create: `apps/front/src/lib/seo/schemas.ts`

Three small modules that consumers use to build SEO output: canonical URL helper, per-page meta tag builder, and schema.org schema builders.

- [ ] **Step 1: Create `canonical.ts`**

Create `apps/front/src/lib/seo/canonical.ts` with:

```ts
// The canonical hostname for absolute URLs in sitemap / canonical / og:url.
// Set via VITE_APP_URL in .env.* files. Falls back to the production domain
// so dev sitemap doesn't break, but localhost dev should set the env var.
export const getBaseUrl = (): string => {
	return import.meta.env.VITE_APP_URL ?? 'https://publyapp.com';
};

// Build an absolute canonical URL from a request pathname. Strips query
// string (canonical points to the parameter-less form) and forces a
// trailing slash (matches the marketing trailing-slash policy).
export const buildCanonicalUrl = (pathname: string): string => {
	const base = getBaseUrl();
	const cleanPath = pathname.split('?')[0] ?? pathname;
	const withSlash = cleanPath.endsWith('/') ? cleanPath : `${cleanPath}/`;
	return `${base}${withSlash}`;
};
```

- [ ] **Step 2: Create `meta.ts`**

Create `apps/front/src/lib/seo/meta.ts` with:

```ts
import type { MetaDescriptor } from 'react-router';

import { buildCanonicalUrl, getBaseUrl } from './canonical';

// ----------------------------------------------------------------------

export type SeoMetaInput = {
	title: string;
	description: string;
	pathname: string;
	// Optional. Defaults to '/og-image-default.jpg' joined onto getBaseUrl().
	ogImage?: string;
	// Optional. Defaults to 'website'.
	ogType?: 'website' | 'article';
	// Optional. Defaults to 'summary_large_image'.
	twitterCard?: 'summary' | 'summary_large_image';
};

// Returns the full set of MetaDescriptors for a marketing page's `meta` export.
// Includes title, description, og:* (Title/Description/URL/Image/Type/SiteName),
// twitter:* (card/title/description/image), and rel=canonical.
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

- [ ] **Step 3: Create `schemas.ts`**

Create `apps/front/src/lib/seo/schemas.ts` with:

```ts
import type { BlogAuthor, BlogPost } from '#app/routes/marketing/_data/blog.ts';
import { unsplashCover } from '#app/routes/marketing/_data/blog.ts';

import { getBaseUrl } from './canonical';

// ----------------------------------------------------------------------

const ORG_NAME = 'PublyApp';
const ORG_LOGO_PATH = '/logo-512.png';
// Placeholder social URLs — replace with real account URLs when accounts exist.
const ORG_SAME_AS = [
	'https://x.com/publyapp',
	'https://linkedin.com/company/publyapp',
];

// ----------------------------------------------------------------------

export const buildOrganizationSchema = (): Record<string, unknown> => {
	const base = getBaseUrl();
	return {
		'@context': 'https://schema.org',
		'@type': 'Organization',
		name: ORG_NAME,
		url: `${base}/`,
		logo: `${base}${ORG_LOGO_PATH}`,
		sameAs: ORG_SAME_AS,
	};
};

// ----------------------------------------------------------------------

export const buildWebSiteSchema = (): Record<string, unknown> => {
	const base = getBaseUrl();
	return {
		'@context': 'https://schema.org',
		'@type': 'WebSite',
		name: ORG_NAME,
		url: `${base}/`,
		potentialAction: {
			'@type': 'SearchAction',
			target: `${base}/blog/?tag={search_term_string}`,
			'query-input': 'required name=search_term_string',
		},
	};
};

// ----------------------------------------------------------------------

export const buildBlogPostingSchema = (
	post: BlogPost,
	author: BlogAuthor,
): Record<string, unknown> => {
	const base = getBaseUrl();
	return {
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
			name: ORG_NAME,
			logo: {
				'@type': 'ImageObject',
				url: `${base}${ORG_LOGO_PATH}`,
			},
		},
		mainEntityOfPage: {
			'@type': 'WebPage',
			'@id': `${base}/blog/${post.slug}/`,
		},
	};
};

// ----------------------------------------------------------------------

export type BreadcrumbItem = {
	name: string;
	url: string;
};

export const buildBreadcrumbListSchema = (
	items: BreadcrumbItem[],
): Record<string, unknown> => {
	return {
		'@context': 'https://schema.org',
		'@type': 'BreadcrumbList',
		itemListElement: items.map((item, i) => {
			return {
				'@type': 'ListItem',
				position: i + 1,
				name: item.name,
				item: item.url,
			};
		}),
	};
};

// ----------------------------------------------------------------------

export type FaqItem = {
	question: string;
	answer: string;
};

export const buildFaqPageSchema = (
	faqs: FaqItem[],
): Record<string, unknown> => {
	return {
		'@context': 'https://schema.org',
		'@type': 'FAQPage',
		mainEntity: faqs.map((faq) => {
			return {
				'@type': 'Question',
				name: faq.question,
				acceptedAnswer: {
					'@type': 'Answer',
					text: faq.answer,
				},
			};
		}),
	};
};
```

Note: `unsplashCover` is exported from `apps/front/src/routes/marketing/_data/blog.ts:250` — confirm by reading that file. If the export is named differently, adjust the import.

- [ ] **Step 4: Verify lint + tsc**

Run: `just check-write && just tsc-front`
Expected: 0 errors. The `BlogPost`, `BlogAuthor`, `unsplashCover` imports must resolve to the actual exports in `blog.ts`. If `tsc` complains about missing exports, check the actual export names in `blog.ts` and adjust.

- [ ] **Step 5: Commit**

```bash
git add apps/front/src/lib/seo/canonical.ts apps/front/src/lib/seo/meta.ts apps/front/src/lib/seo/schemas.ts
git commit -m "feat(front): add SEO library — canonical, meta builder, schemas

- canonical.ts: getBaseUrl() reads VITE_APP_URL with prod fallback;
  buildCanonicalUrl(pathname) strips query + forces trailing slash.
- meta.ts: buildSeoMeta(input) returns MetaDescriptor[] with title,
  description, og:*, twitter:*, rel=canonical.
- schemas.ts: 5 builders (Organization, WebSite, BlogPosting,
  BreadcrumbList, FAQPage) returning typed schema.org objects.

Refs #374

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Per-page meta export migration

**Files:** all marketing route components — modify `meta` exports to use `buildSeoMeta(...)`. Specifically:
- `apps/front/src/routes/marketing/home/home-page.tsx`
- `apps/front/src/routes/marketing/pricing/pricing-page.tsx`
- `apps/front/src/routes/marketing/about/about-page.tsx`
- `apps/front/src/routes/marketing/contact/contact-page.tsx`
- `apps/front/src/routes/marketing/security/security-page.tsx`
- `apps/front/src/routes/marketing/terms/terms-page.tsx`
- `apps/front/src/routes/marketing/privacy/privacy-page.tsx`
- `apps/front/src/routes/marketing/cookies/cookies-page.tsx`
- `apps/front/src/routes/marketing/blog/blog-index-page.tsx`
- `apps/front/src/routes/marketing/blog/blog-article-route.tsx`
- `apps/front/src/routes/marketing/changelog/changelog-page.tsx`

This is a wide task; do it as one commit. The pattern is the same per file.

- [ ] **Step 1: Identify the existing `meta` export pattern**

Open `apps/front/src/routes/marketing/home/home-page.tsx`. Find the existing `meta` export. It currently looks something like:

```tsx
export const meta = ({ loaderData }: Route.MetaArgs) => {
	if (isServer) {
		return get(loaderData, 'meta', []);
	}
	const t: TFunction = i18next.t;
	return [
		{ title: getPageTitle(t, true) },
		{ name: 'description', content: '...' },
	];
};
```

Each page differs slightly. The migration replaces the `return [...]` body with a call to `buildSeoMeta(...)`.

- [ ] **Step 2: Migrate each page's `meta` export**

For each of the 11 files, replace the `meta` export with this pattern (titles/descriptions are placeholders — preserve the actual existing copy from each file; only change the wrapper structure):

For static pages with no per-page slug variation, e.g. `pricing-page.tsx`:

```tsx
import { buildSeoMeta } from '#app/lib/seo/meta.ts';

export const meta = ({ location }: Route.MetaArgs) => {
	return buildSeoMeta({
		title: 'Pricing — PublyApp',
		description: 'Choose the plan that fits your team size and posting volume.',
		pathname: location.pathname,
	});
};
```

For the blog article route `blog-article-route.tsx` (which has a dynamic slug):

```tsx
import { buildSeoMeta } from '#app/lib/seo/meta.ts';
import { unsplashCover } from '#app/routes/marketing/_data/blog.ts';

export const meta = ({ data, location }: Route.MetaArgs) => {
	if (!data?.post) {
		return buildSeoMeta({
			title: 'Article — PublyApp',
			description: 'Article from the PublyApp blog.',
			pathname: location.pathname,
		});
	}
	return buildSeoMeta({
		title: `${data.post.title} — PublyApp`,
		description: data.post.excerpt,
		pathname: location.pathname,
		ogImage: unsplashCover(data.post.coverSlug, 1200, 630),
		ogType: 'article',
	});
};
```

For pages that currently use i18n (`useTranslate` / `i18next.t`) for titles, **preserve those calls** — `buildSeoMeta` accepts strings, so the i18n call result is fine as the `title` argument:

```tsx
const t: TFunction = i18next.t;
return buildSeoMeta({
	title: getPageTitle(t, true),
	description: get(loaderData, 'description', '...'),
	pathname: location.pathname,
});
```

For each file: preserve all existing imports the file already uses (`isServer`, `get`, `i18next`, etc.) — only ADD the `buildSeoMeta` import. Drop any `og:*` / `twitter:*` / `canonical` entries that the prior `meta` export was emitting manually since `buildSeoMeta` now emits them.

- [ ] **Step 3: Verify lint + tsc**

Run: `just check-write && just tsc-front`
Expected: 0 errors. Each page's `meta` export should typecheck against `Route.MetaArgs` for that route's `+types/<route>` import.

- [ ] **Step 4: Manual quick check**

Start the dev server (`just dev-front`). Visit `/`, `/pricing/`, `/about/` (with trailing slash; the layout redirect from Task 3 handles non-slash). View source. Confirm each page has:
- A `<title>` tag with the right title
- A `<meta name="description">` tag with the right description
- A `<link rel="canonical" href="..." />` ending in `/`
- Multiple `<meta property="og:...">` tags
- Multiple `<meta name="twitter:...">` tags

If any page is missing tags, the migration on that file is incomplete — check the diff for that file.

- [ ] **Step 5: Commit**

```bash
git add apps/front/src/routes/marketing/home/home-page.tsx apps/front/src/routes/marketing/pricing/pricing-page.tsx apps/front/src/routes/marketing/about/about-page.tsx apps/front/src/routes/marketing/contact/contact-page.tsx apps/front/src/routes/marketing/security/security-page.tsx apps/front/src/routes/marketing/terms/terms-page.tsx apps/front/src/routes/marketing/privacy/privacy-page.tsx apps/front/src/routes/marketing/cookies/cookies-page.tsx apps/front/src/routes/marketing/blog/blog-index-page.tsx apps/front/src/routes/marketing/blog/blog-article-route.tsx apps/front/src/routes/marketing/changelog/changelog-page.tsx
git commit -m "feat(front): migrate marketing meta exports to buildSeoMeta()

Each marketing page's meta export now returns buildSeoMeta(...) which
emits title + description + og:* + twitter:* + rel=canonical in one
shot. Drops manual og:*/twitter:*/canonical entries from prior meta
exports. Blog article emits article-specific og:type + cover image
override.

Refs #374

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Per-page JSON-LD additions

**Files:**
- Modify: `apps/front/src/routes/marketing/home/home-page.tsx` (Organization + WebSite)
- Modify: `apps/front/src/routes/marketing/pricing/pricing-page.tsx` (FAQPage)
- Modify: `apps/front/src/routes/marketing/about/about-page.tsx` (Organization)
- Modify: `apps/front/src/routes/marketing/contact/contact-page.tsx` (FAQPage)
- Modify: `apps/front/src/routes/marketing/blog/blog-article-route.tsx` (BlogPosting + BreadcrumbList)
- Modify: `apps/front/src/routes/marketing/changelog/changelog-page.tsx` (BreadcrumbList)

JSON-LD scripts go in the page's JSX (NOT the `meta` export — meta only handles meta tags).

- [ ] **Step 1: Home page — Organization + WebSite**

Open `apps/front/src/routes/marketing/home/home-page.tsx`. At the top of the rendered JSX (immediately inside the page component's return), add:

```tsx
import { JsonLd } from '#app/components/json-ld.tsx';
import { buildOrganizationSchema, buildWebSiteSchema } from '#app/lib/seo/schemas.ts';

const HomePage = () => {
	return (
		<>
			<JsonLd schema={buildOrganizationSchema()} />
			<JsonLd schema={buildWebSiteSchema()} />
			{/* ...existing page content... */}
		</>
	);
};
```

If the existing page already returns JSX wrapped in a fragment `<>...</>` or a `<MarketingLayout>` etc., insert the two `<JsonLd>` lines at the very top of that fragment.

- [ ] **Step 2: Pricing page — FAQPage**

Open `apps/front/src/routes/marketing/pricing/pricing-page.tsx`. The page currently has a FAQ section sourced from a data module (likely `_data/pricing-faq.ts` or inline). Identify where the FAQ items are (look for an array of `{ question, answer }` pairs).

At the top of the rendered JSX, add:

```tsx
import { JsonLd } from '#app/components/json-ld.tsx';
import { buildFaqPageSchema } from '#app/lib/seo/schemas.ts';

// Inside the component:
return (
	<>
		<JsonLd schema={buildFaqPageSchema(PRICING_FAQS)} />
		{/* ...existing page content... */}
	</>
);
```

Where `PRICING_FAQS` is the array of `{ question, answer }` pairs already defined in the codebase. If the data structure uses different field names (e.g. `q`/`a` or `title`/`body`), `.map()` it inline to produce `{ question, answer }`:

```tsx
const faqsForSchema: FaqItem[] = PRICING_FAQS.map((f) => ({
	question: f.title,
	answer: f.body,
}));
return (
	<>
		<JsonLd schema={buildFaqPageSchema(faqsForSchema)} />
		{/* ... */}
	</>
);
```

- [ ] **Step 3: About page — Organization**

Open `apps/front/src/routes/marketing/about/about-page.tsx`. At the top of the rendered JSX, add:

```tsx
import { JsonLd } from '#app/components/json-ld.tsx';
import { buildOrganizationSchema } from '#app/lib/seo/schemas.ts';

return (
	<>
		<JsonLd schema={buildOrganizationSchema()} />
		{/* ...existing page content... */}
	</>
);
```

- [ ] **Step 4: Contact page — FAQPage**

Open `apps/front/src/routes/marketing/contact/contact-page.tsx`. Identify where the "Quick answers" section's questions live (data module or inline). Same pattern as pricing:

```tsx
import { JsonLd } from '#app/components/json-ld.tsx';
import { buildFaqPageSchema } from '#app/lib/seo/schemas.ts';

return (
	<>
		<JsonLd schema={buildFaqPageSchema(CONTACT_QUICK_ANSWERS)} />
		{/* ...existing page content... */}
	</>
);
```

- [ ] **Step 5: Blog article route — BlogPosting + BreadcrumbList**

Open `apps/front/src/routes/marketing/blog/blog-article-route.tsx`. Inside the component (which has access to `loaderData.post` and `loaderData.author` or similar), add:

```tsx
import { JsonLd } from '#app/components/json-ld.tsx';
import {
	buildBlogPostingSchema,
	buildBreadcrumbListSchema,
} from '#app/lib/seo/schemas.ts';
import { buildCanonicalUrl } from '#app/lib/seo/canonical.ts';
import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

// Inside the component, after destructuring loaderData.post and the resolved author:
const breadcrumbs = [
	{ name: 'Home', url: buildCanonicalUrl('/') },
	{ name: 'Blog', url: buildCanonicalUrl(FRONT_PATH_NAMES.marketing.blog) },
	{ name: post.title, url: buildCanonicalUrl(FRONT_PATH_NAMES.marketing.blogArticle(post.slug)) },
];

return (
	<>
		<JsonLd schema={buildBlogPostingSchema(post, author)} />
		<JsonLd schema={buildBreadcrumbListSchema(breadcrumbs)} />
		{/* ...existing article rendering... */}
	</>
);
```

If the variable names differ (e.g. the loader returns `data.blogPost` instead of `data.post`), adapt accordingly. Read the file first to identify the actual variable names.

- [ ] **Step 6: Changelog page — BreadcrumbList**

Open `apps/front/src/routes/marketing/changelog/changelog-page.tsx`. The page is keyed on a `:year` param. Inside the component (which has access to `params.year`), add:

```tsx
import { JsonLd } from '#app/components/json-ld.tsx';
import { buildBreadcrumbListSchema } from '#app/lib/seo/schemas.ts';
import { buildCanonicalUrl } from '#app/lib/seo/canonical.ts';
import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

// Inside the component:
const breadcrumbs = [
	{ name: 'Home', url: buildCanonicalUrl('/') },
	{ name: 'Changelog', url: buildCanonicalUrl(FRONT_PATH_NAMES.marketing.changelog) },
	{ name: `${params.year}`, url: buildCanonicalUrl(FRONT_PATH_NAMES.marketing.changelogYear(params.year)) },
];

return (
	<>
		<JsonLd schema={buildBreadcrumbListSchema(breadcrumbs)} />
		{/* ...existing changelog rendering... */}
	</>
);
```

- [ ] **Step 7: Verify lint + tsc**

Run: `just check-write && just tsc-front`
Expected: 0 errors.

- [ ] **Step 8: Manual quick check**

`just dev-front`, visit `/`, view-source, confirm:

```html
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization", ...}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite", ...}</script>
```

Visit `/blog/<some-slug>/` and confirm BlogPosting + BreadcrumbList scripts. Visit `/pricing/` and confirm FAQPage script. Use Google's Rich Results Test on a deployed URL (or paste view-source contents into the URL/code panel) to validate.

- [ ] **Step 9: Commit**

```bash
git add apps/front/src/routes/marketing/home/home-page.tsx apps/front/src/routes/marketing/pricing/pricing-page.tsx apps/front/src/routes/marketing/about/about-page.tsx apps/front/src/routes/marketing/contact/contact-page.tsx apps/front/src/routes/marketing/blog/blog-article-route.tsx apps/front/src/routes/marketing/changelog/changelog-page.tsx
git commit -m "feat(front): add JSON-LD structured data per surface

- Home: Organization + WebSite (with sitelinks search box action).
- Pricing: FAQPage (built from PRICING_FAQS data).
- About: Organization.
- Contact: FAQPage (built from CONTACT_QUICK_ANSWERS).
- Blog article: BlogPosting + BreadcrumbList.
- Changelog year: BreadcrumbList.

Each rendered via the new <JsonLd> primitive inside the page JSX.

Refs #374

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: sitemap.xml route

**Files:**
- Create: `apps/front/src/routes/sitemap[.]xml.tsx`
- Modify: `apps/front/src/routes.ts` (add route registration)

Loader-only route returning XML.

- [ ] **Step 1: Create the sitemap route file**

Create `apps/front/src/routes/sitemap[.]xml.tsx` with:

```tsx
import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { FEATURES } from '#app/lib/features/flags.ts';
import { getBaseUrl } from '#app/lib/seo/canonical.ts';
import { getPublishedPosts } from '#app/routes/marketing/_data/blog.ts';
import {
	getAvailableYears,
	getEntriesForYear,
} from '#app/routes/marketing/_data/changelog.tsx';
import { COOKIES_LAST_UPDATED } from '#app/routes/marketing/_data/legal-cookies.ts';
import { PRIVACY_LAST_UPDATED } from '#app/routes/marketing/_data/legal-privacy.ts';
import { TERMS_LAST_UPDATED } from '#app/routes/marketing/_data/legal-terms.ts';

import type { Route } from './+types/sitemap[.]xml';

// ----------------------------------------------------------------------

type SitemapEntry = {
	loc: string;
	lastmod: string;
	changefreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
	priority: number;
};

const escapeXml = (input: string): string => {
	return input
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
};

const renderEntry = (entry: SitemapEntry): string => {
	return `  <url>
    <loc>${escapeXml(entry.loc)}</loc>
    <lastmod>${escapeXml(entry.lastmod)}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority.toFixed(1)}</priority>
  </url>`;
};

const renderSitemap = (entries: SitemapEntry[]): string => {
	return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map(renderEntry).join('\n')}
</urlset>
`;
};

// ----------------------------------------------------------------------

const STATIC_LASTMOD_FALLBACK = '2026-05-08';

const buildEntries = (baseUrl: string): SitemapEntry[] => {
	const entries: SitemapEntry[] = [];

	// Home
	entries.push({
		loc: `${baseUrl}/`,
		lastmod: STATIC_LASTMOD_FALLBACK,
		changefreq: 'monthly',
		priority: 1.0,
	});

	// Always-on static
	entries.push({
		loc: `${baseUrl}${FRONT_PATH_NAMES.marketing.pricing}`,
		lastmod: STATIC_LASTMOD_FALLBACK,
		changefreq: 'monthly',
		priority: 0.9,
	});

	// Flagged static
	if (FEATURES.marketing.about) {
		entries.push({
			loc: `${baseUrl}${FRONT_PATH_NAMES.marketing.about}`,
			lastmod: STATIC_LASTMOD_FALLBACK,
			changefreq: 'monthly',
			priority: 0.7,
		});
	}
	if (FEATURES.marketing.contact) {
		entries.push({
			loc: `${baseUrl}${FRONT_PATH_NAMES.marketing.contact}`,
			lastmod: STATIC_LASTMOD_FALLBACK,
			changefreq: 'monthly',
			priority: 0.7,
		});
	}
	if (FEATURES.marketing.security) {
		entries.push({
			loc: `${baseUrl}${FRONT_PATH_NAMES.marketing.security}`,
			lastmod: STATIC_LASTMOD_FALLBACK,
			changefreq: 'monthly',
			priority: 0.7,
		});
	}

	// Legal trio (always on)
	entries.push({
		loc: `${baseUrl}${FRONT_PATH_NAMES.marketing.terms}`,
		lastmod: TERMS_LAST_UPDATED,
		changefreq: 'yearly',
		priority: 0.3,
	});
	entries.push({
		loc: `${baseUrl}${FRONT_PATH_NAMES.marketing.privacy}`,
		lastmod: PRIVACY_LAST_UPDATED,
		changefreq: 'yearly',
		priority: 0.3,
	});
	entries.push({
		loc: `${baseUrl}${FRONT_PATH_NAMES.marketing.cookies}`,
		lastmod: COOKIES_LAST_UPDATED,
		changefreq: 'yearly',
		priority: 0.3,
	});

	// Blog
	if (FEATURES.marketing.blog) {
		const posts = getPublishedPosts();
		const blogIndexLastmod =
			posts.length > 0 ? posts[0]!.publishedAt : STATIC_LASTMOD_FALLBACK;
		entries.push({
			loc: `${baseUrl}${FRONT_PATH_NAMES.marketing.blog}`,
			lastmod: blogIndexLastmod,
			changefreq: 'weekly',
			priority: 0.8,
		});
		for (const post of posts) {
			entries.push({
				loc: `${baseUrl}${FRONT_PATH_NAMES.marketing.blogArticle(post.slug)}`,
				lastmod: post.publishedAt,
				changefreq: 'monthly',
				priority: 0.7,
			});
		}
	}

	// Changelog
	if (FEATURES.marketing.changelog) {
		const years = getAvailableYears();
		const allEntries = years.flatMap((y) => {
			return getEntriesForYear(y);
		});
		const changelogIndexLastmod =
			allEntries.length > 0
				? (allEntries[0]?.date ?? STATIC_LASTMOD_FALLBACK)
				: STATIC_LASTMOD_FALLBACK;
		entries.push({
			loc: `${baseUrl}${FRONT_PATH_NAMES.marketing.changelog}`,
			lastmod: changelogIndexLastmod,
			changefreq: 'weekly',
			priority: 0.7,
		});
		for (const year of years) {
			const yearEntries = getEntriesForYear(year);
			const yearLastmod =
				yearEntries.length > 0
					? (yearEntries[0]?.date ?? STATIC_LASTMOD_FALLBACK)
					: STATIC_LASTMOD_FALLBACK;
			entries.push({
				loc: `${baseUrl}${FRONT_PATH_NAMES.marketing.changelogYear(year)}`,
				lastmod: yearLastmod,
				changefreq: 'monthly',
				priority: 0.6,
			});
		}
	}

	return entries;
};

// ----------------------------------------------------------------------

export const loader = (_args: Route.LoaderArgs) => {
	const baseUrl = getBaseUrl();
	const entries = buildEntries(baseUrl);
	const xml = renderSitemap(entries);

	return new Response(xml, {
		headers: {
			'Content-Type': 'application/xml; charset=utf-8',
			'Cache-Control': 'public, max-age=3600',
		},
	});
};
```

- [ ] **Step 2: Register the route**

Open `apps/front/src/routes.ts`. Find the `coreRoutes` block. Add a new entry:

```ts
import { actionsRoutes } from './routes/_tree/actions.routes';
// ...existing imports...

const coreRoutes = [
	route(
		getLastPath(FRONT_PATH_NAMES.unauthorized),
		'routes/unauthorized/unauthorized-page.tsx',
	),
	// New: SEO infrastructure routes
	route('sitemap.xml', 'routes/sitemap[.]xml.tsx'),
	route('robots.txt', 'routes/robots[.]txt.tsx'),
];
```

(The `robots.txt` registration is added now even though Task 9 creates the file — registering both at once avoids a tsc complaint about a missing file. If you prefer strict per-task isolation, register only `sitemap.xml` here and add `robots.txt` registration in Task 9. Either works.)

If you opted for per-task strict isolation, register only sitemap.xml in this task:

```ts
const coreRoutes = [
	route(
		getLastPath(FRONT_PATH_NAMES.unauthorized),
		'routes/unauthorized/unauthorized-page.tsx',
	),
	route('sitemap.xml', 'routes/sitemap[.]xml.tsx'),
];
```

- [ ] **Step 3: Verify lint + tsc**

Run: `just check-write && just tsc-front`
Expected: 0 errors. The `+types/sitemap[.]xml` typegen output should be created automatically by `react-router typegen` (which runs as part of `just tsc-front`).

- [ ] **Step 4: Manual quick check**

`just dev-front`, then `curl -i http://localhost:5050/sitemap.xml`. Expected: HTTP 200, `Content-Type: application/xml; charset=utf-8`, body starts with `<?xml version="1.0"` and contains `<urlset>` with entries. Every `<loc>` value ends with `/`.

- [ ] **Step 5: Commit**

```bash
git add apps/front/src/routes/sitemap[.]xml.tsx apps/front/src/routes.ts
git commit -m "feat(front): add /sitemap.xml route

Single sitemap.xml listing all public marketing pages, gated on
FEATURES flags. Static + blog (per published post) + changelog (per
available year). lastmod sourced from per-data-module dates. Every
<loc> ends with trailing slash, matching the marketing canonical
policy. Cached for 1h at the response level.

Refs #374

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: robots.txt route

**Files:**
- Create: `apps/front/src/routes/robots[.]txt.tsx`
- Modify: `apps/front/src/routes.ts` (only if not already registered in Task 8)

Loader-only route returning text/plain.

- [ ] **Step 1: Create the route file**

Create `apps/front/src/routes/robots[.]txt.tsx` with:

```tsx
import { getBaseUrl } from '#app/lib/seo/canonical.ts';

import type { Route } from './+types/robots[.]txt';

// ----------------------------------------------------------------------

const buildRobotsBody = (baseUrl: string): string => {
	return `User-agent: *
Allow: /
Disallow: /api/
Disallow: /staff/
Disallow: /auth/
Disallow: /unauthorized/

Sitemap: ${baseUrl}/sitemap.xml
`;
};

// ----------------------------------------------------------------------

export const loader = (_args: Route.LoaderArgs) => {
	const baseUrl = getBaseUrl();
	const body = buildRobotsBody(baseUrl);

	return new Response(body, {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': 'public, max-age=3600',
		},
	});
};
```

- [ ] **Step 2: Register the route (skip if Task 8 already did it)**

If Task 8 only registered `sitemap.xml`, add `robots.txt` registration now in `apps/front/src/routes.ts`:

```ts
const coreRoutes = [
	route(
		getLastPath(FRONT_PATH_NAMES.unauthorized),
		'routes/unauthorized/unauthorized-page.tsx',
	),
	route('sitemap.xml', 'routes/sitemap[.]xml.tsx'),
	route('robots.txt', 'routes/robots[.]txt.tsx'),
];
```

- [ ] **Step 3: Verify lint + tsc**

Run: `just check-write && just tsc-front`
Expected: 0 errors.

- [ ] **Step 4: Manual quick check**

`just dev-front`, then `curl -i http://localhost:5050/robots.txt`. Expected: HTTP 200, `Content-Type: text/plain; charset=utf-8`, body matches the template above with the actual base URL substituted.

- [ ] **Step 5: Commit**

```bash
git add apps/front/src/routes/robots[.]txt.tsx apps/front/src/routes.ts
git commit -m "feat(front): add /robots.txt route

Allow marketing surface, disallow /api, /staff, /auth, /unauthorized.
Reference the sitemap URL. Cached for 1h.

Refs #374

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Default OG image asset + env var documentation

**Files:**
- Create: `apps/front/public/og-image-default.jpg.PLACEHOLDER.txt` (placeholder text file documenting what's expected)
- Modify: `.env.development.example` (add `VITE_APP_URL` documentation)

The actual JPG asset can't be generated by code — instructions for the user.

- [ ] **Step 1: Create the placeholder text file**

Create `apps/front/public/og-image-default.jpg.PLACEHOLDER.txt` with:

```
This file is a placeholder reminder.

Replace this with `og-image-default.jpg` (1200×630, ~80KB target) before
flipping `VITE_FEATURE_MARKETING_*` flags ON in production. The marketing
SEO meta builder (`apps/front/src/lib/seo/meta.ts`) defaults `og:image`
to `/og-image-default.jpg` when a per-page image isn't specified.

Recommended image:
- Branded gradient background matching the marketing surface
- "PublyApp" wordmark
- Tagline (e.g. "Modern social media management")
- Format: JPEG (smaller than PNG for this content)
- Dimensions: exactly 1200×630 (Open Graph + Twitter standard)

Drop the JPG at `apps/front/public/og-image-default.jpg` and delete
this placeholder file.
```

- [ ] **Step 2: Document `VITE_APP_URL`**

Open `.env.development.example` (at the repo root). Find the section for marketing-related env vars (or add one if absent). Append:

```
# Canonical hostname for marketing SEO (sitemap, canonical URLs, og:url).
# Falls back to https://publyapp.com if unset, but always set it for
# local dev so canonical URLs reflect the local origin.
VITE_APP_URL=http://localhost:5050
```

If `.env.development.example` doesn't exist, create it. If `.env.development` (committed) is what the project actually uses for dev defaults, document there instead — read the existing pattern in the repo first.

- [ ] **Step 3: Verify lint + tsc**

Run: `just check-write`
Expected: 0 errors. (No `tsc` impact since these are docs/asset files.)

- [ ] **Step 4: Commit**

```bash
git add apps/front/public/og-image-default.jpg.PLACEHOLDER.txt .env.development.example
git commit -m "docs(front): add OG image placeholder + VITE_APP_URL docs

Placeholder text file at apps/front/public/og-image-default.jpg.PLACEHOLDER.txt
explaining the expected 1200x630 default OG image. Document VITE_APP_URL
in .env.development.example as the canonical hostname for SEO output.

Refs #374

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Final verification + open PR

**Files:** none modified.

- [ ] **Step 1: Full lint + format pass**

Run: `just check-write`
Expected: 0 errors.

- [ ] **Step 2: Full TypeScript pass**

Run: `just tsc-front`
Expected: 0 errors.

- [ ] **Step 3: Manual smoke (curl-able parts)**

`just dev-front`, then in another terminal:

```bash
curl -i http://localhost:5050/sitemap.xml
curl -i http://localhost:5050/robots.txt
curl -i http://localhost:5050/pricing      # expect 301 redirect
curl -i http://localhost:5050/pricing/     # expect 200
```

- Sitemap: 200, application/xml, includes ≥ 14 `<url>` entries, every `<loc>` ends with `/`
- Robots: 200, text/plain, has the expected directives + Sitemap reference
- `/pricing` (no slash): 301 redirect to `/pricing/` (Location header)
- `/pricing/`: 200, page renders

- [ ] **Step 4: Manual smoke (browser)**

Open `view-source:http://localhost:5050/`. Confirm:
- `<title>`, `<meta name="description">`
- `<link rel="canonical" href="...:5050/">` (note trailing slash)
- Multiple `<meta property="og:...">` tags
- Multiple `<meta name="twitter:...">` tags
- Two `<script type="application/ld+json">` tags (Organization + WebSite)

Visit `view-source:http://localhost:5050/pricing/`. Confirm one `<script type="application/ld+json">` (FAQPage) plus the standard meta set.

Visit `view-source:http://localhost:5050/blog/<a-slug>/`. Confirm two `<script type="application/ld+json">` blocks (BlogPosting + BreadcrumbList) plus the standard meta set with `og:type=article`.

- [ ] **Step 5: External validation (post-deploy step, document but skip locally)**

Document for the PR reviewer:

- Google Rich Results Test: <https://search.google.com/test/rich-results> — paste a deployed URL (post-merge step)
- Facebook Sharing Debugger: <https://developers.facebook.com/tools/debug/> — paste a deployed URL (post-merge step)
- Twitter Card Validator: <https://cards-dev.twitter.com/validator> — paste a deployed URL (post-merge step)

Skip these for now — they require a public URL.

- [ ] **Step 6: Commit log sanity check**

Run: `git log develop..HEAD --oneline`
Expected: ~12 commits (1 spec + 1 plan + 10 implementation tasks).

- [ ] **Step 7: Push + open PR**

```bash
git push -u origin feature/seo-infra

gh pr create --title "feat(front): marketing SEO infrastructure" --body "$(cat <<'EOF'
## Summary

- Trailing-slash refactor on \`FRONT_PATH_NAMES.marketing.*\` (with new \`marketingPath()\` helper + \`blogArticle(slug)\`/\`changelogYear(year)\` dynamic helpers); 7 inline URL builders migrated.
- Marketing-layout loader 301-redirects non-slash URLs to slash form. Auth/dashboard routes intentionally unchanged.
- \`<JsonLd>\` primitive at \`apps/front/src/components/json-ld.tsx\`.
- New \`apps/front/src/lib/seo/\` library: \`canonical.ts\`, \`meta.ts\` (\`buildSeoMeta()\`), \`schemas.ts\` (5 schema builders).
- Per-page \`meta\` exports migrated to use \`buildSeoMeta()\` (11 marketing pages).
- Per-surface JSON-LD additions: home (Org + WebSite), pricing (FAQ), about (Org), contact (FAQ), blog article (BlogPosting + Breadcrumb), changelog year (Breadcrumb).
- New routes: \`/sitemap.xml\`, \`/robots.txt\` (loader-only, raw Response).
- Documentation: \`og-image-default.jpg.PLACEHOLDER.txt\`, \`VITE_APP_URL\` in \`.env.development.example\`.

Closes #374

## Test plan

- [x] \`just check-write\`
- [x] \`just tsc-front\`
- [ ] Manual smoke:
  - [ ] \`curl http://localhost:5050/sitemap.xml\` → 200, application/xml, ≥ 14 entries, all \`<loc>\` have trailing slash
  - [ ] \`curl http://localhost:5050/robots.txt\` → 200, text/plain, expected directives + Sitemap reference
  - [ ] \`curl -i http://localhost:5050/pricing\` → 301 redirect to \`/pricing/\`
  - [ ] view-source on \`/\` → \`<link rel=canonical>\` ends in \`/\`, og:* + twitter:* present, JSON-LD Organization + WebSite scripts
  - [ ] view-source on \`/blog/<slug>/\` → JSON-LD BlogPosting + Breadcrumb scripts, \`og:type=article\`
  - [ ] view-source on \`/pricing/\` → JSON-LD FAQPage script
- [ ] Drop a real 1200×630 \`apps/front/public/og-image-default.jpg\` (placeholder reminder file in the diff)
- [ ] Set \`VITE_APP_URL\` in production env (Dokploy)
- [ ] Post-merge: Google Rich Results Test on deployed URLs; Facebook Sharing Debugger; Twitter Card Validator; submit sitemap to Google Search Console + Bing Webmaster Tools

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 8: Report PR URL**

Capture the PR URL and report it.

---

## Self-review notes (already applied)

- **Spec coverage:** every acceptance criterion in `docs/superpowers/specs/2026-05-08-marketing-seo-infrastructure-design.md` maps to at least one task above:
  - sitemap.xml → Task 8
  - robots.txt → Task 9
  - JsonLd primitive → Task 4
  - 5 schema builders → Task 5
  - Per-surface schema rendered on right page → Task 7
  - buildSeoMeta + per-page meta exports → Tasks 5 + 6
  - canonical with trailing slash → Tasks 1 + 5
  - og:image default + per-page override → Tasks 5 + 6 + 10
  - twitter:card default → Task 5
  - Marketing-layout loader redirect → Task 3
  - FRONT_PATH_NAMES.marketing.* trailing slashes → Task 1
  - Dynamic helpers + inline migrations → Tasks 1 + 2
  - VITE_APP_URL documented → Task 10
  - lint + tsc pass → Task 11

- **No placeholders:** every step has concrete code or commands. Where a per-page detail varies (e.g. PRICING_FAQS data shape), the plan tells the implementer to inspect the file first and provides the migration pattern.

- **Type consistency:** `SitemapEntry`, `SeoMetaInput`, `BreadcrumbItem`, `FaqItem`, `marketingPath`, `getBaseUrl`, `buildCanonicalUrl`, `buildSeoMeta`, schema builder names — all defined exactly once and referenced consistently across tasks.

- **Cross-task ordering:** Task 1 (constants) MUST precede Task 2 (inline URL migrations). Task 4 (JsonLd) MUST precede Task 7 (consumers). Task 5 (SEO library) MUST precede Tasks 6 + 7 + 8 + 9.
