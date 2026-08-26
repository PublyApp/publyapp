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

import { API_BASE_URL } from './helpers/api';

const COMPOSE_FILE = 'apps/front/docker-compose.test.yml';
const STAFF_USERS_PATH = '/staff/users';
const SESSION_TOKEN_HEADER_KEY = 'X-Session-Token';
const SMOKE_BROWSER_MESSAGE = '[front] log-leak smoke probe';
const CONTROL_REQUEST = {
	method: 'GET',
	path: STAFF_USERS_PATH,
} as const;

const REPO_ROOT = process.cwd().endsWith('/apps/front')
	? resolve(process.cwd(), '../..')
	: process.cwd();

const LOG_SINK_SERVICES = [
	'api',
	'request-counter',
	'front',
	'traefik',
] as const;

type LogServiceName = (typeof LOG_SINK_SERVICES)[number];
type LogSinkName = LogServiceName | 'browser-console';

type SinkCapture = {
	name: LogSinkName;
	text: string;
};

type TokenCounts = {
	token: number;
	header: number;
};

const uniqueNeedles = (needles: string[]): string[] => {
	const seen = new Set<string>();
	const output: string[] = [];

	for (const needle of needles) {
		if (!needle) {
			continue;
		}

		if (!seen.has(needle)) {
			seen.add(needle);
			output.push(needle);
		}
	}

	return output;
};

const countOccurrences = (text: string, needle: string): number => {
	if (!needle) {
		return 0;
	}

	let count = 0;
	let offset = 0;

	while (offset < text.length) {
		const next = text.indexOf(needle, offset);
		if (next === -1) {
			return count;
		}

		count += 1;
		offset = next + needle.length;
	}

	return count;
};

const tokenNeedles = (token: string): string[] =>
	uniqueNeedles([
		token,
		encodeURIComponent(token),
		JSON.stringify(token).slice(1, -1),
	]);

const headerNeedles = (token: string): string[] =>
	uniqueNeedles([
		...tokenNeedles(token),
		...tokenNeedles(token).map(
			(needle) => `${SESSION_TOKEN_HEADER_KEY}: ${needle}`,
		),
		...tokenNeedles(token).map(
			(needle) => `${SESSION_TOKEN_HEADER_KEY.toLowerCase()}: ${needle}`,
		),
	]);

const sanitizeLine = (line: string, needle: string): string => {
	return line.split(needle).join('<token redacted>');
};

const sanitizeLineForNeedles = (line: string, needles: string[]): string => {
	let output = line;
	for (const needle of needles) {
		output = sanitizeLine(output, needle);
	}

	return output;
};

