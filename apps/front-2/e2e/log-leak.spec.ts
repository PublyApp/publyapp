import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import {
	expect,
	test,
	type APIRequestContext,
	type APIResponse,
	type Page,
	type TestInfo,
} from '@playwright/test';

import { loginAsStaffAdmin } from './helpers/login';

const COMPOSE_FILE = 'apps/front-2/docker-compose.test.yml';
// Browser-origin requests must use the public Traefik TLS route.
const API_BASE_URL = 'https://api.front-2.localhost:8443';
const STAFF_USERS_ROUTE = '/staff/staff-users';
const STAFF_USERS_API_PATH = '/staff/users';
const SESSION_TOKEN_COOKIE_KEY = 'publyapp-session_token';
const SESSION_TOKEN_HEADER_KEY = 'X-Session-Token';
const TOXIPROXY_API_URL = 'http://127.0.0.1:8474';
const TOXIPROXY_PROXY_NAME = 'api';
const REPO_ROOT = process.cwd().endsWith('/apps/front-2')
	? resolve(process.cwd(), '../..')
	: process.cwd();

const LOG_SINK_SERVICES = ['api', 'request-counter', 'front-2'] as const;

type LogServiceName = (typeof LOG_SINK_SERVICES)[number];
type LogSinkName = LogServiceName | 'browser-console';

type SinkCapture = {
	name: LogSinkName;
	text: string;
};

type OccurrenceCounts = {
	token: number;
	header: number;
};

type StaffUsersFaultSignal =
	| {
			kind: 'requestfailed';
	  }
	| {
			kind: 'response';
			status: number;
	  };

const countOccurrences = (text: string, needle: string): number => {
	if (!needle) {
		return 0;
	}

	let count = 0;
	let offset = 0;

	while (offset < text.length) {
		const index = text.indexOf(needle, offset);
		if (index === -1) {
			return count;
		}

		count += 1;
		offset = index + 1;
	}

	return count;
};

const maskSecretInLine = (line: string, secret: string): string =>
	line.replaceAll(secret, '<token redacted>');

const tokenNeedlesForGuardCheck = (secret: string): string[] => [
	secret,
	encodeURIComponent(secret),
	JSON.stringify(secret).slice(1, -1),
];

const countNeedlesOccurrences = (text: string, needles: string[]): number => {
	let count = 0;

	for (const needle of needles) {
		count += countOccurrences(text, needle);
	}

	return count;
};

const findFirstLeakingLineForNeedles = (
	text: string,
	needles: string[],
): string => {
	for (const line of text.split(/\r?\n/)) {
		for (const needle of needles) {
			if (line.includes(needle)) {
				return maskSecretInLine(line, needle);
			}
		}
	}

	return '<line unavailable>';
};

