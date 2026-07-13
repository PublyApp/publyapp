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

/** Returns a hit counter alongside the route registration so the test can
 * prove the mocked handler actually fired, rather than trusting that the
 * resulting URL could only be reached via this specific route (three
 * independent paths can all land on the same `/login?rc=invalid_session`
 * URL — see review-r1-tests.md F15). Only counts GET requests: the API
 * origin (`api.front-2.localhost`) is cross-origin from the app
 * (`front-2.localhost`), and the client attaches a non-simple
 * `X-Session-Token` header, so the browser sends a CORS preflight `OPTIONS`
 * request ahead of every real `GET` — matching this same path. Forwarding
 * it via `route.fallback()` (the same method-filter pattern every other
 * mocked route in this suite uses) keeps that preflight on the real
 * network instead of double-counting it as a second logical call. */
const mockAuthRedirectCode = async (
	page: Page,
	status: number,
	body: Record<string, unknown> = {},
): Promise<{ hits: () => number }> => {
	let hits = 0;
	await page.route('**/auth/redirect-code**', async (route) => {
		if (route.request().method() !== 'GET') {
			await route.fallback();
			return;
		}

		hits += 1;
		await route.fulfill({
			status,
			headers: {
				'content-type': 'application/json',
			},
			body: JSON.stringify(body),
		});
	});

	return { hits: () => hits };
};

test('auth surface invalid session stays on login and stays reachable', async ({
	page,
}) => {
	await setSessionCookie(page);
	await page.goto('/login?rc=invalid_session');

	await expect(
		page.getByText('Your session expired. Please sign in again.'),
	).toBeVisible();
	const cookie = await page.evaluate(() => document.cookie);
	expect(cookie).toContain(TENANT_TOKEN_VALUE);
	expect(page.url()).toContain('/login');
});

test('authed 401 does not stay authed and redirects through logout flow', async ({
	page,
}) => {
	await setSessionCookie(page);
	const cookieBeforeNavigation = await page.evaluate(() => document.cookie);
	expect(cookieBeforeNavigation).toContain(TENANT_TOKEN_VALUE);

	const redirectCodeMock = await mockAuthRedirectCode(page, 401, {
		status: 401,
		title: 'Unauthorized',
		detail: 'Token invalid',
	});

	await page.goto('/tenant');

	await expect(page).toHaveURL(/.*\/login\?rc=invalid_session/);
	expect(redirectCodeMock.hits()).toBe(1);
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

test('404 "Return home" navigates client-side instead of reloading the document', async ({
	page,
}) => {
	await page.goto('/route-does-not-exist');
	await expect(page.getByTestId('view-404')).toBeVisible();

	await page.evaluate(() => {
		(window as unknown as { __spaAlive?: boolean }).__spaAlive = true;
	});
	await page
		.getByTestId('view-404')
		.getByRole('link', { name: /home/i })
		.click();

	const alive = await page.evaluate(
		() => (window as unknown as { __spaAlive?: boolean }).__spaAlive === true,
	);
	expect(alive).toBe(true);
});
