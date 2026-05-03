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
