// Marketing comparison-page data — single source of truth for the
// /compare/:competitor surface. Each Competitor record drives the entire
// page; adding a new competitor (Hootsuite, Sprout, Later) is a data-only
// change.

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import type { MarketingFaqItem } from '#app/routes/marketing/_components/marketing-faq-accordion.tsx';

// ----------------------------------------------------------------------

/**
 * How a single feature-comparison cell renders.
 *  - `yes`   → bright primary check (we / them genuinely have the feature)
 *  - `weak`  → muted check (technically present, but limited / lower quality)
 *  - `no`    → muted minus (genuinely missing)
 *  - `tag`   → small pill with a custom label (e.g. "Limited", "$ Extra")
 */
export type ComparisonCellKind =
	| { kind: 'yes' }
	| { kind: 'weak' }
	| { kind: 'no' }
	| { kind: 'tag'; label: string };

export type ComparisonRow = {
	id: string;
	feature: string;
	us: ComparisonCellKind;
	them: ComparisonCellKind;
	notes: string;
	/** When true, the notes cell is rendered with stronger emphasis (e.g. exclusive). */
	notesEmphasis?: boolean;
};

export type ComparisonFeatureGroup = {
	id: string;
	label: string;
	rows: ComparisonRow[];
};

export type ComparisonQuickVerdict = {
	id: string;
	heading: string;
	us: { title: string; body: string };
	them: { title: string; body: string };
};

export type ComparisonPricingFeature = {
	label: string;
	included: boolean;
	/** When true, this feature renders with a brand-tinted highlight (e.g. flagship). */
	emphasis?: boolean;
};

export type ComparisonPricingTier = {
	productName: string;
	price: string;
	period: string;
	highlight: string;
	features: ComparisonPricingFeature[];
	ctaLabel?: string;
	ctaHref?: string;
};

export type ComparisonMigrationStep = {
	index: number;
	title: string;
	body: string;
	/** Highlights the middle (active) step in the timeline. */
	highlight?: boolean;
};

export type ComparisonTestimonial = {
	id: string;
	quote: string;
	authorName: string;
	authorRole: string;
	authorAvatarUrl: string;
	rating: 1 | 2 | 3 | 4 | 5;
};

export type Competitor = {
	slug: 'buffer';
	displayName: string;
	/** Single-letter mark used in the table header and footer chip. */
	initial: string;
	hero: {
		eyebrowPill: string;
		title: string;
		subhead: string;
	};
	trustedByLabel: string;
	quickVerdict: ComparisonQuickVerdict[];
	featureGroups: ComparisonFeatureGroup[];
	pricing: {
		us: ComparisonPricingTier;
		them: ComparisonPricingTier;
	};
	migration: {
		eyebrow: string;
		title: string;
		steps: ComparisonMigrationStep[];
		ctaLabel: string;
		ctaHref: string;
	};
	testimonials: ComparisonTestimonial[];
	/** Pill rendered on each testimonial card (e.g. "Ex-Buffer"). */
	testimonialBadgeLabel: string;
	faq: MarketingFaqItem[];
	bottomCta: {
		eyebrow: string;
		title: string;
		subhead: string;
		ctaLabel: string;
	};
};

// ----------------------------------------------------------------------

