# Phase 4 — Marketing Blog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/blog` (index) + `/blog/:slug` (article) routes under `MarketingLayout`, gated behind `FEATURES.marketing.blog`. Static placeholder data with 4 posts; functional tag filtering with shareable nuqs URL state; full article kit (cover hero + body + sticky share rail + related posts).

**Architecture:** Two new primitives in `_components/` (`BlogPostCard` with variant prop, `BlogArticlePage` with hero + body slot + share rail + related posts). One data module (`_data/blog.ts`) with types + 4 posts + `unsplashCover` URL helper. Per-post body files in `_articles/` compose the article primitive with inline JSX (legal-page idiom). Article-route shim does slug lookup + lazy-imports the matching component.

**Tech Stack:** React 19, React Router v7 (file-based routes + `meta` exports), MUI v6 (`sx` only), nuqs (URL state — already in repo), the existing `<Image>` primitive (lazy-loaded covers with `ratio` prop), Iconify (`ph:*` Phosphor icons).

**Spec:** `docs/superpowers/specs/2026-05-03-marketing-blog-design.md`

**Predecessors (shipped):**
- `docs/superpowers/plans/2026-05-01-marketing-pricing-implementation.md` (Phase 1)
- `docs/superpowers/plans/2026-05-02-marketing-legal-implementation.md` (Phase 2)
- `docs/superpowers/plans/2026-05-03-marketing-company-trio-and-404-implementation.md` (Phase 3)

---

## Reference: how to fetch a canvas

Several tasks below say "fetch the canvas." Use the AIDesigner MCP tool:

```
mcp__aidesigner__get_canvas with canvas_id: "42ba72a3-52de-4c9d-adf9-7e0f74953f69"   // Blog index (light)
mcp__aidesigner__get_canvas with canvas_id: "a9b20a6e-02a5-4124-bd13-79e539201e3f"   // Blog article (light)
```

The returned HTML is Tailwind-based. Treat it as the source of truth for visual layout, copy direction, icon choices, spacing, and section ordering. Translate to MUI `sx` using `docs/guides/tailwind-to-sx-mapping.md` and follow the conventions in `docs/guides/marketing-surface-conventions.md`. Light only — derive dark mode from theme tokens.

---

## Task 1: Register the `ph:link-bold` icon

**Files:**
- Modify: `apps/front/src/components/iconify/icon-sets.ts`

The share rail's "copy link" button needs `ph:link-bold`. All other blog icons (`ph:x-logo-fill`, `ph:linkedin-logo-fill`, `ph:check-bold`, `ph:clock-bold`, `ph:tag-bold`, `ph:arrow-right-bold`) are already registered.

- [ ] **Step 1: Fetch the icon SVG body**

```bash
curl -s "https://api.iconify.design/ph.json?icons=link-bold"
```

Expected output (as of writing): `{"prefix":"ph","lastModified":...,"width":256,"height":256,"icons":{"link-bold":{"body":"<path fill=\"currentColor\" d=\"M137.54 186.36a8 8 0 0 1 0 11.31l-9.94 9.95a60 60 0 0 1-84.85-84.86l24.49-24.5a60 60 0 0 1 79.66-4.69a8 8 0 1 1-9.85 12.61a44 44 0 0 0-58.41 3.41l-24.5 24.49a44 44 0 0 0 62.23 62.24l9.94-9.95a8 8 0 0 1 11.32 0Zm74.71-160.6a60.08 60.08 0 0 0-84.86 0l-9.94 9.94a8 8 0 0 0 11.32 11.32l9.94-9.94a44 44 0 0 1 62.23 62.23l-24.5 24.5a44 44 0 0 1-58.4 3.41a8 8 0 1 0-9.85 12.61a60 60 0 0 0 79.65-4.69l24.5-24.5a60.07 60.07 0 0 0-.09-84.88Z\"/>"}}}`

If the SVG body has changed since the plan was written, use whatever `body`/`width`/`height` the API returns.

- [ ] **Step 2: Add to icon-sets.ts**

Locate `'ph:lifebuoy-bold'` (registered Task 7 of Phase 3). Insert `'ph:link-bold'` alphabetically between `'ph:lifebuoy-bold'` and `'ph:linkedin-logo-fill'`:

```ts
'ph:link-bold': {
	body: '<path fill="currentColor" d="M137.54 186.36a8 8 0 0 1 0 11.31l-9.94 9.95a60 60 0 0 1-84.85-84.86l24.49-24.5a60 60 0 0 1 79.66-4.69a8 8 0 1 1-9.85 12.61a44 44 0 0 0-58.41 3.41l-24.5 24.49a44 44 0 0 0 62.23 62.24l9.94-9.95a8 8 0 0 1 11.32 0Zm74.71-160.6a60.08 60.08 0 0 0-84.86 0l-9.94 9.94a8 8 0 0 0 11.32 11.32l9.94-9.94a44 44 0 0 1 62.23 62.23l-24.5 24.5a44 44 0 0 1-58.4 3.41a8 8 0 1 0-9.85 12.61a60 60 0 0 0 79.65-4.69l24.5-24.5a60.07 60.07 0 0 0-.09-84.88Z"/>',
	width: 256,
	height: 256,
},
```

- [ ] **Step 3: Verify type-check**

Run: `just tsc-front`
Expected: clean exit (the `IconifyName` type union is regenerated to include `'ph:link-bold'`).

- [ ] **Step 4: Commit**

```bash
git add apps/front/src/components/iconify/icon-sets.ts
git commit -m "feat(front): register ph:link-bold icon for blog share rail"
```

---

## Task 2: Write the data module (`_data/blog.ts`)

**Files:**
- Create: `apps/front/src/routes/marketing/_data/blog.ts`

The data module is the single source of truth for blog tags, authors, posts, and the `unsplashCover` URL helper.

- [ ] **Step 1: Write the file**

Create `apps/front/src/routes/marketing/_data/blog.ts`:

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

// 3 reused authors so the byline rotation feels real on a 4-post catalogue.
// Photo slugs match TEAM_MEMBERS in _data/about.ts (same Unsplash portraits).
const portraitUrl = (slug: string): string => {
	return `https://images.unsplash.com/photo-${slug}?w=240&h=240&fit=crop&crop=faces&auto=format&q=80`;
};

export const BLOG_AUTHORS: Record<string, BlogAuthor> = {
	'marcus-reynolds': {
		id: 'marcus-reynolds',
		name: 'Marcus Reynolds',
		role: 'CEO & Co-founder',
		photoUrl: portraitUrl('1507003211169-0a1dd7228f2d'),
	},
	'sarah-jenkins': {
		id: 'sarah-jenkins',
		name: 'Sarah Jenkins',
		role: 'CTO & Co-founder',
		photoUrl: portraitUrl('1438761681033-6461ffad8d80'),
	},
	'elena-rodriguez': {
		id: 'elena-rodriguez',
		name: 'Elena Rodriguez',
		role: 'Head of Product',
		photoUrl: portraitUrl('1494790108377-be9c29b29330'),
	},
};

// ----------------------------------------------------------------------

export type BlogPost = {
	slug: string;
	title: string;
	excerpt: string;
	coverSlug: string; // Unsplash photo slug (e.g. '1551434678-e076c223a692')
	tag: BlogTag;
	publishedAt: string; // ISO date 'YYYY-MM-DD'
	readingMinutes: number;
	authorId: keyof typeof BLOG_AUTHORS;
	featured?: boolean;
};

// Placeholder posts. Replace pre-launch with real content. Keep one entry
// flagged `featured: true` (the index page renders it in the featured slot).
export const BLOG_POSTS: BlogPost[] = [
	{
		slug: 'multi-tenant-architecture-lessons',
		title: 'Multi-tenant architecture: the three lessons we learned the hard way',
		excerpt:
			'Building for thousands of brands without leaking data between them sounds simple until you ship it. Here\'s what we wish we knew sooner.',
		coverSlug: '1551434678-e076c223a692',
		tag: 'engineering',
		publishedAt: '2026-04-12',
		readingMinutes: 8,
		authorId: 'sarah-jenkins',
		featured: true,
	},
	{
		slug: 'shipping-daily-without-burning-out',
		title: 'Shipping daily without burning out',
		excerpt:
			'Continuous deployment isn\'t a tooling problem — it\'s a discipline problem. Here\'s the rhythm that\'s worked for us across 18 months.',
		coverSlug: '1499750310107-5fef28a66643',
		tag: 'ops',
		publishedAt: '2026-03-28',
		readingMinutes: 6,
		authorId: 'marcus-reynolds',
	},
	{
		slug: 'why-we-rewrote-our-scheduler',
		title: 'Why we rewrote our scheduler (and you probably shouldn\'t)',
		excerpt:
			'A rewrite story with a twist: the rewrite worked, but the lessons were almost entirely about the original code we abandoned.',
		coverSlug: '1517694712202-14dd9538aa97',
		tag: 'engineering',
		publishedAt: '2026-03-15',
		readingMinutes: 10,
		authorId: 'sarah-jenkins',
	},
	{
		slug: 'turning-trial-users-into-paying-customers',
		title: 'Turning trial users into paying customers without dark patterns',
		excerpt:
			'Conversion is a design problem, not a sales problem. Six interventions that nudged our trial-to-paid rate by 18 points.',
		coverSlug: '1460925895917-afdab827c52f',
		tag: 'growth',
		publishedAt: '2026-02-22',
		readingMinutes: 7,
		authorId: 'elena-rodriguez',
	},
];

