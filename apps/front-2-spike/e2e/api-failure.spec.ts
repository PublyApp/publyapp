import { expect, test, type Page, type Route } from '@playwright/test';

import { getInviteStaffUserButton, loginAsStaffAdmin } from './helpers/login';

const API_BASE_URL = 'https://api.front-2.localhost:8443';
const API_ROUTE_GLOB = `${API_BASE_URL}/**`;
const API_ORIGIN = 'https://front-2.localhost:8443';
const AUTHED_STAFF_USERS_PATH = '/staff/users';
const SESSION_TOKEN_COOKIE_KEY = 'publyapp-session_token';
const TOXIPROXY_API_URL = 'http://127.0.0.1:8474';
const TOXIPROXY_PROXY_NAME = 'api';

const CORS_PNA_HEADERS = {
	'access-control-allow-origin': API_ORIGIN,
	'access-control-allow-credentials': 'true',
	'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
	'access-control-allow-headers':
		'content-type,x-session-token,x-publyapp-tenantid',
	'access-control-allow-private-network': 'true',
};

type ProblemBody = {
	type: string;
	title: string;
	status: number;
	detail: string;
	translationKey: string;
};

type SyntheticResponse = {
	status: number;
	contentType: string;
	body: string;
};

test.describe.configure({ mode: 'serial' });
test.setTimeout(90_000);

const errorViewButton = (page: Page) =>
	page.getByRole('button', { name: /try again/i });

const authedShellButton = (page: Page) =>
	page.getByRole('button', { name: /^Toggle theme$/ });

const loginButton = (page: Page) =>
	page.getByRole('button', { name: /^Sign in$/ });

const isStaffUsersRequest = (url: string): boolean =>
	url.startsWith(`${API_BASE_URL}${AUTHED_STAFF_USERS_PATH}`);

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
		await fetch(
			`${TOXIPROXY_API_URL}/proxies/${TOXIPROXY_PROXY_NAME}/toxics/${toxic.name}`,
			{ method: 'DELETE' },
		);
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

const expectSessionCookieCleared = async (page: Page) => {
	const cookieValue = await getSessionCookieValue(page);
	expect(cookieValue, 'session cookie after 401 logout').toBe('');
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
	await expect(errorViewButton(page), `${q} error view`).toBeVisible({
		timeout: 45_000,
	});
};

const expectPageDidNotCrash = async (page: Page, pageErrors: string[]) => {
	expect(pageErrors, 'browser pageerror events').toEqual([]);
	await expect(page.locator('body'), 'document body is visible').toBeVisible();
	await expect(
		errorViewButton(page),
		'intended route error view',
	).toBeVisible();

	const isResponsive = await page.evaluate(() => document.readyState);
	expect(isResponsive, 'page remains script-responsive').toMatch(
		/^(interactive|complete)$/,
	);
};

const expectStillAuthenticated = async (
	page: Page,
	pageErrors: string[],
	restoreFault: () => Promise<void>,
	recoveryKey: string,
) => {
	await expectPageDidNotCrash(page, pageErrors);
	await expect(page, 'non-401 failure did not redirect to login').not.toHaveURL(
		/login/,
	);
	await expect(authedShellButton(page), 'authed shell chrome').toBeVisible();
	await expectSessionCookiePresent(
		page,
		'session cookie after non-401 failure',
	);

	await restoreFault();
	await page.goto(`/staff/staff-users?q=${encodeURIComponent(recoveryKey)}`);
	await expect(
		getInviteStaffUserButton(page),
		'authed page recovered',
	).toBeVisible({ timeout: 20_000 });
};

const installPageErrorCapture = (page: Page): string[] => {
	const pageErrors: string[] = [];

	page.on('pageerror', (error) => {
		pageErrors.push(`${error.name}: ${error.message}`);
	});

	return pageErrors;
};

const createProblemBody = (status: number, title: string): ProblemBody => ({
	type: 'about:blank',
	title,
	status,
	detail: title,
	translationKey: `e2e-${status}`,
});

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
	await page.route(API_ROUTE_GLOB, async (route) => {
		await fulfillSyntheticStaffUsersResponse(route, response);
	});
};

test.afterEach(async ({ page }) => {
	await page.unroute(API_ROUTE_GLOB);
	await restoreToxiproxy();
});

test('connection-refused maps to error view without crashing or logging out', async ({
	page,
}) => {
	const pageErrors = installPageErrorCapture(page);

	await loginAsStaffAdmin(page);
	await disableToxiproxy();
	await navigateToFaultedStaffUsers(page, 'connection-refused');
	await expectStillAuthenticated(
		page,
		pageErrors,
		restoreToxiproxy,
		'connection-refused-recovered',
	);
});

test('reset peer maps to error view without crashing or logging out', async ({
	page,
}) => {
	const pageErrors = installPageErrorCapture(page);

	await loginAsStaffAdmin(page);
	await addToxic('api-reset-peer', 'reset_peer');
	await navigateToFaultedStaffUsers(page, 'reset-peer');
	await expectStillAuthenticated(
		page,
		pageErrors,
		restoreToxiproxy,
		'reset-peer-recovered',
	);
});

test('timeout maps to error view without crashing or logging out', async ({
	page,
}) => {
	const pageErrors = installPageErrorCapture(page);

	await loginAsStaffAdmin(page);
	await addToxic('api-timeout', 'timeout', { timeout: 1_000 });
	await navigateToFaultedStaffUsers(page, 'timeout');
	await expectStillAuthenticated(
		page,
		pageErrors,
		restoreToxiproxy,
		'timeout-recovered',
	);
});

test('HTTP 500 maps to error view without crashing or logging out', async ({
	page,
}) => {
	const pageErrors = installPageErrorCapture(page);

	await loginAsStaffAdmin(page);
	await installSyntheticStaffUsersResponse(page, {
		status: 500,
		contentType: 'application/problem+json',
		body: JSON.stringify(createProblemBody(500, 'Synthetic server error')),
	});
	await navigateToFaultedStaffUsers(page, 'http-500');
	await expectStillAuthenticated(
		page,
		pageErrors,
		async () => {
			await page.unroute(API_ROUTE_GLOB);
		},
		'http-500-recovered',
	);
});

test('invalid JSON maps to error view without crashing or logging out', async ({
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
			await page.unroute(API_ROUTE_GLOB);
		},
		'invalid-json-recovered',
	);
});

test('HTTP 401 triggers centralized logout', async ({ page }) => {
	await loginAsStaffAdmin(page);
	await expectSessionCookiePresent(page, 'session cookie before 401');
	await installSyntheticStaffUsersResponse(page, {
		status: 401,
		contentType: 'application/problem+json',
		body: JSON.stringify(createProblemBody(401, 'Synthetic invalid session')),
	});

	await page.goto('/staff/staff-users?q=http-401');
	await expect(loginButton(page), 'login form after 401').toBeVisible({
		timeout: 20_000,
	});
	await expect(page, '401 redirected to login').toHaveURL(/\/login/);
	await expectSessionCookieCleared(page);
});
