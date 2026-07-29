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
	photoUrl: string;
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

// Photo URLs use Unsplash hot-link pattern with face-cropped 200x200 thumbnails.
// All photos are placeholder portraits — replace with real team photos pre-launch.
const unsplashPortrait = (slug: string): string => {
	return `https://images.unsplash.com/photo-${slug}?w=240&h=240&fit=crop&crop=faces&auto=format&q=80`;
};

export const TEAM_MEMBERS: TeamMember[] = [
	{
		id: 'elena-rodriguez',
		name: 'Elena Rodriguez',
		role: 'Head of Product',
		photoUrl: unsplashPortrait('1494790108377-be9c29b29330'),
	},
	{
		id: 'marcus-reynolds',
		name: 'Marcus Reynolds',
		role: 'CEO & Co-founder',
		photoUrl: unsplashPortrait('1507003211169-0a1dd7228f2d'),
	},
	{
		id: 'sarah-jenkins',
		name: 'Sarah Jenkins',
		role: 'CTO & Co-founder',
		photoUrl: unsplashPortrait('1438761681033-6461ffad8d80'),
	},
	{
		id: 'david-chen',
		name: 'David Chen',
		role: 'Lead Staff Engineer',
		photoUrl: unsplashPortrait('1500648767791-00dcc994a43e'),
	},
	{
		id: 'aisha-patel',
		name: 'Aisha Patel',
		role: 'Head of Customer Success',
		photoUrl: unsplashPortrait('1517841905240-472988babdf9'),
	},
	{
		id: 'tomos-williams',
		name: 'Tomos Williams',
		role: 'VP of Revenue',
		photoUrl: unsplashPortrait('1472099645785-5658abf4ff4e'),
	},
	{
		id: 'chloe-okafor',
		name: 'Chloe Okafor',
		role: 'Principal Designer',
		photoUrl: unsplashPortrait('1573496359142-b8d87734a5a2'),
	},
	{
		id: 'liam-oconnor',
		name: "Liam O'Connor",
		role: 'Infrastructure Lead',
		photoUrl: unsplashPortrait('1463453091185-61582044d556'),
	},
	{
		id: 'nina-sorensen',
		name: 'Nina Sørensen',
		role: 'Product Manager',
		photoUrl: unsplashPortrait('1488426862026-3ee34a7d66df'),
	},
	{
		id: 'james-k',
		name: 'James K.',
		role: 'Backend Engineer',
		photoUrl: unsplashPortrait('1531427186611-ecfd6d936c79'),
	},
	{
		id: 'priya-sharma',
		name: 'Priya Sharma',
		role: 'Frontend Engineer',
		photoUrl: unsplashPortrait('1544005313-94ddf0286df2'),
	},
	{
		id: 'samira-al-fayed',
		name: 'Samira Al-Fayed',
		role: 'Support Ops',
		photoUrl: unsplashPortrait('1539571696357-5a69c17a67c6'),
	},
];