// ----------------------------------------------------------------------

// Builds Unsplash hot-link URL with the right size for the call site. Always
// auto-format + q=80 + cover crop. Use ratio + width via the `<Image>`
// primitive at the call site; this helper just returns the URL.
export const unsplashCover = (
	slug: string,
	opts: { w: number; h: number },
): string => {
	return `https://images.unsplash.com/photo-${slug}?w=${opts.w}&h=${opts.h}&fit=crop&auto=format&q=80`;
};
```

- [ ] **Step 2: Verify type-check**

Run: `just tsc-front`
Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/routes/marketing/_data/blog.ts
git commit -m "feat(front): add blog data module (4 placeholder posts + unsplashCover helper)"
```

---

## Task 3: Build `BlogPostCard` primitive

**Files:**
- Create: `apps/front/src/routes/marketing/_components/blog-post-card.tsx`

Card with `variant: 'standard' | 'featured' | 'compact'` prop. The same component renders the index grid, the index featured slot, and the related-posts footer with appropriate sizing/layout for each context.

- [ ] **Step 1: Write the primitive**

Create `apps/front/src/routes/marketing/_components/blog-post-card.tsx`:

```tsx
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { Image } from '#app/components/image/image.tsx';
import { RouterLink } from '#app/components/router-link.tsx';
import { MarketingEyebrow } from '#app/routes/marketing/_components/marketing-eyebrow.tsx';
import {
	BLOG_AUTHORS,
	type BlogPost,
	BLOG_TAGS,
	unsplashCover,
} from '#app/routes/marketing/_data/blog.ts';

// ----------------------------------------------------------------------

type BlogPostCardVariant = 'standard' | 'featured' | 'compact';

type BlogPostCardProps = {
	post: BlogPost;
	variant?: BlogPostCardVariant;
};

// ----------------------------------------------------------------------

// Cover dimensions per variant. The <Image ratio="..."> prop drives the
// rendered aspect; the URL `w`/`h` ensures we don't fetch a 1600px hero
// for a 200px thumbnail.
const COVER_PRESETS: Record<
	BlogPostCardVariant,
	{ ratio: '16/9' | '2/1' | '1/1'; w: number; h: number }
> = {
	standard: { ratio: '16/9', w: 600, h: 338 },
	featured: { ratio: '2/1', w: 1080, h: 540 },
	compact: { ratio: '1/1', w: 200, h: 200 },
};

// ----------------------------------------------------------------------

const formatPostDate = (iso: string): string => {
	return new Date(iso).toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	});
};

const tagLabel = (value: BlogPost['tag']): string => {
	return BLOG_TAGS.find((t) => t.value === value)?.label ?? value;
};

// ----------------------------------------------------------------------

const ByLine = ({
	post,
	avatarSize = 32,
	titleSize = 13,
	roleSize = 12,
}: {
	post: BlogPost;
	avatarSize?: number;
	titleSize?: number;
	roleSize?: number;
}) => {
	const author = BLOG_AUTHORS[post.authorId];

	return (
		<Stack direction="row" spacing={1.5} alignItems="center">
			<Box
				component="img"
				src={author.photoUrl}
				alt={author.name}
				loading="lazy"
				sx={{
					width: avatarSize,
					height: avatarSize,
					borderRadius: '50%',
					objectFit: 'cover',
					bgcolor: 'background.neutral',
					flexShrink: 0,
				}}
			/>
			<Stack spacing={0}>
				<Typography sx={{ fontSize: titleSize, fontWeight: 700, color: 'text.primary' }}>
					{author.name}
				</Typography>
				<Typography sx={{ fontSize: roleSize, color: 'text.secondary' }}>
					{author.role}
				</Typography>
			</Stack>
		</Stack>
	);
};

const DateAndReadingTime = ({ post, sx }: { post: BlogPost; sx?: object }) => {
	return (
		<Stack
			direction="row"
			spacing={1}
			alignItems="center"
			sx={{ fontSize: 12, color: 'text.secondary', ...sx }}
		>
			<Box component="span">{formatPostDate(post.publishedAt)}</Box>
			<Box component="span" aria-hidden="true">·</Box>
			<Box component="span">{post.readingMinutes} min read</Box>
		</Stack>
	);
};

// ----------------------------------------------------------------------

export const BlogPostCard = ({
	post,
	variant = 'standard',
}: BlogPostCardProps) => {
	const cover = COVER_PRESETS[variant];
	const coverUrl = unsplashCover(post.coverSlug, { w: cover.w, h: cover.h });

	if (variant === 'featured') {
		return (
			<Box
				component={RouterLink}
				href={`/blog/${post.slug}`}
				sx={{
					display: 'grid',
					gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
					gap: { xs: 3, md: 5 },
					alignItems: 'center',
					p: { xs: 3, md: 4 },
					borderRadius: '24px',
					bgcolor: 'background.paper',
					border: '1px solid',
					borderColor: 'divider',
					textDecoration: 'none',
					color: 'inherit',
					transition: 'transform 240ms ease, box-shadow 240ms ease',
					'&:hover': {
						transform: 'translateY(-2px)',
						boxShadow: '0 20px 40px -16px rgba(17,24,39,0.12)',
					},
				}}
			>
				<Image
					src={coverUrl}
					alt={post.title}
					ratio={cover.ratio}
					sx={{ borderRadius: '16px', overflow: 'hidden' }}
				/>
				<Stack spacing={2.5} alignItems="flex-start">
					<MarketingEyebrow label={tagLabel(post.tag)} />
					<Typography
						component="h3"
						sx={{
							fontSize: { xs: 24, md: 32 },
							fontWeight: 700,
							color: 'text.primary',
							lineHeight: 1.2,
							letterSpacing: '-0.01em',
						}}
					>
						{post.title}
					</Typography>
					<Typography sx={{ fontSize: 16, color: 'text.secondary', lineHeight: 1.6 }}>
						{post.excerpt}
					</Typography>
					<Stack spacing={1}>
						<ByLine post={post} avatarSize={40} titleSize={14} roleSize={13} />
						<DateAndReadingTime post={post} />
					</Stack>
				</Stack>
			</Box>
		);
	}

	if (variant === 'compact') {
		return (
			<Box
				component={RouterLink}
				href={`/blog/${post.slug}`}
				sx={{
					display: 'flex',
					gap: 2,
					alignItems: 'center',
					p: 2,
					borderRadius: '12px',
					textDecoration: 'none',
					color: 'inherit',
					transition: 'background-color 240ms ease',
					'&:hover': { bgcolor: 'background.neutral' },
				}}
			>
				<Image
					src={coverUrl}
					alt={post.title}
					ratio={cover.ratio}
					sx={{ width: 64, flexShrink: 0, borderRadius: '8px', overflow: 'hidden' }}
				/>
				<Stack spacing={0.5} sx={{ minWidth: 0 }}>
					<Typography
						sx={{
							fontSize: 13,
							fontWeight: 700,
							color: 'text.primary',
							lineHeight: 1.3,
							display: '-webkit-box',
							WebkitLineClamp: 2,
							WebkitBoxOrient: 'vertical',
							overflow: 'hidden',
						}}
					>
						{post.title}
					</Typography>
					<DateAndReadingTime post={post} sx={{ fontSize: 11 }} />
				</Stack>
			</Box>
		);
	}

	// standard
	return (
		<Box
			component={RouterLink}
			href={`/blog/${post.slug}`}
			sx={{
				display: 'flex',
				flexDirection: 'column',
				borderRadius: '20px',
				bgcolor: 'background.paper',
				border: '1px solid',
				borderColor: 'divider',
				overflow: 'hidden',
				textDecoration: 'none',
				color: 'inherit',
				transition: 'transform 240ms ease, box-shadow 240ms ease',
				'&:hover': {
					transform: 'translateY(-4px)',
					boxShadow: '0 20px 40px -16px rgba(17,24,39,0.12)',
				},
			}}
		>
			<Image src={coverUrl} alt={post.title} ratio={cover.ratio} />
			<Stack
				spacing={2}
				alignItems="flex-start"
				sx={{ p: 3, flex: 1, justifyContent: 'space-between' }}
			>
				<Stack spacing={2} alignItems="flex-start">
					<MarketingEyebrow label={tagLabel(post.tag)} />
					<Typography
						component="h3"
						sx={{
							fontSize: 20,
							fontWeight: 700,
							color: 'text.primary',
							lineHeight: 1.3,
							letterSpacing: '-0.01em',
						}}
					>
						{post.title}
					</Typography>
					<Typography
						sx={{
							fontSize: 14,
							color: 'text.secondary',
							lineHeight: 1.6,
							display: '-webkit-box',
							WebkitLineClamp: 3,
							WebkitBoxOrient: 'vertical',
							overflow: 'hidden',
						}}
					>
						{post.excerpt}
					</Typography>
				</Stack>
				<Stack spacing={1} sx={{ width: '100%' }}>
					<ByLine post={post} />
					<DateAndReadingTime post={post} />
				</Stack>
			</Stack>
		</Box>
	);
};
```

