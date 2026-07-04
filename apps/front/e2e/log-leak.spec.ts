import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import {
	expect,
	test,
	type Page,
	type Request,
	type Response,
	type Route,
	type TestInfo,
} from '@playwright/test';

import { SESSION_TOKEN_COOKIE_KEY } from '@org/shared-ts/lib/constants';

import {
	STAFF_USERS_PATH,
	getSessionCookie,
	getStaffUsersUrl,
	isStaffUsersRequest,
	openStaffUsersAsStaffAdmin,
	problemJson,
	waitForStaffUsersResponse,
} from './helpers/app';

const COMPOSE_FILE = 'apps/front/docker-compose.test.yml';
const REPO_ROOT = process.cwd().endsWith('/apps/front')
	? resolve(process.cwd(), '../..')
	: process.cwd();
const API_BASE_URL =
	process.env.E2E_API_BASE_URL ?? 'http://api.front.localhost:5000';
const REAL_INVALID_SESSION_PATHS = new Set([
	'/auth/user-auth-data',
	STAFF_USERS_PATH,
]);
const LOG_SINK_SERVICES = ['api', 'front', 'migrate', 'postgres'] as const;
const SMOKE_BROWSER_MESSAGE = '[apps/front] log-leak smoke probe';
const SEARCH_BOX_NAME = /search/i;

type SinkCapture = {
	name: string;
	text: string;
};
type SessionCookie = NonNullable<Awaited<ReturnType<typeof getSessionCookie>>>;

const uniqueNeedles = (needles: string[]): string[] => {
	const seen = new Set<string>();
	const output: string[] = [];

	for (const needle of needles) {
		if (!needle || seen.has(needle)) {
			continue;
		}

		seen.add(needle);
		output.push(needle);
	}

	return output;
};

const decodedNeedles = (value: string): string[] => {
	try {
		const decodedValue = decodeURIComponent(value);
		return decodedValue === value ? [] : [decodedValue];
	} catch {
		return [];
	}
};

const tokenPartsFromSessionCookie = (cookieValue: string): string[] => {
	const tokenParts = cookieValue.split('+').flatMap((part) => {
		if (part.startsWith('s:') || part.startsWith('t:')) {
			return [part, part.slice(2)];
		}

		return [part];
	});

	return uniqueNeedles([
		cookieValue,
		...decodedNeedles(cookieValue),
		...tokenParts,
		...tokenParts.flatMap((part) => decodedNeedles(part)),
	]);
};

const tokenNeedles = (cookieValue: string): string[] => {
	return uniqueNeedles(
		tokenPartsFromSessionCookie(cookieValue).flatMap((part) => [
			part,
			encodeURIComponent(part),
			JSON.stringify(part).slice(1, -1),
		]),
	);
};

const sanitizeLineForNeedles = (line: string, needles: string[]): string => {
	let output = line;

	for (const needle of needles) {
		output = output.split(needle).join('<token redacted>');
	}

	return output;
};

const findFirstLeakLine = (text: string, needles: string[]): string => {
	for (const line of text.split(/\r?\n/)) {
		if (needles.some((needle) => line.includes(needle))) {
			return sanitizeLineForNeedles(line, needles);
		}
	}

	return '<line unavailable>';
};

const readDockerLogs = (
	service: (typeof LOG_SINK_SERVICES)[number],
): string => {
	return execFileSync(
		'docker',
		['compose', '-f', COMPOSE_FILE, 'logs', '--no-color', service],
		{
			cwd: REPO_ROOT,
			encoding: 'utf8',
			maxBuffer: 20 * 1024 * 1024,
		},
	);
};

const captureContainerLogSinks = (): SinkCapture[] => {
	return LOG_SINK_SERVICES.map((service) => ({
		name: service,
		text: readDockerLogs(service),
	}));
};

const installBrowserLogCapture = async (page: Page): Promise<string[]> => {
	const messages: string[] = [];

	page.on('console', (message) => {
		messages.push(message.text());
	});
	page.on('pageerror', (error) => {
		messages.push(`pageerror: ${error.name}: ${error.message}`);
	});

	return messages;
};

const assertSecretAbsentFromSinks = (
	sinks: SinkCapture[],
	secrets: string[],
): void => {
	const needles = uniqueNeedles(
		secrets.flatMap((secret) => tokenNeedles(secret)),
	);
	expect(needles.length, 'session-token search needles').toBeGreaterThan(0);

	for (const sink of sinks) {
		for (const needle of needles) {
			if (sink.text.includes(needle)) {
				throw new Error(
					[
						`${sink.name} leaked <token redacted>`,
						`firstLine=${findFirstLeakLine(sink.text, needles)}`,
					].join('; '),
				);
			}
		}
	}
};

const testTokenSuffix = (testInfo: TestInfo): string => {
	return `${process.pid}_worker_${testInfo.workerIndex}`;
};

const sentinelSessionCookieValue = (testInfo: TestInfo): string => {
	return [
		's:front-e2e-token',
		testTokenSuffix(testInfo),
		'slash/with?query=value%22json%5C',
	].join('_');
};

const requestHasQuery = (request: Request, q: string): boolean => {
	if (!isStaffUsersRequest(request)) {
		return false;
	}

	return getStaffUsersUrl(request).searchParams.get('q') === q;
};

const waitForRealInvalidSessionApiResponse = (
	page: Page,
): Promise<Response> => {
	return page.waitForResponse((response) => {
		if (response.status() !== 401) {
			return false;
		}

		return isRealInvalidSessionApiRequest(response.request());
	});
};

