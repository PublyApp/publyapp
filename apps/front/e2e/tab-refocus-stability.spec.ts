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

test.describe(
	'tab-refocus stability (BUG-1)',
	{ tag: ['@auth', '@806'] },
	() => {
		test("positive control: a genuinely stale query DOES refetch on refocus, proving the synthetic dispatch reaches TanStack Query's focus manager", async ({
			page,
		}) => {
			// Every negative assertion in this file ("no refetch after refocus")
			// is only meaningful if dispatchRefocus actually reaches TanStack
			// Query's focus listener — otherwise a wrong event target/shape would
			// make all three tests pass vacuously forever (see F8). The staff
			// tenants list query uses the router's default staleTime (30s) and
			// the react-query default refetchOnWindowFocus: true (neither is
			// overridden for it, unlike the auth queries), so once it's actually
			// stale a refocus MUST trigger exactly one refetch — a real, falsifiable
			// control. page.clock lets us cross that 30s staleTime boundary without
			// slowing the suite down with a real wait.
			await page.clock.install();
			await loginAsStaffAdmin(page);

			const initialTenantsResponse = page.waitForResponse(
				(response) =>
					response.url().includes('/staff/tenants') &&
					response.request().method() === 'GET',
			);
			await page.goto('/staff/tenants');
			await expect(page.getByTestId('staff-tenants-table-rows')).toBeVisible();
			await initialTenantsResponse;

			// Cross the 30s staleTime boundary (router.tsx DEFAULT_QUERY_STALE_TIME_MS).
			await page.clock.fastForward('00:00:31');

			const staleRefetch = page.waitForRequest(
				(request) =>
					request.url().includes('/staff/tenants') &&
					request.method() === 'GET',
				{ timeout: 5_000 },
			);
			await dispatchRefocus(page);
			// If the synthetic visibilitychange/focus events never reached the
			// library's listener, this would time out and fail the test — unlike
			// every `toBe(false)` assertion elsewhere in this file, which passes
			// whether or not the dispatch worked.
			await staleRefetch;

			await expect(page.getByTestId('staff-tenants-table-rows')).toBeVisible();
		});

		// #1154 (option a): the two list-query checks below are NOT "never
		// refetch" invariants — the router default (refetchOnWindowFocus: true,
		// staleTime 30s, router.tsx DEFAULT_QUERY_STALE_TIME_MS) means a refocus
		// inside the stale window must trigger no request and a refocus after it
		// must trigger exactly one. Each check therefore asserts both sides of
		// that freshness window at the network seam (page.clock crosses the
		// boundary without a real wait; the positive control above proves the
		// synthetic dispatch actually reaches TanStack Query's focus manager).
		test('staff tenants list: refocus inside the freshness window triggers no request and does not blank the table', async ({
			page,
		}) => {
			await page.clock.install();
			await loginAsStaffAdmin(page);
			await page.goto('/staff/tenants');
			await expect(page.getByTestId('staff-tenants-table-rows')).toBeVisible();
			// Stay INSIDE the 30s staleTime: the data is still fresh.
			await page.clock.fastForward('00:00:05');
			await page.waitForTimeout(500);

			const requestsAfterRefocus: string[] = [];
			page.on('request', (req) => {
				requestsAfterRefocus.push(req.url());
			});

			await dispatchRefocus(page);
			await page.waitForTimeout(1000);
			// Best-effort: extend the observation window past the fixed 1s so a
			// late refetch landing just after it is still caught by the request
			// listener below (review-r2-tests.md F12). Swallow a timeout here —
			// background polling that never truly idles must not fail the test.
			await page.waitForLoadState('networkidle').catch(() => undefined);

			expect(
				requestsAfterRefocus.some((url) =>
					url.includes('/auth/user-auth-data'),
				),
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

		test('staff tenants list: refocus after the freshness window triggers exactly one list request', async ({
			page,
		}) => {
			await page.clock.install();
			await loginAsStaffAdmin(page);

			const initialTenantsResponse = page.waitForResponse(
				(response) =>
					response.url().includes('/staff/tenants') &&
					response.request().method() === 'GET',
			);
			await page.goto('/staff/tenants');
			await expect(page.getByTestId('staff-tenants-table-rows')).toBeVisible();
			await initialTenantsResponse;

			// Cross the 30s staleTime boundary so the mounted query is genuinely
			// stale when the tab is refocused.
			await page.clock.fastForward('00:00:31');

			let tenantListRefetches = 0;
			page.on('request', (req) => {
				if (req.url().includes('/staff/tenants') && req.method() === 'GET') {
					tenantListRefetches += 1;
				}
			});

			const staleRefetch = page.waitForRequest(
				(request) =>
					request.url().includes('/staff/tenants') &&
					request.method() === 'GET',
				{ timeout: 5_000 },
			);
			await dispatchRefocus(page);
			// Guarantees the focus-driven revalidation has actually gone out
			// before the count below is read.
			await staleRefetch;

			await page.waitForTimeout(1000);
			await page.waitForLoadState('networkidle').catch(() => undefined);

			// Exactly one — not a stampede of focus-driven revalidations.
			expect(tenantListRefetches).toBe(1);

			await expect(page.getByTestId('staff-tenants-table-rows')).toBeVisible();
			await expect(page.getByText('500 — Server Error')).toHaveCount(0);
		});

		test('staff tenant users: refocus inside the freshness window triggers no auth request and does not blank the table', async ({
			page,
		}) => {
			await page.clock.install();
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
			await expect(
				page.getByTestId('staff-tenant-users-table-rows'),
			).toBeVisible({ timeout: 15_000 });
			// Stay INSIDE the 30s staleTime: the data is still fresh.
			await page.clock.fastForward('00:00:05');
			await page.waitForTimeout(500);

			const requestsAfterRefocus: string[] = [];
			page.on('request', (req) => {
				requestsAfterRefocus.push(req.url());
			});

			await dispatchRefocus(page);
			await page.waitForTimeout(1000);
			// Best-effort: extend the observation window past the fixed 1s so a
			// late refetch landing just after it is still caught by the request
			// listener below (review-r2-tests.md F12). Swallow a timeout here —
			// background polling that never truly idles must not fail the test.
			await page.waitForLoadState('networkidle').catch(() => undefined);

			expect(
				requestsAfterRefocus.some((url) =>
					url.includes('/auth/user-auth-data'),
				),
			).toBe(false);
			expect(
				requestsAfterRefocus.some((url) => url.includes('/auth/redirect-code')),
			).toBe(false);
			expect(
				requestsAfterRefocus.some((url) =>
					/\/staff\/tenants\/[0-9a-f-]{36}\/users/.test(url),
				),
			).toBe(false);

			await expect(
				page.getByTestId('staff-tenant-users-table-rows'),
			).toBeVisible();
			await expect(page.getByText('500 — Server Error')).toHaveCount(0);
		});

		test('staff tenant users: refocus after the freshness window triggers exactly one list request', async ({
			page,
		}) => {
			await page.clock.install();
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
			await expect(
				page.getByTestId('staff-tenant-users-table-rows'),
			).toBeVisible({ timeout: 15_000 });

			// Cross the 30s staleTime boundary so the mounted query is genuinely
			// stale when the tab is refocused.
			await page.clock.fastForward('00:00:31');

			let userListRefetches = 0;
			page.on('request', (req) => {
				if (
					req.method() === 'GET' &&
					/\/staff\/tenants\/[0-9a-f-]{36}\/users/.test(req.url())
				) {
					userListRefetches += 1;
				}
			});

			await dispatchRefocus(page);
			await page.waitForTimeout(1000);
			await page.waitForLoadState('networkidle').catch(() => undefined);

			// Exactly one — not a stampede of focus-driven revalidations.
			expect(userListRefetches).toBe(1);

			await expect(
				page.getByTestId('staff-tenant-users-table-rows'),
			).toBeVisible();
			await expect(page.getByText('500 — Server Error')).toHaveCount(0);
		});

		test('refocus issues no redirect-code refetch, even when a refetch would fail (the surface-redirect-code query is refetchOnWindowFocus: false + staleTime: Infinity + retry: false)', async ({
			page,
		}) => {
			// NOTE: this does not exercise "a transient 500 no longer blanks a
			// settled route" — the route below is armed AFTER the initial mount
			// fetch already resolved, and refetchOnWindowFocus: false means
			// refocus never re-triggers this query at all, so the 500 handler is
			// never actually invoked (see review-r1-tests.md F9). What this DOES
			// prove, honestly: the redirect-code query stays silent on refocus,
			// same invariant as the other two tests in this file, just for a
			// different query. The "500 recovers via Retry" invariant is instead
			// covered by design-handoff-foundation.spec.ts's dedicated 500-boundary
			// test, which arms the failure BEFORE the fetch that consumes it.
			await loginAsStaffAdmin(page);
			await page.goto('/staff/tenants');
			await expect(page.getByTestId('staff-tenants-table-rows')).toBeVisible();
			await page.waitForTimeout(500);

			let redirectCodeRefetchCount = 0;
			await page.route('**/auth/redirect-code', async (route) => {
				redirectCodeRefetchCount += 1;
				await route.fulfill({ status: 500, body: '{}' });
			});

			await dispatchRefocus(page);
			await page.waitForTimeout(1000);
			// Best-effort: extend the observation window past the fixed 1s so a
			// late refetch landing just after it is still caught by the request
			// listener below (review-r2-tests.md F12). Swallow a timeout here —
			// background polling that never truly idles must not fail the test.
			await page.waitForLoadState('networkidle').catch(() => undefined);

			expect(redirectCodeRefetchCount).toBe(0);
			await expect(page.getByTestId('staff-tenants-table-rows')).toBeVisible();
			await expect(page.getByText('500 — Server Error')).toHaveCount(0);
		});
	},
);