const readDockerLogs = (service: LogServiceName): string => {
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

const captureContainerLogSinks = (): SinkCapture[] =>
	LOG_SINK_SERVICES.map((service) => ({
		name: service,
		text: readDockerLogs(service),
	}));

const assertNeedleIsPresent = (needle: string, label: string) => {
	expect(needle.length, `${label} is non-empty`).toBeGreaterThan(0);
};

const assertSecretAbsentFromSink = (
	sink: SinkCapture,
	secret: string,
): OccurrenceCounts => {
	const tokenNeedles = tokenNeedlesForGuardCheck(secret);
	const headerNeedles = tokenNeedles.map(
		(tokenValue) => `${SESSION_TOKEN_HEADER_KEY}: ${tokenValue}`,
	);

	for (const needle of tokenNeedles) {
		assertNeedleIsPresent(needle, `${sink.name} token search needle`);
	}

	for (const needle of headerNeedles) {
		assertNeedleIsPresent(needle, `${sink.name} header search needle`);
	}

	const counts = {
		token: countNeedlesOccurrences(sink.text, tokenNeedles),
		header: countNeedlesOccurrences(sink.text, headerNeedles),
	};

	if (counts.token > 0 || counts.header > 0) {
		const leakingLine = findFirstLeakingLineForNeedles(sink.text, [
			...tokenNeedles,
			...headerNeedles,
		]);
		throw new Error(
			[
				`${sink.name} leaked <token redacted>`,
				`tokenOccurrences=${counts.token}`,
				`headerOccurrences=${counts.header}`,
				`firstLine=${leakingLine}`,
			].join('; '),
		);
	}

	expect(counts.token, `${sink.name} token occurrence count`).toBe(0);
	expect(counts.header, `${sink.name} header occurrence count`).toBe(0);

	return counts;
};

const assertSecretAbsentFromSinks = (
	sinks: SinkCapture[],
	secret: string,
): Record<LogSinkName, OccurrenceCounts> => {
	const countsBySink = {} as Record<LogSinkName, OccurrenceCounts>;

	for (const sink of sinks) {
		countsBySink[sink.name] = assertSecretAbsentFromSink(sink, secret);
	}

	return countsBySink;
};

const buildSentinelToken = (suffix: string, testInfo: TestInfo): string =>
	`LEAK_SENTINEL_${suffix}_${process.pid}_worker_${testInfo.workerIndex}_group_4_5b_+%/"?`;

const installBrowserLogCapture = async (page: Page): Promise<string[]> => {
	const browserConsoleMessages: string[] = [];

	page.on('console', (message) => {
		browserConsoleMessages.push(message.text());
	});
	page.on('pageerror', (error) => {
		browserConsoleMessages.push(
			[`pageerror: ${error.name}: ${error.message}`, error.stack ?? '']
				.filter(Boolean)
				.join('\n'),
		);
	});
	await page.addInitScript(() => {
		const formatReason = (reason: unknown): string => {
			if (reason instanceof Error) {
				return `${reason.name}: ${reason.message}`;
			}

			if (typeof reason === 'string') {
				return reason;
			}

			try {
				return JSON.stringify(reason);
			} catch {
				return String(reason);
			}
		};

		window.addEventListener('unhandledrejection', (event) => {
			console.error(`unhandledrejection: ${formatReason(event.reason)}`);
		});
	});

	return browserConsoleMessages;
};

const getStaffSessionTokenFromCookie = async (page: Page): Promise<string> => {
	return page.evaluate((cookieKey) => {
		const cookiePrefix = `${cookieKey}=`;
		const cookiePart = document.cookie
			.split('; ')
			.find((part) => part.startsWith(cookiePrefix));
		const encodedCookieValue = cookiePart?.slice(cookiePrefix.length);

		if (!encodedCookieValue) {
			return '';
		}

		const cookieValue = decodeURIComponent(encodedCookieValue);
		const parts = cookieValue.split('+');
		const staffPart = parts.find((part) => part.startsWith('s:'));
		const tenantPart = parts.find((part) => part.startsWith('t:'));

		if (staffPart) {
			return staffPart.slice(2);
		}

		if (tenantPart) {
			return tenantPart.slice(2);
		}

		return cookieValue;
	}, SESSION_TOKEN_COOKIE_KEY);
};

type ToxiproxyProxy = {
	enabled?: boolean;
	toxics?: Array<{ name: string }>;
};

type ApiResponse = Response | APIResponse;

const isResponseOk = (response: ApiResponse) =>
	typeof response.ok === 'function' ? response.ok() : response.ok;

const readResponseBody = async (response: ApiResponse): Promise<string> => {
	try {
		return await response.text();
	} catch {
		return '<unreadable response body>';
	}
};

const throwToxiproxyError = async (
	action: string,
	response: ApiResponse,
): Promise<never> => {
	const body = await readResponseBody(response);
	const status =
		typeof response.status === 'function' ? response.status() : response.status;
	const statusText =
		typeof response.statusText === 'function'
			? response.statusText()
			: response.statusText;

	throw new Error(`${action}: ${status} ${statusText}; body=${body}`);
};

const setToxiproxyEnabled = async (
	requestContext: APIRequestContext,
	enabled: boolean,
): Promise<void> => {
	const response = await requestContext.fetch(
		`${TOXIPROXY_API_URL}/proxies/${TOXIPROXY_PROXY_NAME}`,
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			data: JSON.stringify({ enabled }),
		},
	);

	if (!isResponseOk(response)) {
		await throwToxiproxyError(
			`failed to ${enabled ? 'enable' : 'disable'} Toxiproxy api proxy`,
			response,
		);
	}
};

const restoreToxiproxy = async (requestContext: APIRequestContext) => {
	const response = await requestContext.fetch(
		`${TOXIPROXY_API_URL}/proxies/${TOXIPROXY_PROXY_NAME}`,
	);

	if (!isResponseOk(response)) {
		await throwToxiproxyError('failed to read Toxiproxy api proxy', response);
	}

	const proxy = (await response.json()) as ToxiproxyProxy;

	for (const toxic of proxy.toxics ?? []) {
		const deleteResponse = await requestContext.fetch(
			`${TOXIPROXY_API_URL}/proxies/${TOXIPROXY_PROXY_NAME}/toxics/${toxic.name}`,
			{ method: 'DELETE' },
		);

		if (!isResponseOk(deleteResponse)) {
			await throwToxiproxyError(
				`failed to delete Toxiproxy toxic ${toxic.name}`,
				deleteResponse,
			);
		}
	}

	if (proxy.enabled === false) {
		await setToxiproxyEnabled(requestContext, true);
	}
};

