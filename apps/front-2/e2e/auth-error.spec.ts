import { expect, test, type Page } from '@playwright/test';

import { SESSION_TOKEN_COOKIE_KEY } from '@org/shared-ts/lib/constants';
import { formatSessionCookie } from '@org/shared-ts/lib/session/parse';

const TENANT_TOKEN_VALUE = formatSessionCookie({
	tenantToken: 'front2-demo-token',
});

const setSessionCookie = async (page: Page) => {
	await page.goto('/');
	await page.evaluate(
		({ cookieName, value }) => {
			document.cookie = `${cookieName}=${value}; path=/`;
		},
		{ cookieName: SESSION_TOKEN_COOKIE_KEY, value: TENANT_TOKEN_VALUE },
	);
};

const mockAuthRedirectCode = async (
	page: Page,
	status: number,
	body: Record<string, unknown> = {},
) => {
	// design-system-ignore: no-single-star-route-glob — pre-existing collection-only mock; not yet audited for sub-path escapes (see BACKLOG: e2e glob audit)
	await page.route('**/auth/redirect-code*', async (route) => {
		await route.fulfill({
			status,
			headers: {
				'content-type': 'application/json',
			},
			body: JSON.stringify(body),
		});
	});
};

test('auth surface invalid session stays on login and stays reachable', async ({
	page,
}) => {
	await setSessionCookie(page);
	await page.goto('/login?rc=invalid_session');

	expect(
		await page
			.getByText('Your session expired. Please sign in again.')
			.isVisible(),
	).toBe(true);
	const cookie = await page.evaluate(() => document.cookie);
	expect(cookie).toContain(TENANT_TOKEN_VALUE);
	expect(page.url()).toContain('/login');
});

test('authed 401 does not stay authed and redirects through logout flow', async ({
	page,
}) => {
	await setSessionCookie(page);
	await mockAuthRedirectCode(page, 401, {
		status: 401,
		title: 'Unauthorized',
		detail: 'Token invalid',
	});

	await page.goto('/tenant');

	await expect(page).toHaveURL(/.*\/login\?rc=invalid_session/);
	await expect(
		page.getByText('Your session expired. Please sign in again.'),
	).toBeVisible();
	const clearedCookie = await page.evaluate(() => document.cookie);
	expect(clearedCookie).not.toContain(TENANT_TOKEN_VALUE);
});

test('authed 403 renders forbidden view without logout', async ({ page }) => {
	await setSessionCookie(page);
	await mockAuthRedirectCode(page, 403, {
		status: 403,
		title: 'Forbidden',
		detail: 'No scope',
	});

	await page.goto('/tenant');
	await expect(page.getByTestId('view-403')).toBeVisible();

	expect(page.url()).toContain('/tenant');
	const cookie = await page.evaluate(() => document.cookie);
	expect(cookie).toContain(TENANT_TOKEN_VALUE);
});

test('unknown paths render the shared 404 view', async ({ page }) => {
	await page.goto('/route-does-not-exist');

	await expect(page.getByTestId('view-404')).toBeVisible();
});
