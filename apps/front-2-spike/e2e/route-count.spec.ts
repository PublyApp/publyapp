import { expect, test, type Page } from '@playwright/test';

import { loginAsStaffAdmin } from './helpers/login';

// R4-A1 verdict: route-total attribution is sufficient for SSR-vs-browser
// attribution on these CSR authed routes. The staff-users data path is
// browser-only (`/_authed-layout` has `ssr:false`), so `/staff/users` totals are
// not ambiguous between SSR and browser origins for this spike. Counts still
// must be method-aware: cross-origin browser data calls can emit an `OPTIONS`
// CORS preflight before the real `GET`, and route-count assertions care about
// the `GET` data call.
const API_BASE_URL = 'https://api.front-2.localhost:8443';
const AUTHED_STAFF_USERS_PATH = '/staff/users';
const COUNTER_BASE_URL = 'http://127.0.0.1:8800';
const INITIAL_STAFF_USERS_COUNT = 1;
const REVISIT_REFETCH_DELTA = 0;
const SEARCH_FETCH_DELTA = 1;
const MAX_PREFLIGHT_COUNT = 1;

type CounterResponse = {
	count: number;
};

test.describe.configure({ mode: 'serial' });

const searchInput = (page: Page) =>
	page.getByRole('textbox', { name: /^Search staff users$/ });

const searchButton = (page: Page) =>
	page.getByRole('button', { name: /^Search$/ });

const isStaffUsersResponse = (url: string): boolean => {
	const parsed = new URL(url);
	return (
		parsed.origin === API_BASE_URL &&
		parsed.pathname === AUTHED_STAFF_USERS_PATH
	);
};

const waitForStaffUsersGetResponse = async (page: Page) => {
	await page.waitForResponse(
		(response) =>
			isStaffUsersResponse(response.url()) &&
			response.request().method() === 'GET' &&
			response.status() === 200,
	);
};

const observesStaffUsersGetResponse = async (
	page: Page,
	timeout: number,
): Promise<boolean> =>
	page
		.waitForResponse(
			(response) =>
				isStaffUsersResponse(response.url()) &&
				response.request().method() === 'GET' &&
				response.status() === 200,
			{ timeout },
		)
		.then(
			() => true,
			() => false,
		);

const resetCounter = async () => {
	const response = await fetch(`${COUNTER_BASE_URL}/__counter/reset`, {
		method: 'POST',
	});

	expect(response.ok, 'request-counter reset response').toBe(true);
};

const readRouteCount = async (
	path: string,
	method?: 'GET' | 'OPTIONS',
): Promise<number> => {
	const params = new URLSearchParams({ path });
	if (method) {
		params.set('method', method);
	}

	const response = await fetch(`${COUNTER_BASE_URL}/__counter?${params}`);

	expect(
		response.ok,
		`request-counter read for ${method ? `${method} ` : ''}${path}`,
	).toBe(true);

	const body = (await response.json()) as CounterResponse;
	return body.count;
};

const loginAndWaitForStaffUsers = async (page: Page) => {
	const staffUsersResponse = waitForStaffUsersGetResponse(page);

	await loginAsStaffAdmin(page);
	await staffUsersResponse;
	await expect(
		page.getByRole('row', { name: /staff-admin@example\.com/ }),
	).toBeVisible();
	await expect(searchInput(page)).toBeVisible();
};

test('counts one staff-users GET on a clean authed reload', async ({
	page,
}) => {
	await loginAndWaitForStaffUsers(page);
	await resetCounter();

	const staffUsersResponse = waitForStaffUsersGetResponse(page);
	await page.reload({ waitUntil: 'domcontentloaded' });
	await staffUsersResponse;
	await expect(
		page.getByRole('row', { name: /staff-admin@example\.com/ }),
	).toBeVisible();

	const getCount = await readRouteCount(AUTHED_STAFF_USERS_PATH, 'GET');
	const optionsCount = await readRouteCount(AUTHED_STAFF_USERS_PATH, 'OPTIONS');
	const routeTotal = await readRouteCount(AUTHED_STAFF_USERS_PATH);

	console.log(
		`[route-count] clean-load GET=${getCount} OPTIONS=${optionsCount} total=${routeTotal}`,
	);

	// Source discovery: staff-users has one browser `useSuspenseQuery` list query
	// to `/staff/users`; there is no separate count endpoint and no SSR prime path.
	// The route-total can be 2 by design when the browser emits a CORS preflight:
	// `OPTIONS /staff/users` + `GET /staff/users`. R4-A1 therefore asserts the
	// method-specific GET count for app data-call behavior.
	expect(getCount).toBe(INITIAL_STAFF_USERS_COUNT);
	expect(optionsCount).toBeLessThanOrEqual(MAX_PREFLIGHT_COUNT);
	expect(routeTotal).toBe(getCount + optionsCount);
});

