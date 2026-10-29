import { randomUUID } from 'node:crypto';

import { expect, test, type Page } from '@playwright/test';

import { API_BASE_URL } from './helpers/api';
import { COUNTER_URL } from './helpers/compose-env';
import { loginAsStaffAdmin } from './helpers/login';

const COUNTER_BASE_URL = COUNTER_URL;
const MAX_PREFLIGHT_COUNT = 1;
const STAFF_INVITATIONS_PATH = '/staff/invitations';
/** Kept in sync with deploy/request-counter/control-routes.mjs. */
const COUNTER_MARKER_QUERY_KEY = '__e2e_counter';

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

type CounterReadParams = {
	path: string;
	method?: 'GET' | 'OPTIONS';
	__e2e_counter?: string;
};

/** Query parameters for a counter read: the marker is added only when this
 * test has one, so an unmarked read still means "the whole stack". */
const readCounterParams = (input: {
	path: string;
	marker: string | null;
	method?: 'GET' | 'OPTIONS';
}): CounterReadParams => {
	const query: CounterReadParams = { path: input.path };
	if (input.method !== undefined) {
		query.method = input.method;
	}
	if (input.marker !== null) {
		query[COUNTER_MARKER_QUERY_KEY] = input.marker;
	}
	return query;
};

/**
 * Reads a count. `marker` selects this test's own bucket; `null` reads the
 * whole stack for that path (the sidecar sums every bucket when no marker is
 * given), which is what the preflight budget needs — see the OPTIONS note on
 * the first test.
 */