Notes:
- Whole card is a single `<Box component={RouterLink}>` — one navigation target per card (a11y).
- Tag rendered via the canon `MarketingEyebrow` chip.
- Author photo uses `<Box component="img">` for the avatar (small 32–40px circle); the larger cover uses `<Image>`. Avatars don't benefit from `<Image>`'s blur-fade enough to justify the wrapper for a 32px element.
- `flex: 1, justifyContent: 'space-between'` on the standard card body keeps byline pinned to the bottom even when excerpts are short, so a row of cards has aligned bylines.

- [ ] **Step 2: Verify type-check**

Run: `just tsc-front`
Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/routes/marketing/_components/blog-post-card.tsx
git commit -m "feat(front): add BlogPostCard primitive (standard/featured/compact variants)"
```

---

## Task 4: Build `BlogArticlePage` primitive

**Files:**
- Create: `apps/front/src/routes/marketing/_components/blog-article-page.tsx`

Article-page shell: hero with cover + byline + meta, body slot, sticky share rail (lg+) / inline share row (<lg), related-posts footer. Exports `BLOG_H2_SX` + `BLOG_P_SX` for shared prose typography across all per-post body files.

- [ ] **Step 1: Write the primitive**

Create `apps/front/src/routes/marketing/_components/blog-article-page.tsx`:

```tsx
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import type { SxProps, Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

import { Image } from '#app/components/image/image.tsx';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { RouterLink } from '#app/components/router-link.tsx';
import { BlogPostCard } from '#app/routes/marketing/_components/blog-post-card.tsx';
import { MarketingEyebrow } from '#app/routes/marketing/_components/marketing-eyebrow.tsx';
import {
	BLOG_AUTHORS,
	type BlogPost,
	BLOG_POSTS,
	BLOG_TAGS,
	unsplashCover,
} from '#app/routes/marketing/_data/blog.ts';
import { BlogShareRail } from '#app/routes/marketing/_components/blog-share-rail.tsx';

// ----------------------------------------------------------------------
// Shared prose typography — per-article files use these for h2 + p so all
// articles share consistent reading typography. Mirror of LEGAL_H2_SX /
// LEGAL_P_SX from legal-doc-page.tsx.
// ----------------------------------------------------------------------

export const BLOG_H2_SX: SxProps<Theme> = {
	fontSize: { xs: 24, md: 28 },
	fontWeight: 700,
	color: 'text.primary',
	letterSpacing: '-0.01em',
	mt: { xs: 4, md: 6 },
	mb: 2,
	scrollMarginTop: 'calc(var(--layout-header-desktop-height) + 16px)',
};

export const BLOG_P_SX: SxProps<Theme> = {
	fontSize: { xs: 16, md: 17 },
	color: 'text.secondary',
	lineHeight: 1.75,
};

// ----------------------------------------------------------------------

type BlogArticlePageProps = {
	post: BlogPost;
	children: ReactNode;
};

const formatPostDate = (iso: string): string => {
	return new Date(iso).toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
	});
};

const tagLabel = (value: BlogPost['tag']): string => {
	return BLOG_TAGS.find((t) => t.value === value)?.label ?? value;
};

// ----------------------------------------------------------------------

const Breadcrumb = ({ post }: { post: BlogPost }) => {
	return (
		<Stack
			direction="row"
			spacing={1}
			alignItems="center"
			sx={{ fontSize: 13, color: 'text.secondary' }}
		>
			<Box
				component={RouterLink}
				href="/blog"
				sx={{
					color: 'text.secondary',
					textDecoration: 'none',
					'&:hover': { color: 'primary.main' },
				}}
			>
				Blog
			</Box>
			<Iconify icon="ph:arrow-right-bold" width={12} />
			<Box component="span" sx={{ color: 'text.primary', fontWeight: 600 }}>
				{tagLabel(post.tag)}
			</Box>
		</Stack>
	);
};

const ArticleByline = ({ post }: { post: BlogPost }) => {
	const author = BLOG_AUTHORS[post.authorId];

	return (
		<Stack direction="row" spacing={2} alignItems="center" sx={{ flexWrap: 'wrap' }}>
			<Stack direction="row" spacing={1.5} alignItems="center">
				<Box
					component="img"
					src={author.photoUrl}
					alt={author.name}
					loading="lazy"
					sx={{
						width: 44,
						height: 44,
						borderRadius: '50%',
						objectFit: 'cover',
						bgcolor: 'background.neutral',
					}}
				/>
				<Stack spacing={0}>
					<Typography sx={{ fontSize: 14, fontWeight: 700, color: 'text.primary' }}>
						{author.name}
					</Typography>
					<Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
						{author.role}
					</Typography>
				</Stack>
			</Stack>
			<Stack
				direction="row"
				spacing={1.5}
				alignItems="center"
				sx={{ fontSize: 13, color: 'text.secondary' }}
			>
				<Box component="span" aria-hidden="true">·</Box>
				<Box component="span">{formatPostDate(post.publishedAt)}</Box>
				<Box component="span" aria-hidden="true">·</Box>
				<Stack direction="row" spacing={0.5} alignItems="center">
					<Iconify icon="ph:clock-bold" width={14} />
					<Box component="span">{post.readingMinutes} min read</Box>
				</Stack>
			</Stack>
		</Stack>
	);
};

const ArticleHero = ({ post }: { post: BlogPost }) => {
	const coverUrl = unsplashCover(post.coverSlug, { w: 1600, h: 800 });

	return (
		<Box component="header" sx={{ pt: { xs: 6, md: 10 }, pb: { xs: 4, md: 6 } }}>
			<Container maxWidth="md">
				<Stack spacing={3} alignItems="flex-start">
					<Breadcrumb post={post} />
					<MarketingEyebrow label={tagLabel(post.tag)} />
					<Typography
						component="h1"
						sx={{
							fontSize: { xs: 32, md: 48 },
							fontWeight: 800,
							color: 'text.primary',
							lineHeight: 1.15,
							letterSpacing: '-0.02em',
						}}
					>
						{post.title}
					</Typography>
					<ArticleByline post={post} />
				</Stack>
			</Container>
			<Container maxWidth="lg" sx={{ mt: { xs: 4, md: 6 } }}>
				<Image
					src={coverUrl}
					alt={post.title}
					ratio="2/1"
					sx={{ borderRadius: { xs: '16px', md: '24px' }, overflow: 'hidden' }}
				/>
			</Container>
		</Box>
	);
};

const RelatedPosts = ({ post }: { post: BlogPost }) => {
	const related = BLOG_POSTS.filter((p) => {
		return p.tag === post.tag && p.slug !== post.slug;
	}).slice(0, 3);

	if (related.length === 0) {
		return null;
	}

	return (
		<Box component="section" sx={{ py: { xs: 8, md: 12 }, borderTop: '1px solid', borderTopColor: 'divider' }}>
			<Container maxWidth="lg">
				<Stack
					spacing={2}
					sx={{
						maxWidth: 720,
						mx: 'auto',
						mb: { xs: 5, md: 7 },
						alignItems: 'center',
						textAlign: 'center',
					}}
				>
					<MarketingEyebrow label="More to read" />
					<Typography
						component="h2"
						sx={{
							fontSize: { xs: 28, md: 36 },
							fontWeight: 700,
							color: 'text.primary',
							lineHeight: 1.2,
							letterSpacing: '-0.01em',
						}}
					>
						Related posts
					</Typography>
				</Stack>
				<Box
					sx={{
						display: 'grid',
						gridTemplateColumns: {
							xs: '1fr',
							sm: 'repeat(2, 1fr)',
							md: `repeat(${related.length}, 1fr)`,
						},
						gap: 3,
					}}
				>
					{related.map((p) => {
						return <BlogPostCard key={p.slug} post={p} variant="standard" />;
					})}
				</Box>
			</Container>
		</Box>
	);
};

// ----------------------------------------------------------------------

