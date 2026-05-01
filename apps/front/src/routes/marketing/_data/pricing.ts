// Marketing pricing data — single source of truth for tier prices, feature
// matrix, and FAQ items. Consumed by the home pricing strip (TIERS.slice(0, 2))
// and the dedicated /pricing page (full TIERS, COMPARISON_MATRIX, PRICING_FAQS).

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

export type PricingTierId = 'creator' | 'scale' | 'enterprise';

export type PricingTier = {
	id: PricingTierId;
	name: string;
	tagline: string;
	pricing: { monthly: number | 'custom'; annually: number | 'custom' };
	features: string[];
	cta: { label: string; href: string };
	highlighted?: boolean;
};

export type ComparisonCategory =
	| 'Social Accounts'
	| 'Scheduling'
	| 'Content Creation'
	| 'Collaboration'
	| 'AI & Automation'
	| 'Advanced';

export type ComparisonRow = {
	category: ComparisonCategory;
	feature: string;
	tiers: Record<PricingTierId, boolean | string>;
};

export type PricingFaqItem = { question: string; answer: string };

export const TIERS: PricingTier[] = [
	{
		id: 'creator',
		name: 'Creator',
		tagline: 'Perfect for individuals starting to build their audience.',
		pricing: { monthly: 19, annually: 15 },
		features: [
			'1 Workspace Seat',
			'3 Social Accounts',
			'50 Scheduled Posts /mo',
			'Standard Support',
		],
		cta: {
			label: 'Start 14-day trial',
			href: FRONT_PATH_NAMES.auth.signup,
		},
	},
	{
		id: 'scale',
		name: 'Scale',
		tagline: 'For growing teams requiring robust automation.',
		pricing: { monthly: 49, annually: 39 },
		features: [
			'Everything in Creator, plus:',
			'Unlimited Social Accounts',
			'Unlimited Scheduled Posts',
			'Advanced Analytics (1 Year)',
			'Approval Workflows',
			'API Access & Integrations',
			'Priority Email Support',
		],
		cta: {
			label: 'Get started',
			href: FRONT_PATH_NAMES.auth.signup,
		},
		highlighted: true,
	},
	{
		id: 'enterprise',
		name: 'Enterprise',
		tagline: 'Custom operations for large scale organizations.',
		pricing: { monthly: 'custom', annually: 'custom' },
		features: [
			'Everything in Scale, plus:',
			'SAML SSO / SCIM',
			'Custom Integrations & API Limits',
			'Dedicated Success Manager',
			'Custom SLA Reporting',
			'SOC 2 Type II Compliance',
		],
		// Phase 1: enterprise CTA points to a mailto until /contact exists in Phase 3.
		// Update href to FRONT_PATH_NAMES.marketing.contact when Phase 3 ships.
		cta: {
			label: 'Talk to sales',
			href: 'mailto:sales@publyapp.com',
		},
	},
];

export const COMPARISON_MATRIX: ComparisonRow[] = [
	// Social Accounts
	{
		category: 'Social Accounts',
		feature: 'Allowed profiles',
		tiers: { creator: '3', scale: 'Unlimited', enterprise: 'Custom' },
	},
	{
		category: 'Social Accounts',
		feature: 'Supported platforms',
		tiers: {
			creator: 'All platforms',
			scale: 'All platforms',
			enterprise: 'All platforms',
		},
	},
	{
		category: 'Social Accounts',
		feature: 'Account grouping',
		tiers: { creator: false, scale: true, enterprise: true },
	},

	// Scheduling
	{
		category: 'Scheduling',
		feature: 'Scheduled posts',
		tiers: { creator: '50 /mo', scale: 'Unlimited', enterprise: 'Unlimited' },
	},
	{
		category: 'Scheduling',
		feature: 'Scheduling history',
		tiers: { creator: '30 days', scale: '1 year', enterprise: 'Unlimited' },
	},
	{
		category: 'Scheduling',
		feature: 'Content queues',
		tiers: { creator: false, scale: true, enterprise: true },
	},
	{
		category: 'Scheduling',
		feature: 'Bulk upload (CSV)',
		tiers: { creator: false, scale: true, enterprise: true },
	},

	// Content Creation
	{
		category: 'Content Creation',
		feature: 'Media gallery',
		tiers: { creator: '1 GB', scale: '10 GB', enterprise: 'Unlimited' },
	},
	{
		category: 'Content Creation',
		feature: 'Image editor',
		tiers: { creator: true, scale: true, enterprise: true },
	},
	{
		category: 'Content Creation',
		feature: 'First comment management',
		tiers: { creator: false, scale: true, enterprise: true },
	},

	// Collaboration
	{
		category: 'Collaboration',
		feature: 'Workspace seats',
		tiers: {
			creator: '1 seat',
			scale: 'Unlimited ($49/seat)',
			enterprise: 'Unlimited',
		},
	},
	{
		category: 'Collaboration',
		feature: 'Approval workflow',
		tiers: { creator: false, scale: true, enterprise: true },
	},
	{
		category: 'Collaboration',
		feature: 'Internal comments',
		tiers: { creator: false, scale: true, enterprise: true },
	},

	// AI & Automation
	{
		category: 'AI & Automation',
		feature: 'AI Writing Assistant',
		tiers: { creator: false, scale: true, enterprise: true },
	},
	{
		category: 'AI & Automation',
		feature: 'AI Image generation',
		tiers: { creator: false, scale: '100 /mo', enterprise: 'Unlimited' },
	},
	{
		category: 'AI & Automation',
		feature: 'Zapier integration',
		tiers: { creator: false, scale: true, enterprise: true },
	},

	// Advanced
	{
		category: 'Advanced',
		feature: 'API Access',
		tiers: { creator: false, scale: false, enterprise: true },
	},
	{
		category: 'Advanced',
		feature: 'SSO (SAML)',
		tiers: { creator: false, scale: false, enterprise: true },
	},
	{
		category: 'Advanced',
		feature: 'Audit logs',
		tiers: { creator: false, scale: false, enterprise: true },
	},
	{
		category: 'Advanced',
		feature: 'SOC 2 Type II Report',
		tiers: { creator: false, scale: false, enterprise: true },
	},
];

export const PRICING_FAQS: PricingFaqItem[] = [
	{
		question: 'Can I switch plans later?',
		answer:
			'Absolutely. You can upgrade or downgrade your plan at any time from your billing dashboard. Modifications take effect immediately, and we pro-rate any partial months automatically.',
	},
	{
		question: 'What happens when I exceed my scheduled post limit?',
		answer:
			'If you are on the Creator plan, posts beyond your 50 limit will be saved to your draft queue. They will unlock and schedule on your next billing cycle, or you can upgrade to Scale for immediate unlimited access.',
	},
	{
		question: 'Do you offer annual discounts?',
		answer:
			'Yes, we offer a 20% discount on all tiers when you commit to an annual billing cycle. You can toggle this option at the top of the pricing page.',
	},
	{
		question: 'Is there a free trial?',
		answer:
			'Yes! Every new workspace gets a 14-day full access trial to the Scale plan so you can test team workflows and advanced analytics before deciding. No credit card required.',
	},
	{
		question: 'Can I cancel anytime?',
		answer:
			"Yes, we believe in locking in value, not contracts. If PublyApp isn't a fit, you can cancel your subscription with two clicks inside your workspace settings.",
	},
];
