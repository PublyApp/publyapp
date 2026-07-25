import { expect, test } from '@playwright/test';

import { loginAsStaffAdmin } from './helpers/login';

const EMPTY_STORAGE_STATE = {
	cookies: [],
	origins: [],
};

const AUTHED_CHROME_MARKERS = [
	'data-mode="authed"',
	'data-testid="app-shell-rail"',
	'data-testid="app-shell-topbar"',
];

type MatrixCase = {
	name: string;
	path: string;
	status: number;
	cookie?: string;
	location?: RegExp;
};

test.use({ storageState: EMPTY_STORAGE_STATE });

const expectNoAuthedChrome = (html: string) => {
	for (const marker of AUTHED_CHROME_MARKERS) {
		expect(html).not.toContain(marker);
	}
};

test('SSR never serves authenticated chrome from an unvalidated cookie or a /staff prefix', async ({
	request,
}) => {
	const cases: readonly MatrixCase[] = [
		{
			name: 'no cookie on a known authed route',
			path: '/staff/staff-users',
			status: 307,
			location: /\/login\?rto=%2Fstaff%2Fstaff-users$/,
		},
		{
			name: 'no cookie on an unknown staff path',
			path: '/staff/users',
			status: 404,
		},
		{
			name: 'no cookie on another unknown staff path',
			path: '/staff/not-a-route',
			status: 404,
		},
		{
			name: 'no cookie on a lookalike public path',
			path: '/staffing',
			status: 404,
		},
		{
			name: 'forged staff token',
			path: '/staff/staff-users',
			cookie: 'publyapp-session_token=s:forged',
			status: 200,
		},
		{
			name: 'validly formatted forged staff and tenant hints',
			path: '/staff/staff-users',
			cookie: 'publyapp-session_token=s:forged-staff+t:forged-tenant',
			status: 200,
		},
		{
			name: 'expired token',
			path: '/staff/staff-users',
			cookie: 'publyapp-session_token=s:expired',
			status: 200,
		},
		{
			name: 'empty scoped token',
			path: '/staff/staff-users',
			cookie: 'publyapp-session_token=s:',
			status: 200,
		},
		{
			name: 'malformed raw legacy token',
			path: '/staff/staff-users',
			cookie: 'publyapp-session_token=forged-legacy',
			status: 200,
		},
	];

	for (const matrixCase of cases) {
		const response = await request.get(matrixCase.path, {
			headers: matrixCase.cookie ? { cookie: matrixCase.cookie } : undefined,
			maxRedirects: 0,
		});
		const html = await response.text();

		expect(response.status(), matrixCase.name).toBe(matrixCase.status);
		if (matrixCase.location) {
			expect(response.headers().location, matrixCase.name).toMatch(
				matrixCase.location,
			);
		}
		expectNoAuthedChrome(html);
	}
});

test('a genuine session cold-loads the authenticated shell without a hydration error', async ({
	page,
}) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => {
		pageErrors.push(error.message);
	});

	await loginAsStaffAdmin(page);
	await page.goto('/staff/staff-users');

	await expect(page).toHaveURL(/\/staff\/staff-users(?:[?#].*)?$/);
	await expect(page.getByTestId('app-shell-shell')).toHaveAttribute(
		'data-mode',
		'authed',
	);
	await expect(page.getByTestId('app-shell-rail')).toBeVisible();
	await expect(page.getByTestId('app-shell-topbar')).toBeVisible();
	expect(pageErrors).toEqual([]);
});