export const BlogArticlePage = ({ post, children }: BlogArticlePageProps) => {
	return (
		<Box component="article">
			<ArticleHero post={post} />

			{/* Body grid: 12-col on lg+ (body in 2..10, share rail in 11),
			    single column on md and below with the share rail rendered above
			    the related-posts footer. */}
			<Container maxWidth="lg" sx={{ py: { xs: 4, md: 8 } }}>
				<Box
					sx={{
						display: 'grid',
						gridTemplateColumns: { xs: '1fr', lg: 'repeat(12, 1fr)' },
						gap: { xs: 4, lg: 6 },
					}}
				>
					<Box
						sx={{
							gridColumn: { lg: '2 / span 8' },
							maxWidth: { xs: '100%', lg: 720 },
							mx: { xs: 0, lg: 'auto' },
						}}
					>
						{children}
					</Box>
					<Box
						sx={{
							display: { xs: 'none', lg: 'block' },
							gridColumn: { lg: '11 / span 1' },
						}}
					>
						<Box sx={{ position: 'sticky', top: 'calc(var(--layout-header-desktop-height) + 24px)' }}>
							<BlogShareRail post={post} orientation="vertical" />
						</Box>
					</Box>
				</Box>
				<Box sx={{ display: { xs: 'flex', lg: 'none' }, justifyContent: 'center', mt: 6 }}>
					<BlogShareRail post={post} orientation="horizontal" />
				</Box>
			</Container>

			<RelatedPosts post={post} />
		</Box>
	);
};
```

Notes:
- `BLOG_H2_SX` includes `scrollMarginTop` so future in-article TOCs can land h2s below the sticky topbar (legal-page convention; cheap to include even if v1 has no TOC).
- Body column is `gridColumn: '2 / span 8'` on lg+ (cols 2 through 9), share rail in col 11. Col 10 is intentional gutter so the body doesn't visually butt up against the rail.
- Related posts grid uses `repeat(${related.length}, 1fr)` so 1 or 2 related posts don't render in a 3-col grid with empty slots.
- `<BlogShareRail>` import path resolves to the file we'll create in Task 5.

- [ ] **Step 2: Verify type-check (will fail until Task 5)**

Run: `just tsc-front`
Expected: error — `Cannot find module '#app/routes/marketing/_components/blog-share-rail.tsx'`. This is expected; Task 5 creates that file.

- [ ] **Step 3: Defer commit**

Don't commit yet — the file imports `BlogShareRail` which doesn't exist until Task 5. Tasks 4 + 5 commit together at the end of Task 5.

---

## Task 5: Build `BlogShareRail` sub-component

**Files:**
- Create: `apps/front/src/routes/marketing/_components/blog-share-rail.tsx`

Share rail with Twitter, LinkedIn, copy-link buttons. Vertical layout for the sticky desktop sidebar; horizontal layout for the mobile inline row. Copy-link uses `navigator.clipboard.writeText` with a `prompt` fallback for older browsers, and shows a 2-second "Copied!" feedback.

- [ ] **Step 1: Write the file**

Create `apps/front/src/routes/marketing/_components/blog-share-rail.tsx`:

```tsx
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState } from 'react';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import type { IconifyName } from '#app/components/iconify/register-icons.ts';
import type { BlogPost } from '#app/routes/marketing/_data/blog.ts';

// ----------------------------------------------------------------------

type BlogShareRailProps = {
	post: BlogPost;
	orientation: 'vertical' | 'horizontal';
};

type ShareTarget = {
	id: 'twitter' | 'linkedin' | 'copy';
	label: string;
	icon: IconifyName;
};

const TARGETS: ShareTarget[] = [
	{ id: 'twitter', label: 'Share on Twitter', icon: 'ph:x-logo-fill' },
	{ id: 'linkedin', label: 'Share on LinkedIn', icon: 'ph:linkedin-logo-fill' },
	{ id: 'copy', label: 'Copy link', icon: 'ph:link-bold' },
];

// ----------------------------------------------------------------------

const buildShareUrl = (
	id: ShareTarget['id'],
	post: BlogPost,
	pageUrl: string,
): string => {
	const text = encodeURIComponent(post.title);
	const url = encodeURIComponent(pageUrl);

	if (id === 'twitter') {
		return `https://twitter.com/intent/tweet?text=${text}&url=${url}`;
	}
	if (id === 'linkedin') {
		return `https://www.linkedin.com/sharing/share-offsite/?url=${url}`;
	}
	return pageUrl;
};

const copyToClipboard = async (text: string): Promise<boolean> => {
	if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch {
			// fall through to prompt fallback
		}
	}
	if (typeof window !== 'undefined') {
		window.prompt('Copy this URL', text);
		return true;
	}
	return false;
};

// ----------------------------------------------------------------------

export const BlogShareRail = ({ post, orientation }: BlogShareRailProps) => {
	const [copied, setCopied] = useState(false);
	const isVertical = orientation === 'vertical';

	const handleClick = async (
		event: React.MouseEvent<HTMLAnchorElement>,
		target: ShareTarget,
	) => {
		if (target.id === 'copy') {
			event.preventDefault();
			const pageUrl =
				typeof window !== 'undefined' ? window.location.href : '';
			const ok = await copyToClipboard(pageUrl);
			if (ok) {
				setCopied(true);
				setTimeout(() => {
					return setCopied(false);
				}, 2000);
			}
		}
	};

	return (
		<Stack
			direction={isVertical ? 'column' : 'row'}
			spacing={1.5}
			alignItems="center"
			sx={{
				p: isVertical ? 1 : 0,
				borderRadius: '999px',
				border: isVertical ? '1px solid' : 'none',
				borderColor: 'divider',
				bgcolor: isVertical ? 'background.paper' : 'transparent',
			}}
			role="group"
			aria-label="Share this article"
		>
			{!isVertical ? (
				<Typography
					sx={{
						fontSize: 12,
						fontWeight: 700,
						textTransform: 'uppercase',
						letterSpacing: '0.12em',
						color: 'text.secondary',
						mr: 1,
					}}
				>
					Share
				</Typography>
			) : null}
			{TARGETS.map((target) => {
				const pageUrl =
					typeof window !== 'undefined' ? window.location.href : '';
				const href =
					target.id === 'copy'
						? '#'
						: buildShareUrl(target.id, post, pageUrl);
				const isExternal = target.id !== 'copy';
				const showCopiedFeedback = target.id === 'copy' && copied;

				return (
					<Box
						key={target.id}
						component="a"
						href={href}
						target={isExternal ? '_blank' : undefined}
						rel={isExternal ? 'noopener noreferrer' : undefined}
						aria-label={target.label}
						title={showCopiedFeedback ? 'Copied!' : target.label}
						onClick={(event) => {
							handleClick(event, target);
						}}
						sx={{
							width: 40,
							height: 40,
							borderRadius: '50%',
							display: 'inline-flex',
							alignItems: 'center',
							justifyContent: 'center',
							color: showCopiedFeedback ? 'primary.main' : 'text.secondary',
							bgcolor: showCopiedFeedback
								? 'primary.lighter'
								: 'background.neutral',
							border: '1px solid',
							borderColor: 'divider',
							textDecoration: 'none',
							transition:
								'transform 240ms ease, color 240ms ease, background-color 240ms ease',
							'&:hover': {
								transform: 'translateY(-2px)',
								color: 'primary.main',
							},
							'&:focus-visible': {
								outline: '2px solid',
								outlineColor: 'primary.main',
								outlineOffset: '2px',
							},
						}}
					>
						<Iconify
							icon={showCopiedFeedback ? 'ph:check-bold' : target.icon}
							width={18}
						/>
					</Box>
				);
			})}
		</Stack>
	);
};
```

Notes:
- Vertical rail wraps in a pill-shaped border container; horizontal row drops the border (cleaner on mobile, where it sits above the related-posts footer).
- "Copied!" feedback swaps the icon to `ph:check-bold` and tints the button primary for 2 seconds.
- `window.location.href` is read at render time inside SSR-safe checks; on the server side it reads as `''` and the buttons still render (graceful — they'll have empty share URLs but the page renders).

- [ ] **Step 2: Verify type-check (Task 4 + 5 together)**

Run: `just tsc-front`
Expected: clean exit (Task 4's `<BlogShareRail>` import now resolves).

- [ ] **Step 3: Commit Tasks 4 + 5 together**

```bash
git add apps/front/src/routes/marketing/_components/blog-article-page.tsx \
        apps/front/src/routes/marketing/_components/blog-share-rail.tsx
git commit -m "feat(front): add BlogArticlePage primitive + BlogShareRail sub-component"
```

---

## Task 6: Build the blog index page

**Files:**
- Create: `apps/front/src/routes/marketing/blog/blog-index-page.tsx`

Composes `MarketingHero` for the page header, then renders the featured card (when no filter active), tag filter pills with nuqs URL state, and a grid of standard cards filtered by tag.

- [ ] **Step 1: Fetch the canvas (optional — for visual reference)**

Use `mcp__aidesigner__get_canvas` with `canvas_id: "42ba72a3-52de-4c9d-adf9-7e0f74953f69"`.

The canvas drives visual decisions on featured-card layout, filter pill styling, and grid spacing. Translate to MUI per `docs/guides/tailwind-to-sx-mapping.md`.

- [ ] **Step 2: Write the page**

Create `apps/front/src/routes/marketing/blog/blog-index-page.tsx`:

```tsx
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { parseAsStringEnum, useQueryState } from 'nuqs';