const BUFFER: Competitor = {
	slug: 'buffer',
	displayName: 'Buffer',
	initial: 'B',
	hero: {
		eyebrowPill: 'vs Buffer · Comparison',
		title: 'Why teams switching from Buffer choose PublyApp',
		subhead:
			"Stop juggling disjointed tools. See how PublyApp's unified growth engine outpaces Buffer in analytics, collaboration, and sheer execution power.",
	},
	trustedByLabel: 'Trusted by 5,000+ modern teams',
	quickVerdict: [
		{
			id: 'best-for',
			heading: 'Best For',
			us: {
				title: 'PublyApp',
				body: 'Mid-market & enterprise teams needing approvals, rich analytics, and CRM sync.',
			},
			them: {
				title: 'Buffer',
				body: 'Solo creators and small businesses wanting basic scheduling.',
			},
		},
		{
			id: 'pricing-model',
			heading: 'Pricing Model',
			us: {
				title: 'PublyApp',
				body: 'Flat rate per workspace. Unlimited seats on Team tier. Predictable scale.',
			},
			them: {
				title: 'Buffer',
				body: 'Per-channel pricing. Adds up quickly as your presence grows.',
			},
		},
		{
			id: 'standout',
			heading: 'Stand-out Feature',
			us: {
				title: 'Advocate Engine',
				body: 'Auto-identifies top engagers to turn followers into active brand advocates.',
			},
			them: {
				title: 'Start Page',
				body: 'Basic link-in-bio tool. Provided as a separate mini-product.',
			},
		},
	],
	featureGroups: [
		{
			id: 'publishing',
			label: 'Publishing & Scheduling',
			rows: [
				{
					id: 'visual-calendar',
					feature: 'Visual Calendar',
					us: { kind: 'yes' },
					them: { kind: 'weak' },
					notes: 'Industry standard.',
				},
				{
					id: 'bulk-upload',
					feature: 'Bulk Upload via CSV',
					us: { kind: 'yes' },
					them: { kind: 'tag', label: 'Limited' },
					notes: 'Buffer requires Zapier for advanced limits.',
				},
				{
					id: 'ai-caption',
					feature: 'AI Caption Generation',
					us: { kind: 'yes' },
					them: { kind: 'weak' },
					notes: 'Both offer built-in AI assistants.',
				},
			],
		},
		{
			id: 'collaboration',
			label: 'Collaboration & Workflows',
			rows: [
				{
					id: 'multi-tier-approvals',
					feature: 'Multi-tier Approvals',
					us: { kind: 'yes' },
					them: { kind: 'no' },
					notes: 'PublyApp allows legal/manager sign-offs.',
				},
				{
					id: 'internal-comments',
					feature: 'Internal Post Comments',
					us: { kind: 'yes' },
					them: { kind: 'weak' },
					notes: 'Both support basic commenting.',
				},
				{
					id: 'external-share-links',
					feature: 'External Share Links (Client View)',
					us: { kind: 'yes' },
					them: { kind: 'no' },
					notes: 'Share live previews without logins.',
				},
			],
		},
		{
			id: 'growth',
			label: 'Growth & Analytics',
			rows: [
				{
					id: 'custom-reports',
					feature: 'Custom Report Builder',
					us: { kind: 'yes' },
					them: { kind: 'tag', label: '$ Extra' },
					notes: 'Buffer requires premium add-on.',
				},
				{
					id: 'advocate-id',
					feature: 'Advocate Identification',
					us: { kind: 'yes' },
					them: { kind: 'no' },
					notes: 'PublyApp Exclusive',
					notesEmphasis: true,
				},
			],
		},
	],
	pricing: {
		them: {
			productName: 'Buffer Team',
			price: '$12',
			period: '/mo',
			highlight: '+ $12 per additional channel',
			features: [
				{ label: 'Unlimited users', included: true },
				{ label: 'Draft approvals', included: true },
				{ label: 'Basic Analytics', included: true },
				{ label: 'Custom exports', included: false },
				{ label: 'Advocate CRM', included: false },
			],
		},
		us: {
			productName: 'PublyApp Growth',
			price: '$49',
			period: '/mo',
			highlight: 'Flat fee. Up to 15 channels included.',
			features: [
				{ label: '15 Social Channels included', included: true },
				{ label: 'Unlimited Team Seats', included: true },
				{ label: 'Advanced Analytics & White-label', included: true },
				{ label: 'The Advocate Engine', included: true, emphasis: true },
			],
			ctaLabel: 'Start 14-day free trial',
			ctaHref: FRONT_PATH_NAMES.auth.signup,
		},
	},
	migration: {
		eyebrow: 'Switching is easy',
		title: 'Move from Buffer in under 24 hours',
		steps: [
			{
				index: 1,
				title: 'Connect accounts',
				body: 'Securely authenticate your social profiles in one click.',
			},
			{
				index: 2,
				title: 'We sync your data',
				body: 'Our automated tool imports your scheduled queue safely.',
				highlight: true,
			},
			{
				index: 3,
				title: 'You start publishing',
				body: 'Resume your strategy immediately with better tools.',
			},
		],
		ctaLabel: 'Talk to our migration team',
		ctaHref: FRONT_PATH_NAMES.marketing.contact,
	},
	testimonials: [
		{
			id: 'sarah-jenkins',
			quote:
				'We outgrew Buffer the moment we hired our third social manager. The approval workflows in PublyApp saved us from countless typos and brand misalignments.',
			authorName: 'Sarah Jenkins',
			authorRole: 'Head of Social, MetricFlow',
			authorAvatarUrl:
				'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80',
			rating: 5,
		},
		{
			id: 'david-chen',
			quote:
				"Buffer was nickel-and-diming us for every new client channel. Moving to PublyApp's flat-rate agency tier cut our software costs by 40% immediately.",
			authorName: 'David Chen',
			authorRole: 'Founder, Oura Media',
			authorAvatarUrl:
				'https://images.unsplash.com/photo-1599566150163-29194dcaad36?auto=format&fit=crop&w=150&q=80',
			rating: 5,
		},
		{
			id: 'elena-rostova',
			quote:
				"The Advocate Engine is the deciding factor. We don't just schedule posts anymore; we actually know who our top fans are and how to engage them.",
			authorName: 'Elena Rostova',
			authorRole: 'CMO, Loomis',
			authorAvatarUrl:
				'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=150&q=80',
			rating: 5,
		},
	],
	testimonialBadgeLabel: 'Ex-Buffer',
	faq: [
		{
			question: 'Will I lose my scheduled posts if I switch?',
			answer:
				'Not at all. Our migration tool securely connects to your Buffer account and imports your entire queue, maintaining dates, times, and media attachments exactly as you set them.',
		},
		{
			question: 'How does the pricing actually compare at scale?',
			answer:
				'Buffer charges per channel. If you have 3 brands with 4 channels each (12 total), Buffer costs roughly $144/mo. PublyApp gives you up to 15 channels for a flat $49/mo rate. The savings grow as you grow.',
		},
		{
			question: 'Can I export my historical data from Buffer?',
			answer:
				'Yes. We recommend doing a standard CSV export of your analytics from Buffer before closing your account. While we can import your queue, historical post performance must be exported manually for your records.',
		},
		{
			question: 'Do you offer special pricing for non-profits?',
			answer:
				'Absolutely. We offer a 50% discount on all plans for registered 501(c)(3) organizations or international equivalents. Contact our support team after starting your trial.',
		},
	],
	bottomCta: {
		eyebrow: 'Make the switch',
		title: 'Ready to make the switch?',
		subhead:
			'Join thousands of teams who have graduated from basic scheduling to a complete growth platform. Setup takes less than 3 minutes.',
		ctaLabel: 'Start 14-day free trial',
	},
};

// ----------------------------------------------------------------------

export const COMPETITORS: Record<string, Competitor> = {
	buffer: BUFFER,
};

export const findCompetitor = (slug: string | undefined): Competitor | null => {
	if (!slug) {
		return null;
	}
	return COMPETITORS[slug] ?? null;
};
