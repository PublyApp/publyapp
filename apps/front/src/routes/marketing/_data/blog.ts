import type { IconifyName } from '#app/components/iconify/register-icons.ts';

// ----------------------------------------------------------------------

export type BlogTag = 'product' | 'engineering' | 'growth' | 'ops';

export const BLOG_TAGS: {
	value: BlogTag;
	label: string;
	icon?: IconifyName;
}[] = [
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

// 3 reused authors so the byline rotation feels real on a small catalogue.
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

// Article-page cover treatments — defined in the "Blog Cover Types" canvas.
// Each post picks the treatment that fits its content shape best:
// - 'above-title' → standard articles, deep-dives. Image as supporting visual.
// - 'split'       → customer stories, partner announcements. Visual + content side-by-side.
// - 'editorial'   → essays, opinion, reflective posts. Zero image, kicker quote, max LCP.
// - 'cinematic'   → major launches, big announcements. Full-bleed background, white overlay.
export type BlogCoverType = 'above-title' | 'split' | 'editorial' | 'cinematic';

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
	// Set false to hide the post from index + article routes without deleting it.
	// Treat undefined as published. Use this flag to test empty-state behavior
	// (set false on every post → index renders the "nothing published" empty
	// state; set false on a tag's only post → that tag's pill yields empty state).
	published?: boolean;
	// Defaults to 'above-title' if undefined.
	coverType?: BlogCoverType;
};