const isRealInvalidSessionApiRequest = (request: Request): boolean => {
	const apiBaseUrl = new URL(API_BASE_URL);
	const url = new URL(request.url());

	return (
		request.method() === 'GET' &&
		url.origin === apiBaseUrl.origin &&
		REAL_INVALID_SESSION_PATHS.has(url.pathname)
	);
};

const setSessionCookieValue = async (
	page: Page,
	value: string,
	sourceCookie: SessionCookie,
): Promise<void> => {
	await page.context().addCookies([
		{
			...sourceCookie,
			name: SESSION_TOKEN_COOKIE_KEY,
			value,
			path: '/',
		},
	]);
};

const restoreStaffUsersPage = async (
	page: Page,
	sessionCookie: SessionCookie,
): Promise<void> => {
	await page.context().addCookies([sessionCookie]);
	await page.goto('/staff/staff-users');
	await expect(
		page.getByRole('table').getByText('staff-admin@example.com'),
	).toBeVisible();
};

const forceStaffUsersResponse = async (
	page: Page,
	sessionCookie: SessionCookie,
	sentinelCookieValue: string,
	status: 401 | 403,
	q: string,
): Promise<void> => {
	await setSessionCookieValue(page, sentinelCookieValue, sessionCookie);

	const handler = async (route: Route) => {
		if (!requestHasQuery(route.request(), q)) {
			await route.continue();
			return;
		}

		await route.fulfill({
			status,
			headers: {
				'content-type': 'application/problem+json',
			},
			body: problemJson(status, `Forced log leak ${sentinelCookieValue}`),
		});
	};

	await page.route('**/staff/users**', handler);
	try {
		const responsePromise = waitForStaffUsersResponse(page, { q, status });
		await page.getByRole('textbox', { name: SEARCH_BOX_NAME }).fill(q);
		await responsePromise;

		if (status === 401) {
			await expect(page).toHaveURL(/\/login\/?\?rc=invalid_session$/);
		}
	} finally {
		await page.unroute('**/staff/users**', handler);
	}
};

const forceStaffUsersNetworkFailure = async (
	page: Page,
	sessionCookie: SessionCookie,
	sentinelCookieValue: string,
	q: string,
): Promise<void> => {
	await setSessionCookieValue(page, sentinelCookieValue, sessionCookie);

	const handler = async (route: Route) => {
		if (!requestHasQuery(route.request(), q)) {
			await route.continue();
			return;
		}

		await route.abort('failed');
	};

	await page.route('**/staff/users**', handler);
	try {
		const requestPromise = page.waitForRequest((request) => {
			return requestHasQuery(request, q);
		});
		await page.getByRole('textbox', { name: SEARCH_BOX_NAME }).fill(q);
		await requestPromise;
		await expect(page.getByText('Error loading staff members')).toBeVisible();
	} finally {
		await page.unroute('**/staff/users**', handler);
	}
};

const forceRealStaffUsersInvalidSession = async (
	page: Page,
	sessionCookie: SessionCookie,
	sentinelCookieValue: string,
	q: string,
): Promise<void> => {
	await setSessionCookieValue(page, sentinelCookieValue, sessionCookie);

	const responsePromise = waitForRealInvalidSessionApiResponse(page);
	await page.goto(`/staff/staff-users?q=${encodeURIComponent(q)}`);
	const response = await responsePromise;
	const requestHeaderValues = Object.values(
		await response.request().allHeaders(),
	);
	const sentinelReachedApiRequest = tokenPartsFromSessionCookie(
		sentinelCookieValue,
	).some((part) =>
		requestHeaderValues.some((headerValue) => headerValue.includes(part)),
	);
	expect(sentinelReachedApiRequest).toBe(true);

	await expect(page).toHaveURL(/\/login\/?\?rc=invalid_session$/);
};

test('session token stays out of browser console and deployed container logs', async ({
	page,
}, testInfo) => {
	const browserMessages = await installBrowserLogCapture(page);

	await openStaffUsersAsStaffAdmin(page);
	await page.evaluate(
		(message) => {
			console.info(message);
		},
		`${SMOKE_BROWSER_MESSAGE} ${testTokenSuffix(testInfo)}`,
	);

	const sessionCookie = await getSessionCookie(page);
	expect(sessionCookie?.value.length ?? 0).toBeGreaterThan(0);
	if (!sessionCookie) {
		throw new Error('Expected a session cookie after staff login');
	}

	const sentinelCookieValue = sentinelSessionCookieValue(testInfo);
	await forceStaffUsersNetworkFailure(
		page,
		sessionCookie,
		sentinelCookieValue,
		'log-leak-network',
	);
	await restoreStaffUsersPage(page, sessionCookie);
	await forceStaffUsersResponse(
		page,
		sessionCookie,
		sentinelCookieValue,
		403,
		'log-leak-403',
	);
	await restoreStaffUsersPage(page, sessionCookie);
	await forceRealStaffUsersInvalidSession(
		page,
		sessionCookie,
		sentinelCookieValue,
		'log-leak-real-401',
	);

	const browserText = browserMessages.join('\n');
	const sinks: SinkCapture[] = [
		{ name: 'browser-console', text: browserText },
		...captureContainerLogSinks(),
	];
	assertSecretAbsentFromSinks(sinks, [
		sessionCookie.value,
		sentinelCookieValue,
	]);
	expect(browserText).toContain(SMOKE_BROWSER_MESSAGE);
});
