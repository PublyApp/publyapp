import type { TocItem } from '#app/routes/marketing/_components/legal-doc-page.tsx';

// ----------------------------------------------------------------------

export const COOKIES_LAST_UPDATED = '2026-04-30'; // ISO date

// One entry per h2 in document order. The page imports this and uses
// each value as the `id` on its corresponding <Typography component="h2" id={...}>.
export const COOKIES_SECTION_IDS = {
	whatAreCookies: 'what-are-cookies',
	cookiesWeSet: 'cookies-we-set',
	thirdParty: 'third-party',
	managingPreferences: 'managing-preferences',
	updates: 'updates',
} as const;

export const COOKIES_TOC: TocItem[] = [
	{ id: COOKIES_SECTION_IDS.whatAreCookies, label: '1. What Are Cookies' },
	{ id: COOKIES_SECTION_IDS.cookiesWeSet, label: '2. Cookies We Set' },
	{ id: COOKIES_SECTION_IDS.thirdParty, label: '3. Third-Party Cookies' },
	{
		id: COOKIES_SECTION_IDS.managingPreferences,
		label: '4. Managing Your Cookie Preferences',
	},
	{ id: COOKIES_SECTION_IDS.updates, label: '5. Updates to This Policy' },
];

// Typed inventory rows so the page table has type safety on column access.
export type CookieInventoryRow = {
	name: string;
	purpose: string;
	duration: string;
};

export const COOKIES_INVENTORY: CookieInventoryRow[] = [
	{
		name: 'publyapp_session',
		purpose: 'Authenticates your dashboard session',
		duration: 'Session',
	},
	{
		name: 'publyapp:color-scheme',
		purpose: 'Remembers your light/dark mode preference',
		duration: '1 year',
	},
	{
		name: 'publyapp:tenant-id',
		purpose: 'Stores your active workspace context',
		duration: '30 days',
	},
	{
		name: '_ga',
		purpose: 'Google Analytics — distinguishes unique visitors',
		duration: '2 years',
	},
	{
		name: '_ga_X1Y2Z3',
		purpose: 'Google Analytics 4 — analytics state',
		duration: '2 years',
	},
	{
		name: 'intercom-id',
		purpose: 'Intercom support widget — visitor identity',
		duration: '9 months',
	},
];
