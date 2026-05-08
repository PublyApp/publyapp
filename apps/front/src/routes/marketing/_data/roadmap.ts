// Marketing roadmap-page data — single source of truth for the public
// roadmap kanban (now / next / later) and the recently-shipped
// timeline. Replace pre-launch with real product data.

// ----------------------------------------------------------------------

export type RoadmapStatus =
	| 'in-progress'
	| 'researching'
	| 'design'
	| 'planned'
	| 'backlog';

export type RoadmapColumnId = 'now' | 'next' | 'later';

export type RoadmapItem = {
	id: string;
	columnId: RoadmapColumnId;
	category: string; // e.g. "Automation", "AI & Data" — neutral pill
	title: string;
	description: string;
	status: RoadmapStatus;
	voteCount: number;
};

export type ShippedItem = {
	id: string;
	dateIso: string; // 'YYYY-MM-DD'
	title: string;
	description: string;
};

// ----------------------------------------------------------------------

export const ROADMAP_ITEMS: RoadmapItem[] = [
	// NOW (Q2 2026) — 3 items
	{
		id: 'campaign-autopilot-v2',
		columnId: 'now',
		category: 'Automation',
		title: 'Campaign Autopilot v2',
		description:
			'Schedule multi-channel advocacy campaigns with conditional logic based on real-time target engagement.',
		status: 'in-progress',
		voteCount: 482,
	},
	{
		id: 'sentiment-analysis',
		columnId: 'now',
		category: 'AI & Data',
		title: 'Sentiment Analysis Engine',
		description:
			'Proprietary AI categorizes advocate replies into positive, neutral, or needs immediate attention.',
		status: 'in-progress',
		voteCount: 315,
	},
	{
		id: 'slack-app',
		columnId: 'now',
		category: 'Integrations',
		title: 'Complete Slack App',
		description:
			'Get immediate channel notifications when high-value VIP advocates interact with your tracked brand signals.',
		status: 'in-progress',
		voteCount: 298,
	},
	// NEXT (Q3 2026) — 3 items
	{
		id: 'tiktok-publishing',
		columnId: 'next',
		category: 'Publishing',
		title: 'TikTok Direct Publishing API',
		description:
			"Seamless integration with TikTok's Content API. Post videos directly from your central dashboard without mobile hand-offs.",
		status: 'researching',
		voteCount: 412,
	},
	{
		id: 'advocate-leaderboards',
		columnId: 'next',
		category: 'Community',
		title: 'Advocate Leaderboards',
		description:
			'Publicly verifiable, gamified leaderboards to incentivize your community to share content and drive referrals continuously.',
		status: 'design',
		voteCount: 380,
	},
	{
		id: 'team-roles',
		columnId: 'next',
		category: 'Account',
		title: 'Team Roles & Advanced Permissions',
		description:
			'Granular access control. Restrict junior social managers from publishing while allowing them to draft campaigns.',
		status: 'planned',
		voteCount: 245,
	},
	// LATER (Q4 2026) — 2 items
	{
		id: 'mobile-companion-app',
		columnId: 'later',
		category: 'Platform',
		title: 'Mobile Companion App v1',
		description:
			'iOS and Android native applications for on-the-go community management and push notification alerts.',
		status: 'backlog',
		voteCount: 854,
	},
	{
		id: 'bulk-csv-sync',
		columnId: 'later',
		category: 'Data',
		title: 'Bulk CSV Data Sync',
		description:
			'Import thousands of existing advocates via CSV, automatically mapping fields to the CRM structure.',
		status: 'backlog',
		voteCount: 210,
	},
];

// ----------------------------------------------------------------------

export const RECENTLY_SHIPPED: ShippedItem[] = [
	{
		id: 'zapier-integration',
		dateIso: '2026-04-28',
		title: 'Zapier Core Integration',
		description:
			'Connect PublyApp with 5,000+ apps. Trigger workflows based on new advocate signups or completed milestones.',
	},
	{
		id: 'dark-mode',
		dateIso: '2026-04-14',
		title: 'Dark Mode Workspaces',
		description:
			'Save your eyes during late-night campaign planning. Full dashboard support for system-preference dark themes.',
	},
	{
		id: 'stripe-payouts',
		dateIso: '2026-03-30',
		title: 'Automated Payouts via Stripe',
		description:
			'Frictionless rewards. Automatically disburse cash rewards to top-tier affiliates entirely within the dashboard.',
	},
];

// ----------------------------------------------------------------------

export const getItemsForColumn = (columnId: RoadmapColumnId): RoadmapItem[] => {
	return ROADMAP_ITEMS.filter((item) => {
		return item.columnId === columnId;
	});
};
