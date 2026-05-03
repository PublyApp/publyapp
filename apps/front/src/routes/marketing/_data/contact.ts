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