test('does not refetch staff-users GET on revisit from cache', async ({
	page,
}) => {
	await loginAndWaitForStaffUsers(page);
	await resetCounter();

	const initialResponse = waitForStaffUsersGetResponse(page);
	await page.reload({ waitUntil: 'domcontentloaded' });
	await initialResponse;
	await expect(
		page.getByRole('row', { name: /staff-admin@example\.com/ }),
	).toBeVisible();

	const initialGetCount = await readRouteCount(AUTHED_STAFF_USERS_PATH, 'GET');
	const initialOptionsCount = await readRouteCount(
		AUTHED_STAFF_USERS_PATH,
		'OPTIONS',
	);

	await page.getByRole('link', { name: /^Home$/ }).click();
	await expect(page.getByText(/^Welcome Home!!!$/)).toBeVisible();

	const unexpectedGetResponse = observesStaffUsersGetResponse(page, 1_500);
	await page.getByRole('link', { name: /^Staff Users$/ }).click();
	await expect(
		page.getByRole('row', { name: /staff-admin@example\.com/ }),
	).toBeVisible();
	const sawRevisitGet = await unexpectedGetResponse;

	const remountGetCount = await readRouteCount(AUTHED_STAFF_USERS_PATH, 'GET');
	const remountOptionsCount = await readRouteCount(
		AUTHED_STAFF_USERS_PATH,
		'OPTIONS',
	);

	console.log(
		`[route-count] remount GET=${initialGetCount}->${remountGetCount} OPTIONS=${initialOptionsCount}->${remountOptionsCount}`,
	);

	// The deployed route revisit reuses the cached list state and does not issue a
	// second `GET /staff/users` during the observed route transition window.
	expect(initialGetCount).toBe(INITIAL_STAFF_USERS_COUNT);
	expect(sawRevisitGet).toBe(false);
	expect(remountGetCount).toBe(initialGetCount + REVISIT_REFETCH_DELTA);
	expect(remountOptionsCount - initialOptionsCount).toBeLessThanOrEqual(
		MAX_PREFLIGHT_COUNT,
	);
});

test('counts exactly one additional staff-users request for search', async ({
	page,
}) => {
	await loginAndWaitForStaffUsers(page);
	await resetCounter();

	const initialGetCount = await readRouteCount(AUTHED_STAFF_USERS_PATH, 'GET');

	const searchResponse = waitForStaffUsersGetResponse(page);
	await searchInput(page).fill('NO_MATCH');
	await searchButton(page).click();
	await searchResponse;
	await expect(page.getByText(/^no results$/)).toBeVisible();

	const searchGetCount = await readRouteCount(AUTHED_STAFF_USERS_PATH, 'GET');
	const searchOptionsCount = await readRouteCount(
		AUTHED_STAFF_USERS_PATH,
		'OPTIONS',
	);

	console.log(
		`[route-count] search GET=${initialGetCount}->${searchGetCount} OPTIONS=${searchOptionsCount}`,
	);

	// Current search is explicit button-submit, not debounced. The method-aware
	// counter strips query strings, so the new `?q=NO_MATCH` request increments
	// `GET /staff/users` once under the same route bucket.
	expect(initialGetCount).toBe(0);
	expect(searchGetCount).toBe(initialGetCount + SEARCH_FETCH_DELTA);
	expect(searchOptionsCount).toBeLessThanOrEqual(MAX_PREFLIGHT_COUNT);
});