import { APP_NAME } from '@org/shared-ts/lib/constants';

import { BlogPostCard } from '#app/routes/marketing/_components/blog-post-card.tsx';
import { MarketingHero } from '#app/routes/marketing/_components/marketing-hero.tsx';
import {
	type BlogTag,
	BLOG_POSTS,
	BLOG_TAGS,
} from '#app/routes/marketing/_data/blog.ts';

// ----------------------------------------------------------------------

const TAG_VALUES = BLOG_TAGS.map((t) => {
	return t.value;
}) as BlogTag[];

// ----------------------------------------------------------------------

const FilterPills = ({
	activeTag,
	onChange,
}: {
	activeTag: BlogTag | null;
	onChange: (next: BlogTag | null) => void;
}) => {
	return (
		<Stack
			direction="row"
			spacing={1}
			sx={{
				flexWrap: 'wrap',
				justifyContent: 'center',
				gap: 1,
				rowGap: 1,
			}}
			role="group"
			aria-label="Filter posts by category"
		>
			<FilterPill
				label="All"
				active={activeTag === null}
				onClick={() => {
					return onChange(null);
				}}
			/>
			{BLOG_TAGS.map((tag) => {
				return (
					<FilterPill
						key={tag.value}
						label={tag.label}
						active={activeTag === tag.value}
						onClick={() => {
							return onChange(tag.value);
						}}
					/>
				);
			})}
		</Stack>
	);
};

const FilterPill = ({
	label,
	active,
	onClick,
}: {
	label: string;
	active: boolean;
	onClick: () => void;
}) => {
	return (
		<Box
			component="button"
			type="button"
			onClick={onClick}
			aria-pressed={active}
			sx={{
				display: 'inline-flex',
				alignItems: 'center',
				px: 2,
				py: 1,
				borderRadius: 999,
				fontSize: 13,
				fontWeight: 600,
				cursor: 'pointer',
				border: '1px solid',
				borderColor: active ? 'primary.main' : 'divider',
				bgcolor: active ? 'primary.main' : 'background.paper',
				color: active ? 'common.white' : 'text.primary',
				transition:
					'background-color 240ms ease, color 240ms ease, border-color 240ms ease, transform 240ms ease',
				'&:hover': {
					transform: 'translateY(-1px)',
					borderColor: 'primary.main',
				},
				'&:focus-visible': {
					outline: '2px solid',
					outlineColor: 'primary.main',
					outlineOffset: '2px',
				},
			}}
		>
			{label}
		</Box>
	);
};

const EmptyState = ({ onReset }: { onReset: () => void }) => {
	return (
		<Stack spacing={3} alignItems="center" sx={{ py: 8, textAlign: 'center' }}>
			<Typography sx={{ fontSize: 16, color: 'text.secondary' }}>
				No posts in this category yet — check back soon.
			</Typography>
			<Box
				component="button"
				type="button"
				onClick={onReset}
				sx={{
					display: 'inline-flex',
					alignItems: 'center',
					px: 3,
					py: 1.5,
					borderRadius: 2,
					fontSize: 14,
					fontWeight: 700,
					cursor: 'pointer',
					border: 'none',
					bgcolor: 'primary.main',
					color: 'common.white',
					transition: 'transform 240ms ease',
					'&:hover': { transform: 'translateY(-2px)' },
					'&:focus-visible': {
						outline: '2px solid',
						outlineColor: 'primary.main',
						outlineOffset: '2px',
					},
				}}
			>
				Show all
			</Box>
		</Stack>
	);
};

// ----------------------------------------------------------------------

const BlogIndexPage = () => {
	const [activeTag, setActiveTag] = useQueryState(
		'tag',
		parseAsStringEnum<BlogTag>(TAG_VALUES),
	);

	const featuredPost = BLOG_POSTS.find((p) => {
		return p.featured === true;
	});

	const visiblePosts = activeTag
		? BLOG_POSTS.filter((p) => {
				return p.tag === activeTag;
			})
		: BLOG_POSTS.filter((p) => {
				return p.featured !== true;
			});

	return (
		<>
			<MarketingHero
				eyebrow="Blog"
				title="Stories from the team"
				subhead="Lessons, product updates, and ops playbooks from the operators building PublyApp."
			/>

			<Container maxWidth="lg" sx={{ pb: { xs: 10, md: 16 } }}>
				{activeTag === null && featuredPost ? (
					<Box sx={{ mb: { xs: 6, md: 10 } }}>
						<BlogPostCard post={featuredPost} variant="featured" />
					</Box>
				) : null}

				<Box sx={{ mb: { xs: 4, md: 6 } }}>
					<FilterPills activeTag={activeTag} onChange={setActiveTag} />
				</Box>

				{visiblePosts.length === 0 ? (
					<EmptyState
						onReset={() => {
							return setActiveTag(null);
						}}
					/>
				) : (
					<Box
						sx={{
							display: 'grid',
							gridTemplateColumns: {
								xs: '1fr',
								sm: 'repeat(2, 1fr)',
								md: 'repeat(3, 1fr)',
							},
							gap: 4,
						}}
					>
						{visiblePosts.map((post) => {
							return <BlogPostCard key={post.slug} post={post} variant="standard" />;
						})}
					</Box>
				)}
			</Container>
		</>
	);
};

export default BlogIndexPage;

// ----------------------------------------------------------------------

export const meta = () => {
	return [
		{ title: `Blog | ${APP_NAME}` },
		{
			name: 'description',
			content:
				'Stories, lessons, and product updates from the PublyApp team.',
		},
		{ property: 'og:title', content: `Blog | ${APP_NAME}` },
		{
			property: 'og:description',
			content:
				'Stories, lessons, and product updates from the PublyApp team.',
		},
	];
};
```

Notes:
- Featured card hides when ANY filter is active. Grid renders all matching posts (including the featured one if it matches).
- `FilterPill` is a `<button>` with `aria-pressed` so screen readers announce active state.
- Empty state's "Show all" button clears the nuqs param via `setActiveTag(null)`.

- [ ] **Step 3: Verify type-check**

Run: `just tsc-front`
Expected: clean exit.

- [ ] **Step 4: Commit**

```bash
git add apps/front/src/routes/marketing/blog/blog-index-page.tsx
git commit -m "feat(front): add /blog index page (featured + nuqs filter + standard grid)"
```

---

## Task 7: Build per-article body files

**Files:**
- Create: `apps/front/src/routes/marketing/blog/_articles/multi-tenant-architecture-lessons-article.tsx`
- Create: `apps/front/src/routes/marketing/blog/_articles/shipping-daily-without-burning-out-article.tsx`
- Create: `apps/front/src/routes/marketing/blog/_articles/why-we-rewrote-our-scheduler-article.tsx`
- Create: `apps/front/src/routes/marketing/blog/_articles/turning-trial-users-into-paying-customers-article.tsx`

One file per `BlogPost` in `BLOG_POSTS`. Each composes `<BlogArticlePage post={POST}>` with inline JSX body using `BLOG_H2_SX` + `BLOG_P_SX`. All four files follow the same skeleton — only body content differs.

- [ ] **Step 1: Write the multi-tenant article**

Create `apps/front/src/routes/marketing/blog/_articles/multi-tenant-architecture-lessons-article.tsx`:

```tsx
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import {
	BLOG_H2_SX,
	BLOG_P_SX,
	BlogArticlePage,
} from '#app/routes/marketing/_components/blog-article-page.tsx';
import { BLOG_POSTS } from '#app/routes/marketing/_data/blog.ts';

// ----------------------------------------------------------------------

const POST = BLOG_POSTS.find((p) => {
	return p.slug === 'multi-tenant-architecture-lessons';
});

if (!POST) {
	throw new Error(
		'BlogPost "multi-tenant-architecture-lessons" not found in BLOG_POSTS — slug mismatch with _data/blog.ts',
	);
}

// ----------------------------------------------------------------------