const disableToxiproxy = async (requestContext: APIRequestContext) => {
	await setToxiproxyEnabled(requestContext, false);
};

const isStaffUsersApiGet = (url: string, method: string): boolean => {
	if (method !== 'GET') {
		return false;
	}

	const parsedUrl = new URL(url);

	return (
		parsedUrl.origin === API_BASE_URL &&
		parsedUrl.pathname === STAFF_USERS_API_PATH
	);
};

const waitForStaffUsersFault = async (
	page: Page,
): Promise<StaffUsersFaultSignal> => {
	const requestFailedPromise = page
		.waitForEvent('requestfailed', (request) =>
			isStaffUsersApiGet(request.url(), request.method()),
		)
		.then((): StaffUsersFaultSignal => ({ kind: 'requestfailed' }));
	const nonOkResponsePromise = page
		.waitForResponse(
			(response) =>
				isStaffUsersApiGet(response.url(), response.request().method()) &&
				response.status() !== 200,
		)
		.then(
			(response): StaffUsersFaultSignal => ({
				kind: 'response',
				status: response.status(),
			}),
		);

	try {
		return await Promise.race([requestFailedPromise, nonOkResponsePromise]);
	} finally {
		requestFailedPromise.catch(() => {});
		nonOkResponsePromise.catch(() => {});
	}
};

test.describe.fixme('front-2 log leak guard', () => {
	// ENABLE at M1.4: requires front-2 login + authed /staff/staff-users + session cookie
	test.describe.configure({ mode: 'serial' });

	test.afterEach(async ({ page }) => {
		await restoreToxiproxy(page.request);
	});

	test('rejected session token is absent from deployed container logs', async ({
		page,
	}, testInfo) => {
		const sentinelToken = buildSentinelToken('A', testInfo);

		const response = await page.request.get(
			`${API_BASE_URL}${STAFF_USERS_API_PATH}`,
			{
				headers: {
					[SESSION_TOKEN_HEADER_KEY]: sentinelToken,
				},
			},
		);

		expect(response.status(), 'rejected token status').toBe(401);

		assertSecretAbsentFromSinks(captureContainerLogSinks(), sentinelToken);
	});

	test('valid session token is absent from browser and container logs during a proxy fault', async ({
		page,
	}) => {
		const browserConsoleMessages = await installBrowserLogCapture(page);

		await loginAsStaffAdmin(page);
		const sessionToken = await getStaffSessionTokenFromCookie(page);
		assertNeedleIsPresent(sessionToken, 'browser staff session token');

		const firstStaffUsersRequest = page.waitForRequest((request) =>
			isStaffUsersApiGet(request.url(), request.method()),
		);
		const firstStaffUsersResponse = page.waitForResponse(
			(response) =>
				isStaffUsersApiGet(response.url(), response.request().method()) &&
				response.status() === 200,
		);
		await page.goto(`${STAFF_USERS_ROUTE}?q=admin`);
		const staffUsersRequest = await firstStaffUsersRequest;
		await firstStaffUsersResponse;

		const wireSessionToken = staffUsersRequest.headers()['x-session-token'];
		expect(
			wireSessionToken?.length ?? 0,
			'staff users request token header is non-empty',
		).toBeGreaterThan(0);
		expect(
			wireSessionToken === sessionToken,
			'cookie token equals staff users request header',
		).toBe(true);

		try {
			await disableToxiproxy(page.request);

			const faultedStaffUsersSignal = waitForStaffUsersFault(page);
			await page.goto(`${STAFF_USERS_ROUTE}?q=toxiproxy-fault`);
			await faultedStaffUsersSignal;
			await expect(
				page.getByRole('button', { name: /try again/i }),
				'front-2 route error view after staff users fault',
			).toBeVisible({ timeout: 20_000 });
		} finally {
			await restoreToxiproxy(page.request);
		}

		assertSecretAbsentFromSinks(
			[
				{
					name: 'browser-console',
					text: browserConsoleMessages.join('\n'),
				},
				...captureContainerLogSinks(),
			],
			sessionToken,
		);
	});
});
