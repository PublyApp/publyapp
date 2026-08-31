import { expect, test, type Page, type Route } from '@playwright/test';

import { SESSION_TOKEN_COOKIE_KEY } from '@org/shared-ts/lib/constants';
import { formatSessionCookie } from '@org/shared-ts/lib/session/parse';

import { API_BASE_URL } from './helpers/api';
import { FRONT_URL, TOXIPROXY_API_URL } from './helpers/compose-env';
import { loginAsStaffAdmin } from './helpers/login';

const FRONTEND_ORIGIN = FRONT_URL;
const STAFF_USERS_PATH = '/staff/users';
const TOXIPROXY_PROXY_NAME = 'api';
const TENANT_TOKEN_VALUE = formatSessionCookie({
	tenantToken: 'front2-demo-token',
});

const CORS_PNA_HEADERS = {
	'access-control-allow-origin': FRONTEND_ORIGIN,
	'access-control-allow-credentials': 'true',
	'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
	'access-control-allow-headers':
		'content-type,accept,x-session-token,x-publyapp-tenantid',
	'access-control-allow-private-network': 'true',
};

type SyntheticResponse = {
	status: number;
	contentType: string;
	body: string;
};

test.describe.configure({ mode: 'serial' });
test.setTimeout(90_000);

const setSessionCookie = async (page: Page) => {
	await page.goto('/');
	const url = new URL(page.url());
	await page.context().addCookies([
		{
			name: SESSION_TOKEN_COOKIE_KEY,
			value: TENANT_TOKEN_VALUE,
			domain: url.hostname,
			path: '/',
			secure: true,
			sameSite: 'Lax',
		},
	]);
};