const MultiTenantArchitectureLessonsArticle = () => {
	return (
		<BlogArticlePage post={POST}>
			<Stack spacing={4}>
				<Typography sx={BLOG_P_SX}>
					When we set out to build PublyApp, multi-tenancy felt like a checkbox
					— pick a strategy, wire it up, ship. Eighteen months and a few
					production incidents later, the strategy has cost us less sleep than
					the assumptions around it.
				</Typography>

				<Box component="section">
					<Typography component="h2" id="data-isolation-is-a-spectrum" sx={BLOG_H2_SX}>
						Data isolation is a spectrum, not a switch
					</Typography>
					<Typography sx={BLOG_P_SX}>
						We started with shared schemas + tenant_id columns. It felt
						pragmatic. Then a query missed a WHERE clause during a refactor and
						leaked one tenant's audit log into another's exports. The fix
						wasn't to switch isolation models; it was to add row-level security
						as a defense in depth. The lesson: pick a primary isolation model,
						but assume any single layer will fail.
					</Typography>
				</Box>

				<Box component="section">
					<Typography component="h2" id="migrations-get-harder-not-easier" sx={BLOG_H2_SX}>
						Migrations get harder, not easier
					</Typography>
					<Typography sx={BLOG_P_SX}>
						Single-tenant migrations are stressful but bounded. Multi-tenant
						migrations cascade — every schema change touches every tenant
						simultaneously. We learned to write migrations that work in three
						passes: add the new shape, dual-write to both, then remove the old.
						Each pass deploys independently. It triples the timeline, but the
						rollback story is "stop deploying" instead of "restore from
						backup."
					</Typography>
				</Box>

				<Box component="section">
					<Typography component="h2" id="observability-is-tenant-shaped" sx={BLOG_H2_SX}>
						Observability is tenant-shaped
					</Typography>
					<Typography sx={BLOG_P_SX}>
						A 99% success rate sounds great. It's catastrophic when 1% of
						tenants are at 100% failure. Every dashboard, alert, and SLO we
						track has a per-tenant cardinality dimension. Datadog's bill went
						up; our incident response time went down by an order of magnitude.
					</Typography>
				</Box>

				<Box component="section">
					<Typography component="h2" id="if-we-started-over" sx={BLOG_H2_SX}>
						If we started over
					</Typography>
					<Typography sx={BLOG_P_SX}>
						Same primary isolation strategy. Same database. We'd add
						row-level-security from day one (instead of bolted on after the
						incident), commit to three-pass migrations as a discipline (not as
						an emergency response), and budget for per-tenant observability up
						front. The rest is execution.
					</Typography>
				</Box>
			</Stack>
		</BlogArticlePage>
	);
};

export default MultiTenantArchitectureLessonsArticle;
```

- [ ] **Step 2: Write the shipping-daily article**

Create `apps/front/src/routes/marketing/blog/_articles/shipping-daily-without-burning-out-article.tsx`:

```tsx
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import {
	BLOG_H2_SX,
	BLOG_P_SX,
	BlogArticlePage,
} from '#app/routes/marketing/_components/blog-article-page.tsx';
import { BLOG_POSTS } from '#app/routes/marketing/_data/blog.ts';

// ----------------------------------------------------------------------

const POST = BLOG_POSTS.find((p) => {
	return p.slug === 'shipping-daily-without-burning-out';
});

if (!POST) {
	throw new Error(
		'BlogPost "shipping-daily-without-burning-out" not found in BLOG_POSTS — slug mismatch with _data/blog.ts',
	);
}

// ----------------------------------------------------------------------

const ShippingDailyWithoutBurningOutArticle = () => {
	return (
		<BlogArticlePage post={POST}>
			<Stack spacing={4}>
				<Typography sx={BLOG_P_SX}>
					"Ship daily" is one of our values. It's also the value most likely to
					get misread. Daily isn't urgency — it's discipline. Here's the rhythm
					that's worked for us across 18 months and zero burnouts.
				</Typography>

				<Box component="section">
					<Typography component="h2" id="small-units-of-work" sx={BLOG_H2_SX}>
						Small units of work
					</Typography>
					<Typography sx={BLOG_P_SX}>
						The hardest part of shipping daily isn't the deploy — it's
						breaking work into pieces that fit in a day. We treat &gt; 1-day
						tasks as a planning failure, not a code failure. If a task can't
						be split, it doesn't get scheduled.
					</Typography>
				</Box>

				<Box component="section">
					<Typography component="h2" id="async-by-default" sx={BLOG_H2_SX}>
						Async by default
					</Typography>
					<Typography sx={BLOG_P_SX}>
						No standups. No daily syncs. The team writes a 3-line update each
						morning in a shared channel — yesterday, today, blockers. If
						something needs a meeting, it gets one — but it has to earn the
						meeting. The default is async.
					</Typography>
				</Box>

				<Box component="section">
					<Typography component="h2" id="the-deploy-is-not-the-event" sx={BLOG_H2_SX}>
						The deploy is not the event
					</Typography>
					<Typography sx={BLOG_P_SX}>
						We feature-flag everything. The deploy is a non-event because the
						code is dark when it lands. The flag flip is the event, and that's
						a separate decision with separate stakeholders. This decoupling
						removed all the deploy anxiety from the team.
					</Typography>
				</Box>

				<Box component="section">
					<Typography component="h2" id="rest-is-a-deliverable" sx={BLOG_H2_SX}>
						Rest is a deliverable
					</Typography>
					<Typography sx={BLOG_P_SX}>
						Friday afternoons are for closing tabs. Vacation is mandatory and
						recovery time after big launches is scheduled, not requested. The
						daily rhythm only works because we treat the rest cadence with the
						same seriousness as the work cadence.
					</Typography>
				</Box>
			</Stack>
		</BlogArticlePage>
	);
};

export default ShippingDailyWithoutBurningOutArticle;
```

- [ ] **Step 3: Write the scheduler-rewrite article**

Create `apps/front/src/routes/marketing/blog/_articles/why-we-rewrote-our-scheduler-article.tsx`:

```tsx
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import {
	BLOG_H2_SX,
	BLOG_P_SX,
	BlogArticlePage,
} from '#app/routes/marketing/_components/blog-article-page.tsx';
import { BLOG_POSTS } from '#app/routes/marketing/_data/blog.ts';

// ----------------------------------------------------------------------

const POST = BLOG_POSTS.find((p) => {
	return p.slug === 'why-we-rewrote-our-scheduler';
});

if (!POST) {
	throw new Error(
		'BlogPost "why-we-rewrote-our-scheduler" not found in BLOG_POSTS — slug mismatch with _data/blog.ts',
	);
}

// ----------------------------------------------------------------------

const WhyWeRewroteOurSchedulerArticle = () => {
	return (
		<BlogArticlePage post={POST}>
			<Stack spacing={4}>
				<Typography sx={BLOG_P_SX}>
					In Q4 we threw away 14 months of code and rewrote our scheduler from
					scratch. The rewrite worked. Most of what we learned was about the
					original code we abandoned.
				</Typography>

				<Box component="section">
					<Typography component="h2" id="the-original-was-fine" sx={BLOG_H2_SX}>
						The original was fine
					</Typography>
					<Typography sx={BLOG_P_SX}>
						This is the awkward part of every rewrite story: the code we
						threw away worked. It scheduled posts, handled retries, dealt with
						platform API quirks. It was messy in ways that made every change
						scary, but it shipped.
					</Typography>
				</Box>

				<Box component="section">
					<Typography component="h2" id="the-real-problem-was-our-mental-model" sx={BLOG_H2_SX}>
						The real problem was our mental model
					</Typography>
					<Typography sx={BLOG_P_SX}>
						The scheduler started as a cron-driven loop with a job queue. By
						month 14 it had become an event-sourced state machine — but the
						code still looked like a cron loop. The mental model and the
						actual behavior had drifted apart. Every bug took twice as long
						to find because the code didn't match what was happening.
					</Typography>
				</Box>

				<Box component="section">
					<Typography component="h2" id="rewriting-was-the-cheap-fix" sx={BLOG_H2_SX}>
						Rewriting was the cheap fix
					</Typography>
					<Typography sx={BLOG_P_SX}>
						We considered the standard alternatives: incremental refactor,
						strangler fig, parallel implementations. They all required
						maintaining two mental models simultaneously, which was the
						problem we were trying to solve. The rewrite let us collapse to
						one mental model in a quarter.
					</Typography>
				</Box>

				<Box component="section">
					<Typography component="h2" id="when-we-tell-people-not-to-rewrite" sx={BLOG_H2_SX}>
						When we tell people not to rewrite
					</Typography>
					<Typography sx={BLOG_P_SX}>
						If your code is messy but matches your mental model — refactor.
						If your code is clean but doesn't match your mental model anymore
						— that's the rewrite tell. Most "we should rewrite" conversations
						are actually the first kind in disguise.
					</Typography>
				</Box>
			</Stack>
		</BlogArticlePage>
	);
};

export default WhyWeRewroteOurSchedulerArticle;
```

- [ ] **Step 4: Write the trial-conversion article**

Create `apps/front/src/routes/marketing/blog/_articles/turning-trial-users-into-paying-customers-article.tsx`:

```tsx
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import {
	BLOG_H2_SX,
	BLOG_P_SX,
	BlogArticlePage,
} from '#app/routes/marketing/_components/blog-article-page.tsx';
import { BLOG_POSTS } from '#app/routes/marketing/_data/blog.ts';

// ----------------------------------------------------------------------

const POST = BLOG_POSTS.find((p) => {
	return p.slug === 'turning-trial-users-into-paying-customers';
});

if (!POST) {
	throw new Error(
		'BlogPost "turning-trial-users-into-paying-customers" not found in BLOG_POSTS — slug mismatch with _data/blog.ts',
	);
}

