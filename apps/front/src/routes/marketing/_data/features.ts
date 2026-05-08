import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import type { IconifyName } from '#app/components/iconify/register-icons.ts';

// ----------------------------------------------------------------------
// Per-feature deep-dive marketing pages — typed data drives a single
// template at routes/marketing/features/feature-page.tsx. Adding a new
// feature is a single-file PR: append an entry to FEATURES_DATA, point
// the topbar/footer at it, ship.
// ----------------------------------------------------------------------

export type FeatureCta = {
	label: string;
	href: string;
};

export type FeatureBenefit = {
	id: string;
	title: string;
	body: string;
	icon: IconifyName;
};

export type FeatureStep = {
	id: string;
	title: string;
	body: string;
};

export type FeatureComparisonItem = {
	id: string;
	title: string;
	body: string;
	icon: IconifyName;
	tone: 'danger' | 'warning' | 'primary';
};

export type FeatureQuote = {
	body: string;
	authorName: string;
	authorRole: string;
	authorAvatarUrl: string;
};

export type Feature = {
	slug: string;
	metaTitle: string;
	metaDescription: string;
	hero: {
		eyebrow: string;
		eyebrowIcon: IconifyName;
		// Plain text — line wrapping handled by CSS, not embedded \n. Keep
		// copy here a single sentence so any visual break is the renderer's
		// concern, not the data's.
		title: string;
		subhead: string;
		primaryCta: FeatureCta;
		secondaryCta: FeatureCta;
		socialProofText: string;
	};
	steps: {
		title: string;
		items: [FeatureStep, FeatureStep, FeatureStep];
	};
	benefits: {
		eyebrow: string;
		title: string;
		items: FeatureBenefit[];
	};
	screenshot: {
		eyebrow: string;
		title: string;
		// Unsplash photo slug consumed by `unsplashCover` from
		// _data/blog.ts. Keeping this a slug (not a full URL) matches the
		// blog data convention.
		imageSlug: string;
		imageAlt: string;
		// Fake URL displayed in the browser-chrome mockup's address bar.
		mockupUrl: string;
	};
	comparison: {
		title: string;
		items: [
			FeatureComparisonItem,
			FeatureComparisonItem,
			FeatureComparisonItem,
		];
	};
	quote: FeatureQuote;
	cta: {
		eyebrowLabel: string;
		title: string;
		subhead: string;
		ctaLabel: string;
		ctaHref: string;
		microcopy: string;
	};
};

// ----------------------------------------------------------------------