const findFirstLeakLine = (text: string, needles: string[]): string => {
	for (const line of text.split(/\r?\n/)) {
		for (const needle of needles) {
			if (line.includes(needle)) {
				return sanitizeLineForNeedles(line, needles);
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

const assertNeedlePresence = (needle: string, label: string) => {
	expect(needle.length, `${label} is non-empty`).toBeGreaterThan(0);
};

const assertSecretAbsentFromSink = (
	sink: SinkCapture,
	token: string,
): TokenCounts => {
	const needles = headerNeedles(token);
	for (const needle of needles) {
		assertNeedlePresence(needle, `${sink.name} search needle`);
	}

	let tokenCount = 0;
	for (const needle of tokenNeedles(token)) {
		tokenCount += countOccurrences(sink.text, needle);
	}

	let headerCount = 0;
	for (const needle of needles) {
		headerCount += countOccurrences(sink.text, needle);
	}

	if (tokenCount > 0 || headerCount > 0) {
		const leakNeedles = [...tokenNeedles(token), ...needles];
		const leakingLine = findFirstLeakLine(sink.text, leakNeedles);
		throw new Error(
			[
				`${sink.name} leaked <token redacted>`,
				`token=${tokenCount}`,
				`header=${headerCount}`,
				`firstLine=${leakingLine}`,
			].join('; '),
		);
	}

	expect(tokenCount, `${sink.name} token occurrence count`).toBe(0);
	expect(headerCount, `${sink.name} header occurrence count`).toBe(0);

	return { token: tokenCount, header: headerCount };
};

const assertSecretAbsentFromSinks = (sinks: SinkCapture[], token: string) => {
	const countsByName = new Map<LogSinkName, TokenCounts>();

	for (const sink of sinks) {
		countsByName.set(sink.name, assertSecretAbsentFromSink(sink, token));
	}

	return Object.fromEntries(countsByName);
};

const buildSentinelToken = (suffix: string, testInfo: TestInfo): string => {
	return `LEAK_SENTINEL_${suffix}_${process.pid}_worker_${testInfo.workerIndex}_front_2+%/"?`;
};

const installBrowserLogCapture = async (page: Page): Promise<string[]> => {
	const messages: string[] = [];

	page.on('console', (message) => {
		messages.push(message.text());
	});
	page.on('pageerror', (error) => {
		messages.push(`pageerror: ${error.name}: ${error.message}`);
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

	return messages;
};

const requestTokenViaApi = (
	request: APIRequestContext,
	token: string,
): Promise<APIResponse> =>
	request.fetch(`${API_BASE_URL}${CONTROL_REQUEST.path}`, {
		method: CONTROL_REQUEST.method,
		headers: {
			[SESSION_TOKEN_HEADER_KEY]: token,
		},
	});

const requestTokenViaFront = async (
	page: Page,
	token: string,
): Promise<{ protocol: string; status: number }> => {
	const result = await page.evaluate(
		async ({ path, method, headerKey, value }) => {
			const response = await fetch(path, {
				method,
				headers: {
					[headerKey]: value,
				},
			});

			return {
				status: response.status,
				protocol: new URL(response.url).protocol,
			};
		},
		{
			path: CONTROL_REQUEST.path,
			method: CONTROL_REQUEST.method,
			headerKey: SESSION_TOKEN_HEADER_KEY,
			value: token,
		},
	);

	return result;
};

const assertNoLeakAcrossSinks = async (
	request: APIRequestContext,
	token: string,
): Promise<void> => {
	const response = await requestTokenViaApi(request, token);
	expect(response.status(), 'rejected session token status').toBe(401);
	const protocol = new URL(response.url()).protocol;
	expect(protocol, 'API response path is HTTPS').toBe('https:');

	assertSecretAbsentFromSinks(captureContainerLogSinks(), token);
};

test.describe.configure({ mode: 'serial' });

test.describe('log leak prevention', { tag: ['@security', '@733'] }, () => {
	test('rejected token is absent from deployed container logs', async ({
		request,
	}, testInfo) => {
		expect(
			CONTROL_REQUEST.path,
			'request-counter control path is explicit',
		).toBe(STAFF_USERS_PATH);
		expect(
			CONTROL_REQUEST.method,
			'request-counter control method is explicit',
		).toBe('GET');

		const token = buildSentinelToken('invalid', testInfo);
		await assertNoLeakAcrossSinks(request, token);
	});

	// M1.4 intentionally scopes request-counter fault-path work to invalid token and
	// encoded payload coverage while the authenticated fault-recovery branch remains a
	// separate backlog item in this phase's residuals.
	test('redacts token in raw / encoded / JSON-escaped forms everywhere', async ({
		request,
		page,
	}, testInfo) => {
		const rawToken = buildSentinelToken('encoded', testInfo);
		const encodedToken = encodeURIComponent(rawToken);
		const jsonToken = JSON.stringify(rawToken).slice(1, -1);

		expect(
			new Set([rawToken, encodedToken, jsonToken]).size,
			'token variants are distinct',
		).toBe(3);

		const tokenVariants = [rawToken, encodedToken, jsonToken];
		const browserMessages = await installBrowserLogCapture(page);
		await page.addInitScript((smokeMessage) => {
			console.info(smokeMessage);
		}, SMOKE_BROWSER_MESSAGE);
		await page.goto('/');

		for (const token of tokenVariants) {
			await assertNoLeakAcrossSinks(request, token);
			const frontResult = await requestTokenViaFront(page, token);
			expect(frontResult.protocol, 'front request transport is HTTPS').toBe(
				'https:',
			);
			expect(
				frontResult.status,
				'front request path handled malformed token probe',
			).toBe(404);
		}

		const browserText = browserMessages.join('\n');
		const browserAndContainerSinks: SinkCapture[] = [
			{ name: 'browser-console', text: browserText },
			...captureContainerLogSinks(),
		];

		for (const token of tokenVariants) {
			assertSecretAbsentFromSinks(browserAndContainerSinks, token);
		}
		expect(
			browserText,
			'browser console capture observed smoke probe message',
		).toContain(SMOKE_BROWSER_MESSAGE);
	});
});