const getCounter = async (
	page: Page,
	path: string,
	marker: string | null,
	method?: 'GET' | 'OPTIONS',
): Promise<number> => {
	const response = await page.request.get(`${COUNTER_BASE_URL}/__counter`, {
		params: readCounterParams({ path, marker, method }),
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
 * Moved out of staff-invitations.spec.ts into its own playwright project (see
 * playwright.config.ts, project `chromium-hermetic-counter`). The
 * request-counter sidecar (deploy/request-counter/server.mjs) counts traffic
 * from EVERY worker and browser on the stack, so asserting an exact count used
 * to require the whole stack to be quiet — which was achieved by making this
 * project DEPEND on `chromium`/`chromium-faults` completing first. That had
 * two costs (#2260 FIX-FLAKY):
 *
 * 1. the guard vanished exactly when a run was red — Playwright skips a
 *    project whose dependency failed, so the doubled-request guard was absent
 *    from the runs most likely to introduce a doubled request (the audit's F6);
 * 2. correctness rested on project ORDERING, i.e. on the absence of a race
 *    rather than on an isolation mechanism.
 *
 * The sidecar now keeps a marker-scoped bucket: every request this spec drives
 * carries `?__e2e_counter=<unique marker>` (appended by a route handler, see
 * `markInvocations`), and `/__counter?...&__e2e_counter=<marker>` returns only
 * this spec's traffic. That is hermetic by construction — no ordering
 * requirement, no dependency to be skipped, and a concurrent client on the
 * same path (e.g. staff-invitations.spec.ts) can no longer red the build with
 * no product defect (review-r1-tests.md F11).
 *
 * The marker rides in the query string rather than a header because the API's
 * CORS allowlist (`Lib/ServiceRegistration.cs`) accepts exactly
 * Content-Type/Accept/X-Session-Token/X-PublyApp-TenantId: a custom header
 * would turn every call into a blocked preflight and kill the login flow, and
 * widening a production CORS allowlist for a test is not acceptable.
 */
/**
 * Appends this test's marker to every API request the app makes for the path
 * under measurement, so the sidecar can attribute the traffic to this test
 * alone. Only the measured path is rewritten: the login bootstrap and every
 * other call stay untouched, so nothing else about the app changes.
 */
const markInvocations = async (page: Page, marker: string): Promise<void> => {
	await page.route(
		(url) =>
			url.origin === API_BASE_URL && url.pathname === STAFF_INVITATIONS_PATH,
		async (route) => {
			const marked = new URL(route.request().url());
			marked.searchParams.set(COUNTER_MARKER_QUERY_KEY, marker);
			await route.continue({ url: marked.toString() });
		},
	);
};

/** A marker unique to one test invocation, so two runs (or two clients on the
 * same stack) can never read each other's counts. */
const newCounterMarker = (): string => `rc-${randomUUID()}`;

test.describe(
	'staff invitations request counter (hermetic project)',
	{ tag: ['@security', '@806'] },
	() => {
		test('clean load issues exactly one GET /staff/invitations request', async ({
			page,
		}) => {
			const marker = newCounterMarker();
			await markInvocations(page, marker);
			await loginAsStaffAdmin(page);
			await resetCounter(page);

			const response = waitForStaffInvitationsGetResponse(page);
			await page.goto('/staff/invitations');
			await response;

			const getCount = await getCounter(
				page,
				STAFF_INVITATIONS_PATH,
				marker,
				'GET',
			);
			// Preflights are the one thing that CANNOT be attributed to this
			// test: the browser issues its CORS preflight for the URL the app
			// actually requested, before Playwright's route handler rewrites it,
			// so the marker never reaches the OPTIONS request. It is therefore
			// read stack-wide. That stays sound because every CI shard owns its
			// own stack, the counter is reset immediately before the action, and
			// the assertion is the same upper bound it has always been.
			const optionsCount = await getCounter(
				page,
				STAFF_INVITATIONS_PATH,
				null,
				'OPTIONS',
			);
			const routeTotal = await getCounter(page, STAFF_INVITATIONS_PATH, null);

			expect(getCount).toBe(1);
			expect(optionsCount).toBeLessThanOrEqual(MAX_PREFLIGHT_COUNT);
			// The whole-stack total still covers every method bucket — a cheap
			// check that the counter's own keying did not drift.
			expect(routeTotal).toBeGreaterThanOrEqual(optionsCount);
		});

		test('revisit reuses the fresh staff invitations query without another GET', async ({
			page,
		}) => {
			const marker = newCounterMarker();
			await markInvocations(page, marker);
			await loginAsStaffAdmin(page);
			await resetCounter(page);

			const initialResponse = waitForStaffInvitationsGetResponse(page);
			await page.goto('/staff/invitations');
			await initialResponse;
			await expect(page.getByTestId('staff-invitations-table')).toBeVisible();

			const initialGetCount = await getCounter(
				page,
				STAFF_INVITATIONS_PATH,
				marker,
				'GET',
			);
			const initialOptionsCount = await getCounter(
				page,
				STAFF_INVITATIONS_PATH,
				null,
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
			expect(
				await getCounter(page, STAFF_INVITATIONS_PATH, marker, 'GET'),
			).toBe(initialGetCount);
			expect(
				(await getCounter(page, STAFF_INVITATIONS_PATH, null, 'OPTIONS')) -
					initialOptionsCount,
			).toBeLessThanOrEqual(MAX_PREFLIGHT_COUNT);
		});

		test('status filtering issues exactly one additional staff invitations GET', async ({
			page,
		}) => {
			const marker = newCounterMarker();
			await markInvocations(page, marker);
			await loginAsStaffAdmin(page);
			await resetCounter(page);

			const initialResponse = waitForStaffInvitationsGetResponse(page);
			await page.goto('/staff/invitations');
			await initialResponse;
			await expect(page.getByTestId('staff-invitations-table')).toBeVisible();

			const initialGetCount = await getCounter(
				page,
				STAFF_INVITATIONS_PATH,
				marker,
				'GET',
			);
			const initialOptionsCount = await getCounter(
				page,
				STAFF_INVITATIONS_PATH,
				null,
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
				marker,
				'GET',
			);
			const optionsCount = await getCounter(
				page,
				STAFF_INVITATIONS_PATH,
				null,
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