export const FEATURES_DATA: Record<string, Feature> = {
	scheduling: {
		slug: 'scheduling',
		metaTitle: 'Scheduling',
		metaDescription:
			'Stop context-switching. Visually plan, approve, and automate your entire content calendar across every network from one unified workspace.',
		hero: {
			eyebrow: 'Feature · Scheduling',
			eyebrowIcon: 'ph:calendar-blank-fill',
			title: 'Schedule once. Publish everywhere.',
			subhead:
				'Stop context-switching. Visually plan, approve, and automate your entire content calendar across every network from one unified workspace.',
			primaryCta: {
				label: 'Try it free',
				href: FRONT_PATH_NAMES.auth.signup,
			},
			secondaryCta: {
				label: 'See it in action',
				href: '#demo',
			},
			socialProofText: 'Used by 10,000+ teams weekly',
		},
		steps: {
			title: 'From draft to done in minutes.',
			items: [
				{
					id: 'compose',
					title: 'Compose once',
					body: 'Write your caption, upload creative, and let our tools optimize the format.',
				},
				{
					id: 'pick',
					title: 'Pick networks & time',
					body: 'Select your channels and drag onto the visual calendar or let AI pick the best time.',
				},
				{
					id: 'publish',
					title: 'Publish on autopilot',
					body: 'Sit back. We handle API restrictions, formatting, and final delivery flawlessly.',
				},
			],
		},
		benefits: {
			eyebrow: 'Built for real workflows',
			title: 'Everything you need to scale your publishing.',
			items: [
				{
					id: 'multi-network',
					title: 'Multi-network publishing',
					body: 'Customize a single post for LinkedIn, Twitter, Facebook, and Instagram simultaneously without opening new tabs.',
					icon: 'ph:link-bold',
				},
				{
					id: 'ai-time',
					title: 'AI Best-Time Predictor',
					body: 'Stop guessing. We analyze your audience data to suggest exact timestamps when your followers are actively scrolling.',
					icon: 'ph:lightning-fill',
				},
				{
					id: 'bulk-csv',
					title: 'Bulk CSV Upload',
					body: 'Planning a month in advance? Upload hundreds of posts instantly via CSV and map them to your calendar.',
					icon: 'ph:clipboard-text-bold',
				},
				{
					id: 'approvals',
					title: 'Approval Workflows',
					body: 'Ensure brand safety. Require manager approval before posts go live with integrated commenting and status flags.',
					icon: 'ph:users-three-bold',
				},
				{
					id: 'visual-calendar',
					title: 'Visual Content Calendar',
					body: "Get a bird's-eye view. Drag and drop posts across days and weeks. Filter by campaign, network, or status.",
					icon: 'ph:calendar-check-fill',
				},
				{
					id: 'timezones',
					title: 'Smart Time-zones',
					body: 'Managing global accounts? Set network-specific timezones so "9 AM" means 9 AM locally for every audience.',
					icon: 'ph:globe-bold',
				},
			],
		},
		screenshot: {
			eyebrow: 'See it in action',
			title: 'Your entire content calendar, at a glance.',
			// Wide dashboard-ish photo from Unsplash — the canvas used the
			// same source as a placeholder; swap for a real product
			// screenshot when one's ready.
			imageSlug: '1611162617474-5b21e879e113',
			imageAlt: 'PublyApp scheduling calendar interface',
			mockupUrl: 'app.publyapp.com/calendar',
		},
		comparison: {
			title: 'Why teams switch to PublyApp scheduling',
			items: [
				{
					id: 'vs-spreadsheets',
					title: 'Versus Spreadsheets',
					body: 'Stop manually copy-pasting links into Excel. Execute and track directly where you plan.',
					icon: 'ph:clipboard-text-bold',
					tone: 'danger',
				},
				{
					id: 'vs-native',
					title: 'Versus Native Tools',
					body: 'Logging in and out of 5 different apps daily is slow. Command them all from a single tab.',
					icon: 'ph:database-bold',
					tone: 'warning',
				},
				{
					id: 'vs-legacy',
					title: 'Versus Legacy Tools',
					body: 'Ditch the clunky, slow interfaces of the 2010s. Experience a lightweight, instantaneous UI.',
					icon: 'ph:rocket-launch-fill',
					tone: 'primary',
				},
			],
		},
		quote: {
			body: 'Before PublyApp, managing scheduling for our 12 client accounts took an entire week of manual labor. Now, with the visual calendar and bulk imports, we do it in an afternoon. It feels like we hired another full-time employee.',
			authorName: 'Sarah Jenkins',
			authorRole: 'Director of Social, Verve Media',
			authorAvatarUrl:
				'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80',
		},
		cta: {
			eyebrowLabel: 'Get started',
			title: 'Stop juggling tabs.\nStart scheduling.',
			subhead: 'Join 10,000+ modern teams executing flawlessly on autopilot.',
			ctaLabel: 'Start free trial',
			ctaHref: FRONT_PATH_NAMES.auth.signup,
			microcopy: 'No credit card required · 14-day free trial',
		},
	},
};

// ----------------------------------------------------------------------

export const getFeature = (slug: string | undefined): Feature | undefined => {
	if (!slug) {
		return undefined;
	}
	return FEATURES_DATA[slug];
};