// Placeholder posts. Replace pre-launch with real content. Keep ONE entry
// flagged `featured: true` (the index page renders it in the featured slot).
// Mix of `published: false` entries included so toggling them reveals empty
// states and tag-grid sparseness without code changes.
export const BLOG_POSTS: BlogPost[] = [
	{
		slug: 'blog-elements-reference',
		title: 'Blog content elements — a labeled reference',
		excerpt:
			"Every primitive available inside a blog article body, with the component name, when to reach for it, and a live render. The page you bookmark when you're writing the next post.",
		coverSlug: '1456513080510-7bf3a84b82f8',
		tag: 'product',
		publishedAt: '2026-04-30',
		readingMinutes: 12,
		authorId: 'elena-rodriguez',
		coverType: 'editorial',
	},
	{
		slug: 'multi-tenant-architecture-lessons',
		title:
			'Multi-tenant architecture: the three lessons we learned the hard way',
		excerpt:
			"Building for thousands of brands without leaking data between them sounds simple until you ship it. Here's what we wish we knew sooner.",
		coverSlug: '1551434678-e076c223a692',
		tag: 'engineering',
		publishedAt: '2026-04-12',
		readingMinutes: 8,
		authorId: 'sarah-jenkins',
		featured: true,
		coverType: 'cinematic',
	},
	{
		slug: 'shipping-daily-without-burning-out',
		title: 'Shipping daily without burning out',
		excerpt:
			"Continuous deployment isn't a tooling problem — it's a discipline problem. Here's the rhythm that's worked for us across 18 months.",
		coverSlug: '1499750310107-5fef28a66643',
		tag: 'ops',
		publishedAt: '2026-03-28',
		readingMinutes: 6,
		authorId: 'marcus-reynolds',
		coverType: 'editorial',
	},
	{
		slug: 'why-we-rewrote-our-scheduler',
		title: "Why we rewrote our scheduler (and you probably shouldn't)",
		excerpt:
			'A rewrite story with a twist: the rewrite worked, but the lessons were almost entirely about the original code we abandoned.',
		coverSlug: '1517694712202-14dd9538aa97',
		tag: 'engineering',
		publishedAt: '2026-03-15',
		readingMinutes: 10,
		authorId: 'sarah-jenkins',
		coverType: 'split',
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
		coverType: 'above-title',
	},
	{
		slug: 'designing-for-multi-brand-workspaces',
		title: 'Designing for multi-brand workspaces — a UX retrospective',
		excerpt:
			'Switching between five brands in a day used to take twelve clicks. Here is the design exercise that brought it down to one.',
		coverSlug: '1559028012-481c04fa702d',
		tag: 'product',
		publishedAt: '2026-02-08',
		readingMinutes: 9,
		authorId: 'elena-rodriguez',
	},
	{
		slug: 'incident-postmortem-the-quiet-outage',
		title: 'Incident postmortem: the quiet outage nobody noticed',
		excerpt:
			'Our scheduler ran for six hours producing no output and zero alerts. The fix was easy. The detection problem was not.',
		coverSlug: '1518770660439-4636190af475',
		tag: 'ops',
		publishedAt: '2026-01-30',
		readingMinutes: 11,
		authorId: 'sarah-jenkins',
	},
	{
		slug: 'pricing-experiments-that-didnt-work',
		title: "Five pricing experiments that didn't work (and one that did)",
		excerpt:
			'Stripe makes it cheap to test pricing. The mistake we kept making was treating it like a single experiment instead of six.',
		coverSlug: '1554224155-6726b3ff858f',
		tag: 'growth',
		publishedAt: '2026-01-14',
		readingMinutes: 8,
		authorId: 'marcus-reynolds',
	},
	{
		slug: 'permissions-rbac-versus-relationship-based',
		title: 'RBAC vs relationship-based permissions: why we chose neither',
		excerpt:
			"Both models broke down once we hit agencies with sub-clients and approval chains. We ended up with a third pattern that's worth a name.",
		coverSlug: '1496181133206-80ce9b88a853',
		tag: 'engineering',
		publishedAt: '2025-12-19',
		readingMinutes: 13,
		authorId: 'sarah-jenkins',
	},
	{
		slug: 'product-feedback-channels-that-actually-help',
		title:
			'Three product-feedback channels that actually help — and three that lie to you',
		excerpt:
			"Feature requests are a lagging signal. Here's how we weight Intercom messages, NPS verbatims, and churn calls — and which ones we ignore.",
		coverSlug: '1573164713988-8665fc963095',
		tag: 'product',
		publishedAt: '2025-12-02',
		readingMinutes: 7,
		authorId: 'elena-rodriguez',
	},
	{
		slug: 'oncall-rotation-redesign',
		title: 'Redesigning the oncall rotation when the team is too small for one',
		excerpt:
			"With six engineers, a real oncall rotation gets brutal fast. Here's the hybrid setup that kept response times sane without burning anyone out.",
		coverSlug: '1531746790731-6c087fecd65a',
		tag: 'ops',
		publishedAt: '2025-11-15',
		readingMinutes: 9,
		authorId: 'marcus-reynolds',
		// Hidden — flip to true to surface, or leave false to keep "Ops" tag sparser.
		published: false,
	},
	{
		slug: 'attribution-when-everything-is-organic',
		title: 'Attribution when everything is organic',
		excerpt:
			"We don't run paid ads. That makes attribution harder, not easier — here's the model we ended up with after three rebuilds.",
		coverSlug: '1551288049-bebda4e38f71',
		tag: 'growth',
		publishedAt: '2025-10-28',
		readingMinutes: 10,
		authorId: 'elena-rodriguez',
		published: false,
	},
	{
		slug: 'api-versioning-without-the-pain',
		title: 'API versioning without the pain (mostly)',
		excerpt:
			"v1 lasted 18 months. v2 lasted three. Here's why, and the versioning rules we wrote down so v3 doesn't repeat it.",
		coverSlug: '1607799279861-4dd421887fb3',
		tag: 'engineering',
		publishedAt: '2025-10-10',
		readingMinutes: 12,
		authorId: 'sarah-jenkins',
		published: false,
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

// ----------------------------------------------------------------------

// Returns posts where `published !== false`. Treats `undefined` as published
// so existing entries keep working without explicit annotations. Use this
// helper at every consumer site (index list, related-posts, article route)
// so flipping the flag in this file has a global effect.
export const getPublishedPosts = (): BlogPost[] => {
	return BLOG_POSTS.filter((p) => p.published !== false);
};
