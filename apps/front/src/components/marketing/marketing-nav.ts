import {
	IconBuildingSkyscraper,
	IconCreditCard,
	IconHistory,
	IconLayoutDashboard,
	IconLock,
	IconNotes,
	IconShieldLock,
	IconStack2,
	type TablerIcon,
	IconTimeline,
	IconUsers,
	IconWorld,
} from '@tabler/icons-react';

/**
 * The marketing shell's navigation model (#1038 · design handoff §"Marketing
 * shell").
 *
 * ## Why entries carry an optional destination
 *
 * The handoff draws a mega-menu, a footer and a nav bar for a marketing site
 * whose per-feature and resource pages (Tenants, Profiles, Blog, Changelog,
 * Security, About, Contact, the legal trio, …) do not exist in `apps/front`
 * yet — the six marketing PRs that would have built them were closed against
 * the pre-rename frontend on 2026-07-21 and are still owed. The handoff's own
 * rule for that case is explicit ("Omitted rather than linked … no dead ends.
 * An empty mega-menu or footer column renders nothing at all — no heading
 * with nothing under it"), so an entry without a `to` is DATA, not a link:
 * the renderers drop it, and a column or trigger left with nothing to show
 * drops with it.
 *
 * Adding the route later is therefore the whole change — give the entry a
 * `to` (and a `hash` if it targets a landing-page section) and it appears in
 * the header, the mega panel, the drawer and the footer at once. Nothing here
 * ever renders a link to a path the router cannot resolve.
 */

/**
 * Landing-page section ids the shell links into (#1038 PR 2 builds the
 * sections themselves). Exported so the page and the nav cannot drift: the
 * page must spell its section ids from this object, and every anchor target
 * carries `.publy-marketing-anchor` so it clears the sticky header.
 */
const MARKETING_SECTION_IDS = {
	productTour: 'product-tour',
	whoItIsFor: 'who-it-is-for',
	pricing: 'pricing',
	faq: 'faq',
} as const;

type MarketingSectionId =
	(typeof MARKETING_SECTION_IDS)[keyof typeof MARKETING_SECTION_IDS];

/** Every routed path a marketing destination is currently allowed to target. */
type MarketingRoutePath = '/' | '/login' | '/signup';

export type MarketingDestination = {
	/** Omitted while the destination has no route — the entry is not rendered. */
	to?: MarketingRoutePath;
	hash?: MarketingSectionId;
};

export type MarketingNavItem = MarketingDestination & {
	id: string;
	labelKey: string;
	descriptionKey: string;
	Icon: TablerIcon;
	/** Optional `New`/`Beta` badge, rendered through the Badge primitive. */
	badgeKey?: string;
};

export type MarketingNavColumn = {
	id: string;
	titleKey: string;
	items: readonly MarketingNavItem[];
};

export type MarketingNavTrigger = MarketingDestination & {
	id: string;
	labelKey: string;
	columns: readonly MarketingNavColumn[];
};

type MarketingFooterLink = MarketingDestination & {
	id: string;
	labelKey: string;
};

export type MarketingFooterColumn = {
	id: string;
	titleKey: string;
	links: readonly MarketingFooterLink[];
};

/** The same entry once it is known to point at a route that exists. */
type Routed<T extends MarketingDestination> = T & {
	to: MarketingRoutePath;
};

export type RoutedMarketingNavColumn = Omit<MarketingNavColumn, 'items'> & {
	items: Routed<MarketingNavItem>[];
};

export type RoutedMarketingFooterColumn = Omit<
	MarketingFooterColumn,
	'links'
> & {
	links: Routed<MarketingFooterLink>[];
};

/** An entry is renderable only once it points at a route that exists. */
const isRoutedDestination = <T extends MarketingDestination>(
	entry: T,
): entry is Routed<T> => entry.to !== undefined;

const routedItems = (
	items: readonly MarketingNavItem[],
): Routed<MarketingNavItem>[] => items.filter(isRoutedDestination);

export const routedColumns = (
	columns: readonly MarketingNavColumn[],
): RoutedMarketingNavColumn[] => {
	const result: RoutedMarketingNavColumn[] = [];
	for (const column of columns) {
		const items = routedItems(column.items);
		if (items.length > 0) {
			result.push({ ...column, items });
		}
	}
	return result;
};

export const routedFooterColumns = (
	columns: readonly MarketingFooterColumn[],
): RoutedMarketingFooterColumn[] => {
	const result: RoutedMarketingFooterColumn[] = [];
	for (const column of columns) {
		const links = column.links.filter(isRoutedDestination);
		if (links.length > 0) {
			result.push({ ...column, links });
		}
	}
	return result;
};

const PLATFORM_COLUMN: MarketingNavColumn = {
	id: 'platform',
	titleKey: 'marketing-nav-platform',
	items: [
		{
			id: 'tenants',
			labelKey: 'marketing-nav-tenants',
			descriptionKey: 'marketing-nav-tenants-description',
			Icon: IconBuildingSkyscraper,
		},
		{
			id: 'profiles',
			labelKey: 'marketing-nav-profiles',
			descriptionKey: 'marketing-nav-profiles-description',
			Icon: IconWorld,
		},
		{
			id: 'permissions',
			labelKey: 'marketing-nav-permissions',
			descriptionKey: 'marketing-nav-permissions-description',
			Icon: IconShieldLock,
		},
		{
			id: 'audit-logs',
			labelKey: 'marketing-nav-audit-logs',
			descriptionKey: 'marketing-nav-audit-logs-description',
			Icon: IconHistory,
			badgeKey: 'marketing-badge-new',
		},
		{
			id: 'dashboards',
			labelKey: 'marketing-nav-dashboards',
			descriptionKey: 'marketing-nav-dashboards-description',
			Icon: IconLayoutDashboard,
		},
	],
};