// ----------------------------------------------------------------------

const TurningTrialUsersIntoPayingCustomersArticle = () => {
	return (
		<BlogArticlePage post={POST}>
			<Stack spacing={4}>
				<Typography sx={BLOG_P_SX}>
					Trial-to-paid conversion isn't a sales problem. It's a design
					problem dressed up as a sales problem. Six interventions over four
					months moved our rate by 18 points without adding a single sales
					email.
				</Typography>

				<Box component="section">
					<Typography component="h2" id="the-onboarding-was-the-pricing-page" sx={BLOG_H2_SX}>
						The onboarding was the pricing page
					</Typography>
					<Typography sx={BLOG_P_SX}>
						Most users decided whether to pay during onboarding, not on the
						pricing page. We were optimizing the wrong surface. Once we
						treated the first 60 seconds as the pricing pitch, everything
						downstream got easier.
					</Typography>
				</Box>

				<Box component="section">
					<Typography component="h2" id="surface-the-shape-of-paid" sx={BLOG_H2_SX}>
						Surface the shape of paid
					</Typography>
					<Typography sx={BLOG_P_SX}>
						Trial users didn't know what they'd lose at the end of the trial
						because the product didn't show them. We added gentle "this is a
						paid feature" indicators (no upsells, no popups — just labels)
						and conversion went up. People want to know what they're paying
						for.
					</Typography>
				</Box>

				<Box component="section">
					<Typography component="h2" id="end-the-trial-with-care" sx={BLOG_H2_SX}>
						End the trial with care
					</Typography>
					<Typography sx={BLOG_P_SX}>
						The biggest single lift came from the trial-end email. The
						version that worked wasn't aggressive. It said "your trial ended
						— here's what you built, here's what changes if you don't
						upgrade, here's the link." Calm and specific beat urgent and
						vague.
					</Typography>
				</Box>

				<Box component="section">
					<Typography component="h2" id="dark-patterns-still-dont-work" sx={BLOG_H2_SX}>
						Dark patterns still don't work
					</Typography>
					<Typography sx={BLOG_P_SX}>
						We tested countdown timers, fake scarcity, hidden cancel flows.
						All three temporarily lifted conversion and permanently tanked
						retention. Trial-to-paid is meaningless if "paid" cancels in 60
						days. Optimize for the cohort that stays.
					</Typography>
				</Box>
			</Stack>
		</BlogArticlePage>
	);
};

export default TurningTrialUsersIntoPayingCustomersArticle;
```

- [ ] **Step 5: Verify type-check**

Run: `just tsc-front`
Expected: clean exit.

- [ ] **Step 6: Commit**

```bash
git add apps/front/src/routes/marketing/blog/_articles/
git commit -m "feat(front): add 4 placeholder blog article body files"
```

---

## Task 8: Build the article route shim

**Files:**
- Create: `apps/front/src/routes/marketing/blog/blog-article-route.tsx`

Slug-driven router shim. Looks up the post in `BLOG_POSTS`, lazy-imports the matching article body component, throws a `404 Response` if either step fails.

- [ ] **Step 1: Write the file**

Create `apps/front/src/routes/marketing/blog/blog-article-route.tsx`:

```tsx
import { type LazyExoticComponent, lazy, Suspense } from 'react';
import { useParams } from 'react-router';

import { APP_NAME } from '@org/shared-ts/lib/constants';

import {
	BLOG_POSTS,
	unsplashCover,
} from '#app/routes/marketing/_data/blog.ts';

// ----------------------------------------------------------------------

// Static slug → lazy article-component map. Lazy keeps each article's body
// bundle out of the index page payload AND each other's payload — only the
// requested slug's body downloads on navigation.
const ARTICLE_COMPONENTS: Record<string, LazyExoticComponent<() => JSX.Element>> = {
	'multi-tenant-architecture-lessons': lazy(() => {
		return import('./_articles/multi-tenant-architecture-lessons-article.tsx');
	}),
	'shipping-daily-without-burning-out': lazy(() => {
		return import('./_articles/shipping-daily-without-burning-out-article.tsx');
	}),
	'why-we-rewrote-our-scheduler': lazy(() => {
		return import('./_articles/why-we-rewrote-our-scheduler-article.tsx');
	}),
	'turning-trial-users-into-paying-customers': lazy(() => {
		return import('./_articles/turning-trial-users-into-paying-customers-article.tsx');
	}),
};

// ----------------------------------------------------------------------

const BlogArticleRoute = () => {
	const { slug } = useParams<{ slug: string }>();

	if (!slug) {
		throw new Response('Not Found', { status: 404 });
	}

	const post = BLOG_POSTS.find((p) => {
		return p.slug === slug;
	});

	if (!post) {
		throw new Response('Not Found', { status: 404 });
	}

	const ArticleComponent = ARTICLE_COMPONENTS[slug];

	if (!ArticleComponent) {
		// Slug exists in BLOG_POSTS but no matching component — defensive,
		// shouldn't happen in healthy code. The error message tells you which
		// slug is missing a body file.
		throw new Response(
			`Blog article component for slug "${slug}" not found in ARTICLE_COMPONENTS map`,
			{ status: 404 },
		);
	}

	return (
		<Suspense fallback={null}>
			<ArticleComponent />
		</Suspense>
	);
};

export default BlogArticleRoute;

// ----------------------------------------------------------------------

// Per-article SEO meta, derived from BLOG_POSTS. React Router calls this
// with the same params as the route, so we look up the post by slug here too.
type MetaArgs = { params: { slug?: string } };

export const meta = ({ params }: MetaArgs) => {
	const post = BLOG_POSTS.find((p) => {
		return p.slug === params.slug;
	});

	if (!post) {
		return [{ title: `Not Found | ${APP_NAME}` }];
	}

	const ogImage = unsplashCover(post.coverSlug, { w: 1200, h: 630 });

	return [
		{ title: `${post.title} | ${APP_NAME}` },
		{ name: 'description', content: post.excerpt },
		{ property: 'og:title', content: post.title },
		{ property: 'og:description', content: post.excerpt },
		{ property: 'og:image', content: ogImage },
		{ property: 'og:type', content: 'article' },
	];
};
```

Notes:
- `MetaArgs` is hand-typed because React Router's `Route.MetaArgs` for this route file isn't generated until the route is wired (Task 9). The shape matches React Router's actual call signature.
- `Suspense fallback={null}` keeps the article hero from flashing a loading state — for a single dynamic import on a fast network, the article appears in <50ms; a fallback creates more flicker than it prevents. If lazy-load latency becomes user-visible, add a skeleton.

- [ ] **Step 2: Verify type-check**

Run: `just tsc-front`
Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/routes/marketing/blog/blog-article-route.tsx
git commit -m "feat(front): add /blog/:slug article route shim with lazy imports + per-post meta"
```

---

## Task 9: Wire routes in `marketing.routes.ts`

**Files:**
- Modify: `apps/front/src/routes/_tree/marketing.routes.ts`

Add the two blog routes, both flag-guarded by `FEATURES.marketing.blog` (already in the `FEATURES` registry from Phase 3). Disabled routes fall through to the marketing 404 catch-all.

- [ ] **Step 1: Read current state**

Run: `cat apps/front/src/routes/_tree/marketing.routes.ts`

Confirm the current shape — should be 5 named routes (pricing, terms, privacy, cookies, conditional about/contact/security) + the catch-all `route('*', ...)` last, all wrapped in the `MarketingLayout` `layout(...)`.

- [ ] **Step 2: Add the blog routes**

Edit `apps/front/src/routes/_tree/marketing.routes.ts`. Add the blog routes spread BEFORE the catch-all (catch-all must remain last):

```ts
import { index, layout, route } from '@react-router/dev/routes';

import { FEATURES } from '../../lib/features/flags.ts';

// Marketing routes — supporting pages (about/contact/security/blog) are
// flag-guarded. Disabled routes fall through to the catch-all 404 naturally.
export const marketingRoutes = [
	layout('routes/marketing/_layout/marketing-layout.tsx', [
		index('routes/marketing/home/home-page.tsx'),
		route('pricing', 'routes/marketing/pricing/pricing-page.tsx'),
		route('terms', 'routes/marketing/terms/terms-page.tsx'),
		route('privacy', 'routes/marketing/privacy/privacy-page.tsx'),
		route('cookies', 'routes/marketing/cookies/cookies-page.tsx'),
		...(FEATURES.marketing.about
			? [route('about', 'routes/marketing/about/about-page.tsx')]
			: []),
		...(FEATURES.marketing.contact
			? [route('contact', 'routes/marketing/contact/contact-page.tsx')]
			: []),
		...(FEATURES.marketing.security
			? [route('security', 'routes/marketing/security/security-page.tsx')]
			: []),
		...(FEATURES.marketing.blog
			? [
					route('blog', 'routes/marketing/blog/blog-index-page.tsx'),
					route('blog/:slug', 'routes/marketing/blog/blog-article-route.tsx'),
				]
			: []),
		route('*', 'routes/marketing/_errors/marketing-not-found-page.tsx'),
	]),
];
```

