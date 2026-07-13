import { expect, test, type Page } from '@playwright/test';

import { loginAsStaffAdmin } from './helpers/login';

/**
 * TanStack Query's focus manager only listens on `window`, and
 * `visibilitychange` does not bubble from `document` to `window` in a
 * synthetic dispatch — the event must be dispatched on `window` directly to
 * reach the library's listener the same way a real browser tab-switch does.
 */
const dispatchRefocus = async (page: Page) => {
	await page.evaluate(() => {
		Object.defineProperty(document, 'visibilityState', {
			value: 'hidden',
			configurable: true,
		});
		window.dispatchEvent(new Event('visibilitychange'));
		window.dispatchEvent(new Event('blur'));
	});
	await page.waitForTimeout(100);
	await page.evaluate(() => {
		Object.defineProperty(document, 'visibilityState', {
			value: 'visible',
			configurable: true,
		});
		window.dispatchEvent(new Event('visibilitychange'));
		window.dispatchEvent(new Event('focus'));
	});
};

test.describe('tab-refocus stability (BUG-1)', () => {
	test('staff tenants list: refocus does not stampede auth/list requests or blank the table', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await page.goto('/staff/tenants');
		await expect(page.getByTestId('staff-tenants-table-rows')).toBeVisible();
		await page.waitForTimeout(500);

		const requestsAfterRefocus: string[] = [];
		page.on('request', (req) => {
			requestsAfterRefocus.push(req.url());
		});

		await dispatchRefocus(page);
		await page.waitForTimeout(1000);

		expect(
			requestsAfterRefocus.some((url) => url.includes('/auth/user-auth-data')),
		).toBe(false);
		expect(
			requestsAfterRefocus.some((url) => url.includes('/auth/redirect-code')),
		).toBe(false);
		expect(
			requestsAfterRefocus.some((url) => url.includes('/staff/tenants')),
		).toBe(false);

		// The table content must never have been swapped for a loading/error
		// state — it was visible before refocus and must still be visible now.
		await expect(page.getByTestId('staff-tenants-table-rows')).toBeVisible();
		await expect(page.getByText('500 — Server Error')).toHaveCount(0);
	});

	test('staff tenant users: refocus does not stampede auth requests or blank the table', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await page.goto('/staff/tenants');
		await expect(page.getByTestId('staff-tenants-table-rows')).toBeVisible();
		// Target the seeded Acme tenant (it always has users) instead of the
		// first row: real create-flow specs running earlier in the suite add
		// fresh user-less tenants that can occupy row 1, whose users tab then
		// renders the empty state and never shows the rows container.
		await page
			.getByTestId('staff-tenants-table-search')
			.fill('Acme Corporation');
		const acmeLink = page
			.getByRole('link', { name: 'Acme Corporation' })
			.first();
		await expect(acmeLink).toBeVisible();
		await acmeLink.click();
		await page.waitForURL(/\/staff\/tenants\/[0-9a-f-]{36}$/);
		const tenantPathname = new URL(page.url()).pathname;
		await page.goto(`${tenantPathname}/users`);
		await expect(page.getByTestId('staff-tenant-users-table-rows')).toBeVisible(
			{ timeout: 15_000 },
		);
		await page.waitForTimeout(500);

		const requestsAfterRefocus: string[] = [];
		page.on('request', (req) => {
			requestsAfterRefocus.push(req.url());
		});

		await dispatchRefocus(page);
		await page.waitForTimeout(1000);

		expect(
			requestsAfterRefocus.some((url) => url.includes('/auth/user-auth-data')),
		).toBe(false);
		expect(
			requestsAfterRefocus.some((url) => url.includes('/auth/redirect-code')),
		).toBe(false);

		await expect(
			page.getByTestId('staff-tenant-users-table-rows'),
		).toBeVisible();
		await expect(page.getByText('500 — Server Error')).toHaveCount(0);
	});

	test('a transient redirect-code failure no longer blanks a settled route (regression for the retry:false single point of failure)', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await page.goto('/staff/tenants');
		await expect(page.getByTestId('staff-tenants-table-rows')).toBeVisible();
		await page.waitForTimeout(500);

		// Any call caught here is a post-mount refetch attempt (the initial
		// mount fetch already resolved before this route is armed) — with
		// refetchOnWindowFocus: false + staleTime: Infinity, refocus must not
		// trigger one at all.
		let redirectCodeRefetchCount = 0;
		await page.route('**/auth/redirect-code', async (route) => {
			redirectCodeRefetchCount += 1;
			await route.fulfill({ status: 500, body: '{}' });
		});

		await dispatchRefocus(page);
		await page.waitForTimeout(1000);

		expect(redirectCodeRefetchCount).toBe(0);
		await expect(page.getByTestId('staff-tenants-table-rows')).toBeVisible();
		await expect(page.getByText('500 — Server Error')).toHaveCount(0);
	});
});
