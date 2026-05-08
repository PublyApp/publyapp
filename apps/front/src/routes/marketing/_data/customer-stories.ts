import type { IconifyName } from '#app/components/iconify/register-icons.ts';

// ----------------------------------------------------------------------

// Customer-story data layer. The template at /customer-stories/:slug is
// data-driven: adding a new story = adding an entry to CUSTOMER_STORIES.
//
// Lumen Studio is a deliberately fictional placeholder so the page shape
// can ship before any real customer participation. Replace the entry once
// a real customer signs off; do not delete the type definitions.

// ----------------------------------------------------------------------

export type CustomerStoryMetric = {
	id: string;
	iconName: IconifyName;
	value: string;
	label: string;
};

export type CustomerStoryQuote = {
	body: string;
	authorName: string;
	authorRole: string;
	authorPhotoSlug: string;
};

export type CustomerStoryNarrativeBlock = {
	heading: string;
	paragraphs: string[];
};

export type CustomerStoryAboutFact = {
	iconName: IconifyName;
	label: string;
	value: string;
};

export type CustomerStoryTagPill = {
	id: string;
	iconName: IconifyName;
	label: string;
};

export type CustomerStory = {
	slug: string;
	customerName: string;
	customerWordmark: string;
	headline: string;
	subhead: string;
	tagPills: CustomerStoryTagPill[];
	heroImageSlug: string;
	heroImageAlt: string;
	metrics: CustomerStoryMetric[];
	narrative: CustomerStoryNarrativeBlock[];
	pullQuote: CustomerStoryQuote;
	about: {
		summary: string;
		facts: CustomerStoryAboutFact[];
		integratedTools: string[];
	};
	seoTitle: string;
	seoDescription: string;
	// Treat undefined as published. Set false to hide a slug without
	// removing the entry (useful for staging real customer copy that
	// hasn't been approved yet).
	published?: boolean;
};

// ----------------------------------------------------------------------

// Local Unsplash URL builder. Mirrors `unsplashCover` in `_data/blog.ts`
// but kept self-contained so this file has no cross-data-file imports.
const unsplashPhoto = (
	slug: string,
	opts: { w: number; h: number },
): string => {
	return `https://images.unsplash.com/photo-${slug}?w=${opts.w}&h=${opts.h}&fit=crop&auto=format&q=80`;
};

export const customerStoryHeroImage = (slug: string): string => {
	return unsplashPhoto(slug, { w: 1200, h: 1600 });
};

export const customerStoryQuoteAvatar = (slug: string): string => {
	return unsplashPhoto(slug, { w: 160, h: 160 });
};

export const customerStoryOgImage = (slug: string): string => {
	return unsplashPhoto(slug, { w: 1200, h: 630 });
};

// ----------------------------------------------------------------------

export const CUSTOMER_STORIES: Record<string, CustomerStory> = {
	'lumen-studio': {
		slug: 'lumen-studio',
		customerName: 'Lumen Studio',
		customerWordmark: 'lumen.',
		headline: 'How Lumen Studio grew engagement 3x with PublyApp',
		subhead:
			'Scaling a creative agency requires precision. Discover how Lumen Studio automated their social execution, freeing their team up to focus entirely on creative strategy instead of manual publishing.',
		tagPills: [
			{
				id: 'industry',
				iconName: 'solar:buildings-bold-duotone',
				label: 'Creative Agency',
			},
			{ id: 'region', iconName: 'ph:globe-bold', label: 'EU' },
			{ id: 'plan', iconName: 'ph:sparkle-duotone', label: 'Agency Plan' },
		],
		heroImageSlug: '1600880292203-757bb62b4baf',
		heroImageAlt: 'Lumen Studio team collaborating in a bright, modern office',
		metrics: [
			{
				id: 'engagement',
				iconName: 'ph:trend-up-fill',
				value: '+3x',
				label: 'Engagement Growth',
			},
			{
				id: 'time-saved',
				iconName: 'ph:clock-bold',
				value: '-40%',
				label: 'Time on Scheduling',
			},
			{
				id: 'markets',
				iconName: 'ph:globe-bold',
				value: '12',
				label: 'Markets Reached',
			},
		],
		narrative: [
			{
				heading: 'The challenge: navigating creative chaos',
				paragraphs: [
					'For Lumen Studio, growth was accelerating faster than their internal processes could handle. Managing social profiles for over twenty enterprise clients manually meant that account managers were spending an average of fifteen hours a week just drafting, approving, and scheduling content.',
					'"We were using spreadsheets and disparate calendar tools. Approvals were lost in Slack threads, and executing a cohesive campaign across timezones was becoming a logistical nightmare," says Elena Rostova, Head of Strategy at Lumen. The team needed a centralized platform that could act as the backbone of their execution strategy without compromising their creative standards.',
				],
			},
			{
				heading: 'The solution: an autopilot for execution',
				paragraphs: [
					"Lumen Studio deployed PublyApp's Agency tier to unify their workflow. They established a single source of truth for their content pipeline. The ability to use visual workspaces allowed the creative team to mock up posts exactly as they would appear, providing instant clarity to clients during the approval phase.",
				],
			},
			{
				heading: 'The results: scalable advocacy',
				paragraphs: [
					'Within three months of integration, the metrics spoke for themselves. The automated scheduling and queue optimization features of PublyApp reduced the time spent on manual posting by a staggering forty percent. This reclaimed time was immediately reallocated to deep-work sessions and creative brainstorming.',
					'Because content was being published at optimized times using data-driven insights — rather than manual guesses — engagement metrics soared. Client accounts saw an average 3x growth in sustained engagement, effectively transforming casual followers into vocal brand advocates.',
				],
			},
			{
				heading: "What's next?",
				paragraphs: [
					"Lumen Studio is currently beta testing PublyApp's new advanced AI analytics module. They plan to use sentiment analysis to further tailor micro-campaigns in real-time, pushing the boundaries of what automated social execution can achieve for global brands.",
				],
			},
		],
		pullQuote: {
			body: "Switching to PublyApp wasn't just a software upgrade; it was a fundamental shift in how we operate. We moved from reactive scrambling to proactive, strategic execution overnight. The ROI was immediate.",
			authorName: 'Elena Rostova',
			authorRole: 'Head of Strategy, Lumen Studio',
			authorPhotoSlug: '1573496359142-b8d87734a5a2',
		},
		about: {
			summary:
				'A multi-disciplinary creative agency blending digital innovation with timeless aesthetics to build global brands.',
			facts: [
				{
					iconName: 'solar:buildings-bold-duotone',
					label: 'Founded',
					value: '2018',
				},
				{
					iconName: 'ph:users-three-bold',
					label: 'Team size',
					value: '45 employees',
				},
				{
					iconName: 'ph:globe-bold',
					label: 'HQ',
					value: 'Berlin, Germany',
				},
			],
			integratedTools: ['PublyApp Agency', 'Slack', 'Figma'],
		},
		seoTitle: 'Lumen Studio · Customer Story',
		seoDescription:
			'How Lumen Studio scaled their creative agency by automating social execution with PublyApp — 3x engagement growth and 40% less time on scheduling.',
	},
};

// ----------------------------------------------------------------------

// Returns the story IFF it exists AND `published !== false`. Use at every
// consumer site so flipping the flag in this file has a global effect.
export const getPublishedCustomerStory = (
	slug: string,
): CustomerStory | undefined => {
	const story = CUSTOMER_STORIES[slug];
	if (!story) {
		return undefined;
	}
	if (story.published === false) {
		return undefined;
	}
	return story;
};
