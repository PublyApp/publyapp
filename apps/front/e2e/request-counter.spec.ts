import { expect, test, type Page } from '@playwright/test';

import { API_BASE_URL } from './helpers/api';
import { loginAsStaffAdmin } from './helpers/login';

const COUNTER_BASE_URL = 'http://127.0.0.1:8800';
const MAX_PREFLIGHT_COUNT = 1;
const STAFF_INVITATIONS_PATH = '/staff/invitations';

const isApiPath = (url: string, path: string): boolean => {
	const parsed = new URL(url);
	return parsed.origin === API_BASE_URL && parsed.pathname === path;
};

const waitForStaffInvitationsGetResponse = (page: Page) =>
	page.waitForResponse(
		(response) =>
			isApiPath(response.url(), STAFF_INVITATIONS_PATH) &&
			response.request().method() === 'GET' &&
			response.status() === 200,
	);

const resetCounter = async (page: Page) => {
	const response = await page.request.post(
		`${COUNTER_BASE_URL}/__counter/reset`,
	);
	expect(response.ok()).toBe(true);
};

const getCounter = async (
	page: Page,
	path: string,
	method?: 'GET' | 'OPTIONS',
): Promise<number> => {
	// Two concrete request shapes instead of an optional-property union:
	// Playwright's `params` carries an index signature that rejects
	// `method?: undefined` produced by a ternary over two literals.
	const response =
		method === undefined
			? await page.request.get(`${COUNTER_BASE_URL}/__counter`, {
					params: { path },
				})
			: await page.request.get(`${COUNTER_BASE_URL}/__counter`, {
					params: { path, method },
				});
	expect(response.ok()).toBe(true);

	const body = (await response.json()) as {
		count?: unknown;
	};
	if (typeof body.count === 'number') {
		return body.count;
	}
	return -1;
};

/**
 * Moved out of staff-invitations.spec.ts into its own file and its own
 * dependency-ordered playwright project (see playwright.config.ts, project
 * `chromium-hermetic-counter`). The request-counter sidecar
 * (deploy/request-counter/server.mjs) counts traffic from EVERY worker and
 * browser globally — it has no per-test/per-header bucketing — so running
 * this test concurrently with anything else that unmocked-GETs the same path
 * (e.g. parity-happy-path.spec.ts navigating to /staff/invitations) can red
 * the build with no product defect (review-r1-tests.md F11). The
 * `dependencies` ordering in playwright.config.ts guarantees every other
 * project has fully finished before this one starts, which is what actually
 * makes this test hermetic today.
 *
 * The X-E2E-Test-Marker header below is a forward-compatible hook, NOT the
 * current isolation mechanism: `deploy/request-counter` does not read it yet
 * (see PKT-H's report, Handoffs). Once the sidecar buckets counts by that
 * header (and accepts a matching `marker` query param on `/__counter`), this
 * test — and any future counter-based test — can drop the project-ordering
 * requirement and run fully in parallel instead.
 */
test.describe(
	'staff invitations request counter (hermetic project)',
	{ tag: ['@security', '@806'] },
	() => {
		test('clean load issues exactly one GET /staff/invitations request', async ({
			page,
		}) => {
			// Deliberately NO X-E2E-Test-Marker header (yet): the sidecar does not
			// read it, and the API's CORS policy does not allowlist it — a
			// non-simple custom header on every request turns each API call into a
			// blocked preflight and kills the login flow outright (captain-verified
			// against the live stack: allow-headers = Content-Type, Accept,
			// X-Session-Token, X-PublyApp-TenantId). When the sidecar buckets by
			// marker, add the header AND extend the API CORS allowlist together.
			await loginAsStaffAdmin(page);
			await resetCounter(page);

			const response = waitForStaffInvitationsGetResponse(page);
			await page.goto('/staff/invitations');
			await response;

			const getCount = await getCounter(page, STAFF_INVITATIONS_PATH, 'GET');
			const optionsCount = await getCounter(
				page,
				STAFF_INVITATIONS_PATH,
				'OPTIONS',
			);
			const routeTotal = await getCounter(page, STAFF_INVITATIONS_PATH);

			expect(getCount).toBe(1);
			expect(optionsCount).toBeLessThanOrEqual(MAX_PREFLIGHT_COUNT);
			expect(routeTotal).toBe(getCount + optionsCount);
		});

		test('revisit reuses the fresh staff invitations query without another GET', async ({
			page,
		}) => {
			await loginAsStaffAdmin(page);
			await resetCounter(page);

			const initialResponse = waitForStaffInvitationsGetResponse(page);
			await page.goto('/staff/invitations');
			await initialResponse;
			await expect(page.getByTestId('staff-invitations-table')).toBeVisible();

			const initialGetCount = await getCounter(
				page,
				STAFF_INVITATIONS_PATH,
				'GET',
			);
			const initialOptionsCount = await getCounter(
				page,
				STAFF_INVITATIONS_PATH,
				'OPTIONS',
			);

			await page.getByRole('link', { name: 'All users' }).click();
			await expect(page.getByTestId('staff-users-table')).toBeVisible();

			const unexpectedGetResponse = page
				.waitForResponse(
					(response) =>
						isApiPath(response.url(), STAFF_INVITATIONS_PATH) &&
						response.request().method() === 'GET',
					{ timeout: 1_500 },
				)
				.then(
					() => true,
					() => false,
				);
			await page.getByRole('link', { name: 'Invitations' }).click();
			await expect(page.getByTestId('staff-invitations-table')).toBeVisible();

			expect(await unexpectedGetResponse).toBe(false);
			expect(await getCounter(page, STAFF_INVITATIONS_PATH, 'GET')).toBe(
				initialGetCount,
			);
			expect(
				(await getCounter(page, STAFF_INVITATIONS_PATH, 'OPTIONS')) -
					initialOptionsCount,
			).toBeLessThanOrEqual(MAX_PREFLIGHT_COUNT);
		});

		test('status filtering issues exactly one additional staff invitations GET', async ({
			page,
		}) => {
			await loginAsStaffAdmin(page);
			await resetCounter(page);

			const initialResponse = waitForStaffInvitationsGetResponse(page);
			await page.goto('/staff/invitations');
			await initialResponse;
			await expect(page.getByTestId('staff-invitations-table')).toBeVisible();

			const initialGetCount = await getCounter(
				page,
				STAFF_INVITATIONS_PATH,
				'GET',
			);
			const initialOptionsCount = await getCounter(
				page,
				STAFF_INVITATIONS_PATH,
				'OPTIONS',
			);
			const filterResponse = waitForStaffInvitationsGetResponse(page);

			await page.getByRole('button', { name: 'All statuses' }).click();
			await page
				.getByRole('menuitemcheckbox', { name: 'Pending', exact: true })
				.click();
			await filterResponse;

			const filteredGetCount = await getCounter(
				page,
				STAFF_INVITATIONS_PATH,
				'GET',
			);
			const optionsCount = await getCounter(
				page,
				STAFF_INVITATIONS_PATH,
				'OPTIONS',
			);

			expect(filteredGetCount).toBe(initialGetCount + 1);
			// The preflight budget is per data call, not per test: the CORS preflight
			// cache is keyed by full request URL, so the filtered `?status=pending`
			// call is a distinct entry from the unfiltered one and legitimately emits
			// its own `OPTIONS`. Counting cumulatively against a bound of one would
			// fail on correct behaviour, so assert the delta the filter itself caused.
			expect(optionsCount - initialOptionsCount).toBeLessThanOrEqual(
				MAX_PREFLIGHT_COUNT,
			);
		});
	},
);