/** Returns a hit counter alongside the route registration so the test can
 * prove the mocked handler actually fired, rather than trusting that the
 * resulting URL could only be reached via this specific route (three
 * independent paths can all land on the same `/login?rc=invalid_session`
 * URL — see review-r1-tests.md F15). Only counts GET requests: the API
 * origin (`api.front.localhost`) is cross-origin from the app
 * (`front.localhost`), and the client attaches a non-simple
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

const isStaffUsersRequest = (url: string): boolean => {
	const parsed = new URL(url);
	return parsed.origin === API_BASE_URL && parsed.pathname === STAFF_USERS_PATH;
};

const restoreToxiproxy = async () => {
	const response = await fetch(
		`${TOXIPROXY_API_URL}/proxies/${TOXIPROXY_PROXY_NAME}`,
	);

	if (!response.ok) {
		throw new Error('failed to read Toxiproxy api proxy');
	}

	const proxy = (await response.json()) as {
		enabled?: boolean;
		toxics?: Array<{ name: string }>;
	};

	for (const toxic of proxy.toxics ?? []) {
		const deleteResponse = await fetch(
			`${TOXIPROXY_API_URL}/proxies/${TOXIPROXY_PROXY_NAME}/toxics/${toxic.name}`,
			{ method: 'DELETE' },
		);

		if (!deleteResponse.ok) {
			throw new Error(`failed to remove Toxiproxy toxic ${toxic.name}`);
		}
	}

	if (proxy.enabled === false) {
		const enableResponse = await fetch(
			`${TOXIPROXY_API_URL}/proxies/${TOXIPROXY_PROXY_NAME}`,
			{
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ enabled: true }),
			},
		);

		if (!enableResponse.ok) {
			throw new Error('failed to enable Toxiproxy api proxy');
		}
	}
};

const disableToxiproxy = async () => {
	const response = await fetch(
		`${TOXIPROXY_API_URL}/proxies/${TOXIPROXY_PROXY_NAME}`,
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ enabled: false }),
		},
	);

	if (!response.ok) {
		throw new Error('failed to disable Toxiproxy api proxy');
	}
};

const addToxic = async (
	name: string,
	type: string,
	attributes: Record<string, unknown> = {},
) => {
	const response = await fetch(
		`${TOXIPROXY_API_URL}/proxies/${TOXIPROXY_PROXY_NAME}/toxics`,
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				name,
				type,
				stream: 'downstream',
				toxicity: 1,
				attributes,
			}),
		},
	);

	if (!response.ok) {
		throw new Error(`failed to add Toxiproxy toxic ${name}`);
	}
};

const getSessionCookieValue = async (page: Page): Promise<string> => {
	const cookies = await page.context().cookies();
	const cookie = cookies.find((item) => item.name === SESSION_TOKEN_COOKIE_KEY);

	return cookie?.value ?? '';
};

const expectSessionCookiePresent = async (page: Page, label: string) => {
	const cookieValue = await getSessionCookieValue(page);
	expect(cookieValue.length, label).toBeGreaterThan(0);
};

const waitForStaffUsersFaultSignal = async (
	page: Page,
	options: { includeOkResponse?: boolean } = {},
) => {
	const requestFailedPromise = page
		.waitForEvent('requestfailed', (request) =>
			isStaffUsersRequest(request.url()),
		)
		.then(() => 'requestfailed' as const);
	const nonOkResponsePromise = page
		.waitForResponse(
			(response) =>
				isStaffUsersRequest(response.url()) && response.status() !== 200,
		)
		.then((response) => `response-${response.status()}` as const);
	const okResponsePromise = options.includeOkResponse
		? page
				.waitForResponse(
					(response) =>
						isStaffUsersRequest(response.url()) && response.status() === 200,
				)
				.then(() => 'response-200' as const)
		: undefined;

	try {
		return await Promise.race(
			[requestFailedPromise, nonOkResponsePromise, okResponsePromise].filter(
				(item) => item !== undefined,
			),
		);
	} finally {
		requestFailedPromise.catch(() => {});
		nonOkResponsePromise.catch(() => {});
		okResponsePromise?.catch(() => {});
	}
};

const navigateToFaultedStaffUsers = async (
	page: Page,
	q: string,
	options: { includeOkResponse?: boolean } = {},
) => {
	const faultSignal = waitForStaffUsersFaultSignal(page, options);

	await page.goto(`/staff/staff-users?q=${encodeURIComponent(q)}`);
	await faultSignal;
	await expect(
		page.getByTestId('staff-users-table-error'),
		`${q} error view`,
	).toBeVisible({ timeout: 45_000 });
};

const searchFaultedStaffUsers = async (page: Page, q: string) => {
	// Keep the authenticated document mounted: a full page.goto() re-runs the
	// authed layout's /auth/redirect-code query first, so disabling the proxy
	// fails that request and prevents the staff-users list query from mounting.
	const faultSignal = waitForStaffUsersFaultSignal(page);

	await page.getByTestId('staff-users-table-search').fill(q);
	await faultSignal;
	await expect(
		page.getByTestId('staff-users-table-error'),
		`${q} error view`,
	).toBeVisible({ timeout: 45_000 });
};

const installPageErrorCapture = (page: Page): string[] => {
	const pageErrors: string[] = [];

	page.on('pageerror', (error) => {
		pageErrors.push(`${error.name}: ${error.message}`);
	});

	return pageErrors;
};

const expectStillAuthenticated = async (
	page: Page,
	pageErrors: string[],
	restoreFault: () => Promise<void>,
	recoveryKey: string,
) => {
	expect(pageErrors, 'browser pageerror events').toEqual([]);
	await expect(page.locator('body'), 'document body is visible').toBeVisible();
	await expect(
		page.getByTestId('staff-users-table-error'),
		'intended route error view',
	).toBeVisible();

	const isResponsive = await page.evaluate(() => document.readyState);
	expect(isResponsive, 'page remains script-responsive').toMatch(
		/^(interactive|complete)$/,
	);
	await expect(page, 'non-401 failure did not redirect to login').not.toHaveURL(
		/login/,
	);
	await expect(
		page.getByTestId('app-shell-shell'),
		'authed shell',
	).toBeVisible();
	await expectSessionCookiePresent(
		page,
		'session cookie after non-401 failure',
	);

	await restoreFault();
	await page.goto(`/staff/staff-users?q=${encodeURIComponent(recoveryKey)}`);
	await expect(
		page.getByTestId('staff-users-table'),
		'authed page recovered',
	).toBeVisible({
		timeout: 20_000,
	});
};

const fulfillSyntheticStaffUsersResponse = async (
	route: Route,
	response: SyntheticResponse,
) => {
	const request = route.request();

	if (!isStaffUsersRequest(request.url())) {
		await route.continue();
		return;
	}

	if (request.method() === 'OPTIONS') {
		await route.fulfill({
			status: 204,
			headers: CORS_PNA_HEADERS,
			body: '',
		});
		return;
	}

	await route.fulfill({
		status: response.status,
		headers: {
			...CORS_PNA_HEADERS,
			'content-type': response.contentType,
		},
		body: response.body,
	});
};

const installSyntheticStaffUsersResponse = async (
	page: Page,
	response: SyntheticResponse,
) => {
	await page.route(`${API_BASE_URL}/**`, async (route) => {
		await fulfillSyntheticStaffUsersResponse(route, response);
	});
};

test.afterEach(async ({ page }) => {
	await page.unroute(`${API_BASE_URL}/**`);
	await restoreToxiproxy();
});

test.describe(
	'auth error handling',
	{ tag: ['@auth', '@security', '@713'] },
	() => {
		test('connection-refused maps to a list error without crashing or logging out', async ({
			page,
		}) => {
			const pageErrors = installPageErrorCapture(page);

			await loginAsStaffAdmin(page);
			await disableToxiproxy();
			await searchFaultedStaffUsers(page, 'connection-refused');
			await expectStillAuthenticated(
				page,
				pageErrors,
				restoreToxiproxy,
				'connection-refused-recovered',
			);
		});

		test('reset peer maps to a list error without crashing or logging out', async ({
			page,
		}) => {
			const pageErrors = installPageErrorCapture(page);

			await loginAsStaffAdmin(page);
			await addToxic('api-reset-peer', 'reset_peer');
			await searchFaultedStaffUsers(page, 'reset-peer');
			await expectStillAuthenticated(
				page,
				pageErrors,
				restoreToxiproxy,
				'reset-peer-recovered',
			);
		});

		test('timeout maps to a list error without crashing or logging out', async ({
			page,
		}) => {
			const pageErrors = installPageErrorCapture(page);

			await loginAsStaffAdmin(page);
			await addToxic('api-timeout', 'timeout', { timeout: 1_000 });
			await searchFaultedStaffUsers(page, 'timeout');
			await expectStillAuthenticated(
				page,
				pageErrors,
				restoreToxiproxy,
				'timeout-recovered',
			);
		});

		/** The authed-surface counterpart to the `auth/redirect-code` 500 covered by
		 * `design-handoff-foundation.spec.ts` and the POST 500 covered by
		 * `staff-tenant-details.spec.ts`: neither of those proves that a `500`
		 * `application/problem+json` on an authed LIST GET renders the list error
		 * instead of tripping centralized logout. Only `401` may log a user out
		 * (AGENTS.md → "Frontend invariants"), so a `500` must leave the session
		 * cookie and the authed shell intact. */
		test('HTTP 500 problem+json maps to a list error without crashing or logging out', async ({
			page,
		}) => {
			const pageErrors = installPageErrorCapture(page);

			await loginAsStaffAdmin(page);
			await installSyntheticStaffUsersResponse(page, {
				status: 500,
				contentType: 'application/problem+json',
				body: JSON.stringify({
					type: 'about:blank',
					title: 'Synthetic server error',
					status: 500,
					detail: 'Synthetic server error',
					translationKey: 'e2e-500',
				}),
			});
			await navigateToFaultedStaffUsers(page, 'http-500');
			await expect(
				page
					.getByTestId('staff-users-table-error')
					.getByRole('button', { name: /retry/i }),
				'list error retry affordance',
			).toBeVisible();
			await expectStillAuthenticated(
				page,
				pageErrors,
				async () => {
					await page.unroute(`${API_BASE_URL}/**`);
				},
				'http-500-recovered',
			);
		});

		test('invalid JSON maps to a list error without crashing or logging out', async ({
			page,
		}) => {
			const pageErrors = installPageErrorCapture(page);

			await loginAsStaffAdmin(page);
			await installSyntheticStaffUsersResponse(page, {
				status: 200,
				contentType: 'application/json',
				body: 'not json {',
			});
			await navigateToFaultedStaffUsers(page, 'invalid-json', {
				includeOkResponse: true,
			});
			await expectStillAuthenticated(
				page,
				pageErrors,
				async () => {
					await page.unroute(`${API_BASE_URL}/**`);
				},
				'invalid-json-recovered',
			);
		});

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

		test('authed 403 renders forbidden view without logout', async ({
			page,
		}) => {
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
				(window as { __spaAlive?: boolean } & typeof window).__spaAlive = true;
			});
			await page
				.getByTestId('view-404')
				.getByRole('link', { name: /home/i })
				.click();

			const alive = await page.evaluate(
				() =>
					(window as { __spaAlive?: boolean } & typeof window).__spaAlive ===
					true,
			);
			expect(alive).toBe(true);
		});
	},
);
