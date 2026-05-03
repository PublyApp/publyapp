// Marketing about-page data — single source of truth for company values and
// the team grid. Consumed by the dedicated /about page.

import type { IconifyName } from '#app/components/iconify/register-icons.ts';

// ----------------------------------------------------------------------

export type CompanyValue = {
	id: string;
	title: string;
	body: string;
	icon: IconifyName; // registered Iconify name, e.g. 'ph:rocket-bold'
};

export type TeamMember = {
	id: string;
	name: string;
	role: string;
};

// ----------------------------------------------------------------------

export const COMPANY_VALUES: CompanyValue[] = [
	{
		id: 'ship-daily',
		title: 'Ship daily',
		body: 'Small, frequent shipments compound. We deploy features weeks before others get out of meeting rooms.',
		icon: 'ph:rocket-bold',
	},
	{
		id: 'operator-first',
		title: 'Operator-first',
		body: 'Built by people who lived in 14-tab nightmares. Every feature solves a problem we hated first.',
		icon: 'ph:gear-bold',
	},
	{
		id: 'honest-defaults',
		title: 'Honest defaults',
		body: "No dark patterns, no gotcha pricing, no upsells you didn't ask for. Trust scales further than tricks.",
		icon: 'ph:handshake-bold',
	},
	{
		id: 'no-flake',
		title: 'No flake',
		body: "Reliability isn't a feature, it's the bare minimum. 99.97% uptime SLA backed by ops-grade infrastructure.",
		icon: 'ph:shield-check-bold',
	},
];

export const TEAM_MEMBERS: TeamMember[] = [
	{
		id: 'elena-rodriguez',
		name: 'Elena Rodriguez',
		role: 'Head of Product',
	},
	{
		id: 'marcus-reynolds',
		name: 'Marcus Reynolds',
		role: 'CEO & Co-founder',
	},
	{
		id: 'sarah-jenkins',
		name: 'Sarah Jenkins',
		role: 'CTO & Co-founder',
	},
	{
		id: 'david-chen',
		name: 'David Chen',
		role: 'Lead Staff Engineer',
	},
	{
		id: 'aisha-patel',
		name: 'Aisha Patel',
		role: 'Head of Customer Success',
	},
	{
		id: 'tomos-williams',
		name: 'Tomos Williams',
		role: 'VP of Revenue',
	},
	{
		id: 'chloe-okafor',
		name: 'Chloe Okafor',
		role: 'Principal Designer',
	},
	{
		id: 'liam-oconnor',
		name: "Liam O'Connor",
		role: 'Infrastructure Lead',
	},
	{
		id: 'nina-sorensen',
		name: 'Nina Sørensen',
		role: 'Product Manager',
	},
	{
		id: 'james-k',
		name: 'James K.',
		role: 'Backend Engineer',
	},
	{
		id: 'priya-sharma',
		name: 'Priya Sharma',
		role: 'Frontend Engineer',
	},
	{
		id: 'samira-al-fayed',
		name: 'Samira Al-Fayed',
		role: 'Support Ops',
	},
];