const SOLUTIONS_COLUMN: MarketingNavColumn = {
	id: 'solutions',
	titleKey: 'marketing-nav-solutions',
	items: [
		{
			id: 'agencies',
			labelKey: 'marketing-nav-agencies',
			descriptionKey: 'marketing-nav-agencies-description',
			Icon: IconUsers,
		},
		{
			id: 'multi-brand',
			labelKey: 'marketing-nav-multi-brand',
			descriptionKey: 'marketing-nav-multi-brand-description',
			Icon: IconStack2,
		},
		{
			id: 'editorial',
			labelKey: 'marketing-nav-editorial',
			descriptionKey: 'marketing-nav-editorial-description',
			Icon: IconNotes,
		},
	],
};

const RESOURCES_COLUMN: MarketingNavColumn = {
	id: 'resources',
	titleKey: 'marketing-nav-resources',
	items: [
		{
			id: 'pricing',
			labelKey: 'marketing-nav-pricing',
			descriptionKey: 'marketing-nav-pricing-description',
			Icon: IconCreditCard,
			to: '/',
			hash: MARKETING_SECTION_IDS.pricing,
		},
		{
			id: 'blog',
			labelKey: 'marketing-nav-blog',
			descriptionKey: 'marketing-nav-blog-description',
			Icon: IconNotes,
		},
		{
			id: 'changelog',
			labelKey: 'marketing-nav-changelog',
			descriptionKey: 'marketing-nav-changelog-description',
			Icon: IconTimeline,
		},
		{
			id: 'security',
			labelKey: 'marketing-nav-security',
			descriptionKey: 'marketing-nav-security-description',
			Icon: IconLock,
		},
	],
};

/**
 * Header triggers. A trigger with routed mega-menu items opens the mega panel
 * (>=1024) or an accordion section (drawer); a trigger with none of those but
 * its own destination degrades to a plain link; a trigger with neither is not
 * rendered at all.
 */
export const MARKETING_NAV_TRIGGERS: readonly MarketingNavTrigger[] = [
	{
		id: 'platform',
		labelKey: 'marketing-nav-platform',
		to: '/',
		hash: MARKETING_SECTION_IDS.productTour,
		columns: [PLATFORM_COLUMN],
	},
	{
		id: 'solutions',
		labelKey: 'marketing-nav-solutions',
		to: '/',
		hash: MARKETING_SECTION_IDS.whoItIsFor,
		columns: [SOLUTIONS_COLUMN],
	},
	{
		id: 'pricing',
		labelKey: 'marketing-nav-pricing',
		to: '/',
		hash: MARKETING_SECTION_IDS.pricing,
		columns: [],
	},
	{
		id: 'resources',
		labelKey: 'marketing-nav-resources',
		columns: [RESOURCES_COLUMN],
	},
];

/*
 * The handoff's mega-panel promo row ("Audit logs now record profile-level
 * publishing actions" -> "Read the changelog") is deliberately NOT
 * implemented here: its only destination is the changelog, which has no
 * route, so under the no-dead-ends rule above the row could never render. It
 * comes back with the changelog page, as a routed entry like every other.
 */

export const MARKETING_FOOTER_COLUMNS: readonly MarketingFooterColumn[] = [
	{
		id: 'product',
		titleKey: 'marketing-footer-product',
		links: [
			{ id: 'platform', labelKey: 'marketing-nav-platform-overview' },
			{
				id: 'pricing',
				labelKey: 'marketing-nav-pricing',
				to: '/',
				hash: MARKETING_SECTION_IDS.pricing,
			},
			{ id: 'tenants', labelKey: 'marketing-nav-tenants' },
			{ id: 'profiles', labelKey: 'marketing-nav-profiles' },
			{ id: 'permissions', labelKey: 'marketing-nav-permissions' },
			{ id: 'security', labelKey: 'marketing-nav-security' },
		],
	},
	{
		id: 'company',
		titleKey: 'marketing-footer-company',
		links: [
			{ id: 'about', labelKey: 'marketing-footer-about' },
			{ id: 'contact', labelKey: 'marketing-footer-contact' },
		],
	},
	{
		id: 'resources',
		titleKey: 'marketing-nav-resources',
		links: [
			{ id: 'blog', labelKey: 'marketing-nav-blog' },
			{ id: 'changelog', labelKey: 'marketing-nav-changelog' },
		],
	},
	{
		id: 'legal',
		titleKey: 'marketing-footer-legal',
		links: [
			{ id: 'privacy', labelKey: 'marketing-footer-privacy' },
			{ id: 'terms', labelKey: 'marketing-footer-terms' },
			{ id: 'cookies', labelKey: 'marketing-footer-cookie-policy' },
		],
	},
];

/**
 * Social-proof wordmarks. PLACEHOLDER CONTENT — no customer has agreed to be
 * named here. Real logos ship as `currentColor` SVG at
 * `--publy-foreground-muted`; until then these render as neutral wordmark
 * plates that are visibly marked as placeholders in the DOM
 * (`data-placeholder-logo`), never as claimed customers.
 */
export const MARKETING_SOCIAL_PROOF_PLACEHOLDER_COUNT = 6;