- [ ] **Step 3: Verify type-check**

Run: `just tsc-front`
Expected: clean exit. (React Router's typegen will regenerate `+types/blog-article-route.ts` etc.)

- [ ] **Step 4: Commit**

```bash
git add apps/front/src/routes/_tree/marketing.routes.ts
git commit -m "feat(front): wire /blog and /blog/:slug routes (flag-guarded by FEATURES.marketing.blog)"
```

---

## Task 10: Final verification + browser walkthrough

**Files:** none (verification only)

This task is purely verification. No commits unless a fix is needed.

- [ ] **Step 1: Type-check, lint/format, knip**

```bash
just tsc-front
just check-write
just knip
```

Expected:
- `tsc-front` exits clean.
- `check-write` exits clean.
- `knip` may report pre-existing issues unrelated to Phase 4. Acceptable as long as no NEW Phase 4 file appears in its report. The new `_data/blog.ts` types (`BlogTag`, `BlogAuthor`, `BlogPost`) may be flagged as unused-export — same pattern as Phase 3's `_data/*.ts` types; this is the established repo idiom (export types from data modules even when only used internally, so future external consumers can import them without touching the data file). Not a regression.

- [ ] **Step 2: Confirm `FEATURES.marketing.blog` is `true` in the local checkout**

Read `apps/front/src/lib/features/flags.ts` and confirm:

```ts
blog: readFlag('VITE_FEATURE_MARKETING_BLOG', true),
```

The default is currently `true` (the user flipped Phase 3 marketing flags to `true` for local dev). If the default is `false` (changed since), set the env var or temporarily flip the constant for the duration of the smoke walkthrough.

- [ ] **Step 3: Start the dev server**

```bash
just dev-front
```

Wait for `apps/front` to print its `localhost:5050` ready line.

- [ ] **Step 4: Smoke-test `/blog`**

Open `http://localhost:5050/blog` and verify:

1. **Hero**: eyebrow chip "Blog" + h1 "Stories from the team" + subhead, all centered.
2. **Featured card**: 2-col layout on md+ (cover left, text right with chip eyebrow + h3 title + excerpt + 40px-avatar byline + date · reading time). Hover: lifts + shadow grows. Click: navigates to `/blog/multi-tenant-architecture-lessons`.
3. **Filter pills**: row of 5 pills ("All" + Product / Engineering / Growth / Ops). "All" is active by default. Click "Engineering": URL becomes `?tag=engineering`, featured card disappears, grid shows 2 posts (multi-tenant + scheduler-rewrite). Click "All": URL clears `?tag=`, featured card returns, grid shows 3 posts (excluding featured).
4. **Standard grid cards**: 3-col on md+. Each card has cover (16/9), tag chip eyebrow, title, excerpt (clamped to 3 lines), 32px-avatar byline, date · reading time. Bylines align across the row (`flex justify-content space-between` on the card body keeps bylines bottom-aligned).
5. **Empty state**: click "Product" tag (no posts in this tag). Empty state renders: "No posts in this category yet — check back soon" + "Show all" button. Click "Show all": clears `?tag=` and returns to default index view.
6. **Dark mode**: toggle. Cover images stay readable, tag chips have correct contrast, filter pill active state is primary green on common.white text.
7. **Console**: no errors, no `iconify-icon` 404 fetches.
8. **View page source**: `<title>Blog | PublyApp</title>` and `<meta name="description">` present.

- [ ] **Step 5: Smoke-test `/blog/:slug` (each article)**

For each of `/blog/multi-tenant-architecture-lessons`, `/blog/shipping-daily-without-burning-out`, `/blog/why-we-rewrote-our-scheduler`, `/blog/turning-trial-users-into-paying-customers`:

1. **Hero**: breadcrumb "Blog → <Tag>" + tag chip eyebrow + h1 + byline row (avatar + author + role + " · " + date + " · " + clock icon + reading time) + cover image (2/1 ratio, max 1024px).
2. **Body**: 4 sections (h2 + p), prose readable, h2s stand out from body via `BLOG_H2_SX`. Body column max ~720px on lg+ for reading comfort.
3. **Share rail (lg+ desktop)**: vertical sticky pill in col 11 of the body grid. Sticks below the topbar. 3 buttons (Twitter logo, LinkedIn logo, link icon). Hover: lifts + color shifts to primary. Click Twitter: opens `https://twitter.com/intent/tweet?text=<title>&url=<page>` in new tab. Click LinkedIn: opens `https://www.linkedin.com/sharing/share-offsite/?url=<page>` in new tab. Click link icon: copies the page URL to clipboard, button briefly tints primary with a check icon for 2 seconds, hover shows "Copied!" tooltip.
4. **Share rail (<lg)**: shrinks the desktop sticky rail to `display: none`; an inline horizontal row appears above the related-posts footer with the same 3 buttons + a "SHARE" label.
5. **Related posts footer**: section with chip eyebrow "More to read" + h2 "Related posts" + N standard cards (where N = up to 3 posts sharing this tag, excluding self). For tag with only 1 post (e.g. `growth` has only the trial-conversion article — no related), the section doesn't render at all.
6. **View page source**: `<title>` is `<post.title> | PublyApp`, description matches `post.excerpt`, og:image is `https://images.unsplash.com/photo-<slug>?w=1200&h=630&...`.

- [ ] **Step 6: Smoke-test `/blog/non-existent` and unwired slugs**

1. Navigate to `http://localhost:5050/blog/this-slug-does-not-exist`. Verify the marketing 404 view renders ("404" gradient numerals + "This post got deleted by the algorithm" h1 + popular destinations grid). The 404 fires because the route shim throws `404 Response` → `MarketingLayout`'s `ErrorBoundary` catches it and renders `MarketingErrorView` (Phase 3 wiring).
2. Navigate to `http://localhost:5050/blog/`. Trailing slash should resolve to `/blog` index.

- [ ] **Step 7: Verify flag toggling**

Edit `apps/front/src/lib/features/flags.ts` and set `marketing.blog` to `false` (temporarily). Refresh `localhost:5050`:

1. `/blog` and `/blog/multi-tenant-architecture-lessons` both render the marketing 404 (the catch-all `route('*', ...)` since named routes were skipped).
2. Footer "Blog" link is hidden under Resources column. If Resources column had only "Blog" + "Contact Support" entries and Contact Support is also off (e.g. if `FEATURES.marketing.contact` is `false`), the column hides entirely.
3. `DEFAULT_POPULAR_DESTINATIONS` in `marketing-error-view.tsx` does NOT currently include a Blog entry (out of scope per spec) — so the 404 popular destinations are unchanged.

Restore `marketing.blog` to `true` (or whatever default the file had) when done verifying.

- [ ] **Step 8: Verify no regressions on Phase 1–3 routes**

Quick smoke on:
- `/` — home page, particularly the bottom CtaBand + footer.
- `/pricing` — hero, billing toggle, tier cards.
- `/terms`, `/privacy`, `/cookies` — sticky TOC + body.
- `/about` — Our Story 2-col, team grid with Unsplash photos, CtaBand.
- `/contact` — form + info panel + Quick answers FAQ + bottom CtaBand.
- `/security` — trust badges + pillars + sub-processors table + vulnerability ContentBand + CtaBand.
- Marketing 404 for any nonsense URL.

If any regress, identify which Phase 4 task introduced the regression and ship a focused fix commit.

- [ ] **Step 9: Final state check**

Run: `git status`
Expected: clean (no uncommitted changes from the verification step). `git log` should show 8 task commits (Tasks 1–9, with Tasks 4+5 sharing one commit) on top of the latest pushed commit.

If any browser smoke surfaced a fix, commit it with a descriptive `fix(front): ...` message and re-run Steps 4–8 for the affected page.

---

## What's NOT in this plan (per spec out-of-scope)

- **Real backend / CMS** — static `_data/blog.ts` only.
- **MDX bodies** — inline JSX per article file (legal-page idiom).
- **Search** — tag filter is the only navigation aid.
- **Pagination / load-more** — render all 4 posts.
- **Comments / claps / reactions** — no engagement features.
- **Author profile pages** — bylines link nowhere.
- **RSS feed** — out for v1.
- **Reading-time auto-calculation** — hardcoded per post.
- **Analytics events** — out for v1.
- **404 destinations include Blog** — the 404 popular-destinations grid intentionally promotes shipped evergreen pages; revisit when blog has real content.
- **Topbar Blog link** — separate design decision; topbar is currently homepage-anchor-driven.

## Follow-ups (out of phase, but worth noting)

- **Retroactively migrate `/about` `TEAM_MEMBERS` `<Box component="img">` → `<Image ratio="1/1">`** — Phase 3 used the raw img element before the spec's `<Image>` reuse policy was set. Low-priority Phase 3 cleanup, can fold into the same commit when the team grid is touched next.
