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

const COMPOSE_FILE = 'apps/front-2/docker-compose.test.yml';
const API_BASE_URL = 'https://api.front-2.localhost:8443';
const STAFF_USERS_PATH = '/staff/users';
const SESSION_TOKEN_HEADER_KEY = 'X-Session-Token';
const CONTROL_REQUEST = {
	method: 'GET',
	path: STAFF_USERS_PATH,
} as const;

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

type TokenCounts = {
	token: number;
	header: number;
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

const tokenNeedles = (token: string): string[] => [
	token,
	encodeURIComponent(token),
	JSON.stringify(token).slice(1, -1),
];

const headerNeedles = (token: string): string[] => {
	const baseNeedles = tokenNeedles(token);
	return [
		...baseNeedles,
		...baseNeedles.map((needle) => `${SESSION_TOKEN_HEADER_KEY}: ${needle}`),
		...baseNeedles.map((needle) => `${SESSION_TOKEN_HEADER_KEY.toLowerCase()}: ${needle}`),
	];
};

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

	const counts = {
		token: tokenNeedles(token).reduce(
			(total, needle) => total + countOccurrences(sink.text, needle),
			0,
		),
		header: needles.reduce(
			(total, needle) => total + countOccurrences(sink.text, needle),
			0,
		),
	};

	if (counts.token > 0 || counts.header > 0) {
		const leakNeedles = [...tokenNeedles(token), ...needles];
		const leakingLine = findFirstLeakLine(sink.text, leakNeedles);
		throw new Error(
			[
				`${sink.name} leaked <token redacted>`,
				`token=${counts.token}`,
				`header=${counts.header}`,
				`firstLine=${leakingLine}`,
			].join('; '),
		);
	}

	expect(counts.token, `${sink.name} token occurrence count`).toBe(0);
	expect(counts.header, `${sink.name} header occurrence count`).toBe(0);

	return counts;
};

const assertSecretAbsentFromSinks = (sinks: SinkCapture[], token: string) => {
	const map = {} as Record<LogSinkName, TokenCounts>;

	for (const sink of sinks) {
		map[sink.name] = assertSecretAbsentFromSink(sink, token);
	}

	return map;
};

const buildSentinelToken = (suffix: string, testInfo: TestInfo): string => {
	return `LEAK_SENTINEL_${suffix}_${process.pid}_worker_${testInfo.workerIndex}_front_2`;
};

const installBrowserLogCapture = async (page: Page): Promise<string[]> => {
	const messages: string[] = [];

	page.on('console', (message) => {
		messages.push(message.text());
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

const requestTokenViaFront = (
	request: APIRequestContext,
	token: string,
): Promise<APIResponse> =>
	request.get(`${API_BASE_URL}${CONTROL_REQUEST.path}`, {
		method: CONTROL_REQUEST.method,
		headers: {
			[SESSION_TOKEN_HEADER_KEY]: token,
		},
	});

const assertNoLeakAcrossSinks = async (
	request: APIRequestContext,
	token: string,
): Promise<void> => {
	const response = await requestTokenViaFront(request, token);
	expect(response.status(), 'rejected session token status').toBe(401);
	const protocol = new URL(response.url()).protocol;
	expect(protocol, 'API response path is HTTPS').toBe('https:');

	assertSecretAbsentFromSinks(captureContainerLogSinks(), token);
};

test.describe.configure({ mode: 'serial' });

test('rejected token is absent from deployed container logs', async ({
	request,
}, testInfo) => {
	expect(CONTROL_REQUEST.path, 'request-counter control path is explicit').toBe(
		STAFF_USERS_PATH,
	);
	expect(CONTROL_REQUEST.method, 'request-counter control method is explicit').toBe('GET');

	const token = buildSentinelToken('invalid', testInfo);
	await assertNoLeakAcrossSinks(request, token);
});

test('redacts token in raw / encoded / JSON-escaped forms everywhere', async ({
	request,
	page,
}, testInfo) => {
	const token = buildSentinelToken('encoded', testInfo);
	const browserMessages = await installBrowserLogCapture(page);

	await assertNoLeakAcrossSinks(request, token);
	await requestTokenViaFront(request, encodeURIComponent(token));
	await requestTokenViaFront(request, JSON.stringify(token).slice(1, -1));

	await page.goto('/');
	expect(page.url()).toContain('https://front-2.localhost:8443');

	const browserText = browserMessages.join('\n');
	const sinkText = captureContainerLogSinks()
		.map((sink) => sink.text)
		.join('\n');

	for (const needle of [...tokenNeedles(token), ...headerNeedles(token)]) {
		expect(sinkText.includes(needle), `container logs hide ${needle}`).toBe(false);
		expect(
			browserText.includes(needle),
			`browser console logs hide ${needle}`,
		).toBe(false);
	}

	assertSecretAbsentFromSinks([
		{ name: 'browser-console', text: browserText },
		...captureContainerLogSinks(),
	], token);
});
