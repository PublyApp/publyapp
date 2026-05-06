import type { IconifyName } from '#app/components/iconify/register-icons.ts';

// ----------------------------------------------------------------------

export const CONTACT_EMAIL = 'support@publyapp.com';

// ----------------------------------------------------------------------

export type ContactChannel = {
	id: string;
	label: string; // 'Customer support', 'Sales', 'Press inquiries'
	email: string;
	icon: IconifyName;
};

export const CONTACT_CHANNELS: ContactChannel[] = [
	{
		id: 'support',
		label: 'Customer support',
		email: 'support@publyapp.com',
		icon: 'ph:lifebuoy-bold',
	},
	{
		id: 'sales',
		label: 'Sales',
		email: 'sales@publyapp.com',
		icon: 'ph:handshake-bold',
	},
	{
		id: 'press',
		label: 'Press inquiries',
		email: 'press@publyapp.com',
		icon: 'ph:megaphone-bold',
	},
];

// ----------------------------------------------------------------------

export type SupportTier = {
	id: string;
	tier: string;
	responseTime: string;
	channel: string;
};

export const SUPPORT_TIERS: SupportTier[] = [
	{
		id: 'free',
		tier: 'Free Plan',
		responseTime: '48 hours',
		channel: 'Email',
	},
	{
		id: 'creator-scale',
		tier: 'Creator / Scale',
		responseTime: '12 hours',
		channel: 'Email + chat',
	},
	{
		id: 'enterprise',
		tier: 'Enterprise',
		responseTime: '1 hour',
		channel: 'Email + chat + phone',
	},
];

// ----------------------------------------------------------------------

export type ContactTopic = {
	value: 'general' | 'sales' | 'support' | 'press';
	label: string;
};

export const CONTACT_TOPICS: ContactTopic[] = [
	{ value: 'general', label: 'General Inquiry' },
	{ value: 'sales', label: 'Sales & Upgrades' },
	{ value: 'support', label: 'Technical Support' },
	{ value: 'press', label: 'Press & Media' },
];

// ----------------------------------------------------------------------

export type ContactFaq = {
	id: string;
	question: string;
	answer: string;
};

export const CONTACT_FAQS: ContactFaq[] = [
	{
		id: 'free-trial',
		question: 'Do you offer a free trial?',
		answer:
			"Yes, all paid plans come with a no-commitment 14-day free trial. You don't need a credit card to start exploring the platform.",
	},
	{
		id: 'switch-plans',
		question: 'Can I switch plans anytime?',
		answer:
			'Absolutely. You can upgrade, downgrade, or cancel your subscription at any time directly from your dashboard settings. Credits scale proportionally.',
	},
	{
		id: 'data-security',
		question: 'Is my data secure?',
		answer:
			'We use enterprise-grade encryption for all data at rest and in transit. We are fully compliant with GDPR and SOC 2 standards.',
	},
	{
		id: 'public-api',
		question: 'Do you have a public API?',
		answer:
			'Scale and Enterprise plans include full access to our REST API, allowing you to seamlessly integrate PublyApp data into your own systems.',
	},
];
