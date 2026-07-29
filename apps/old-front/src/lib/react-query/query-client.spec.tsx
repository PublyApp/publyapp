// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { logger } from '@org/shared-ts/lib/logger/iso-logger';

import { createQueryClient, resetAuthLogoutFlag } from './query-client';

vi.mock('@org/shared-ts/lib/logger/iso-logger', () => ({
	logger: {
		error: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		debug: vi.fn(),
	},
}));

vi.mock('sonner', () => ({
	toast: {
		error: vi.fn(),
		success: vi.fn(),
	},
}));

const problem = (status: number) => ({
	title: `HTTP ${status}`,
	status,
	detail: `Problem ${status}`,
	responseStatusCode: status,
});

const nonAuthFailures = [
	problem(403),
	problem(500),
	new TypeError('Failed to fetch'),
	new SyntaxError('Unexpected token < in JSON'),
	new Error('Connection reset'),
	new DOMException('The operation was aborted.', 'AbortError'),
] as const;

describe('createQueryClient auth error handling', () => {
	beforeEach(() => {
		resetAuthLogoutFlag();
		vi.clearAllMocks();
	});

	afterEach(() => {
		resetAuthLogoutFlag();
	});

	test('logs out only for 401 query failures', async () => {
		const onAuthError = vi.fn();
		const client = createQueryClient({ onAuthError });

		let index = 0;
		const runQuery = async (
			error: unknown,
			meta?: { skipAuthErrorHandler?: boolean },
		) => {
			index += 1;
			await client
				.fetchQuery({
					queryKey: ['auth-query-characterization', index],
					queryFn: async () => {
						throw error;
					},
					meta,
					retry: false,
				})
				.catch(() => undefined);
		};

		for (const error of nonAuthFailures) {
			await runQuery(error);
		}

		expect(onAuthError).not.toHaveBeenCalled();

		await runQuery(problem(401));

		expect(onAuthError).toHaveBeenCalledTimes(1);
		expect(onAuthError).toHaveBeenCalledWith(
			401,
			expect.objectContaining({ kind: 'problem', status: 401 }),
		);

		resetAuthLogoutFlag();
		await runQuery(problem(401), { skipAuthErrorHandler: true });

		expect(onAuthError).toHaveBeenCalledTimes(1);
	});

	test('logs out only once for 401 mutation failures', async () => {
		const onAuthError = vi.fn();
		const client = createQueryClient({ onAuthError });

		let index = 0;
		const runMutation = async (
			error: unknown,
			meta?: { skipAuthErrorHandler?: boolean },
		) => {
			index += 1;
			const mutation = client.getMutationCache().build(client, {
				mutationKey: ['auth-mutation-characterization', index],
				mutationFn: async () => {
					throw error;
				},
				meta,
			});

			await mutation.execute(undefined).catch(() => undefined);
		};

		for (const error of nonAuthFailures) {
			await runMutation(error);
		}

		expect(onAuthError).not.toHaveBeenCalled();

		await runMutation(problem(401));
		await runMutation(problem(401));

		expect(onAuthError).toHaveBeenCalledTimes(1);
		expect(onAuthError).toHaveBeenCalledWith(
			401,
			expect.objectContaining({ kind: 'problem', status: 401 }),
		);

		resetAuthLogoutFlag();
		await runMutation(problem(401), { skipAuthErrorHandler: true });

		expect(onAuthError).toHaveBeenCalledTimes(1);
	});

	test('redacts session token headers from dev diagnostic payloads', async () => {
		const token = 'front-unit-token-"quoted"/with?chars=1';
		const encodedToken = encodeURIComponent(token);
		const jsonEscapedToken = JSON.stringify(token).slice(1, -1);
		const client = createQueryClient();

		await client
			.fetchQuery({
				queryKey: ['auth-query-redaction-characterization'],
				queryFn: async () => {
					throw {
						type: 'https://example.test/problem',
						title: `Server error ${token}`,
						status: 500,
						detail: `Server error ${token}`,
						errors: {
							session: [`Leaked ${token}`],
						},
						responseStatusCode: 500,
						details: [`Nested details ${token}`],
						responseHeaders: {
							'X-Session-Token': [token],
							authorization: [`Bearer ${token}`],
							'x-request-id': ['req-1'],
						},
						request: {
							headers: {
								'X-Session-Token': token,
								cookie: `publyapp-session_token=${token}`,
							},
						},
						href: `https://api.publyapp.test/#token=${encodedToken}`,
						uri: `/staff/${encodedToken}/users`,
						url: `https://api.publyapp.test/staff/${encodedToken}/users?token=${encodedToken}`,
					};
				},
				retry: false,
			})
			.catch(() => undefined);
		await client
			.fetchQuery({
				queryKey: ['auth-query-redaction-string-characterization'],
				queryFn: async () => {
					throw `Raw string ${token}`;
				},
				retry: false,
			})
			.catch(() => undefined);

		const loggedPayloads = vi
			.mocked(logger.error)
			.mock.calls.map((call) => call[1]);
		const serializedPayloads = JSON.stringify(loggedPayloads);

		expect(serializedPayloads).not.toContain(token);
		expect(serializedPayloads).not.toContain(encodedToken);
		expect(serializedPayloads).not.toContain(jsonEscapedToken);
		expect(serializedPayloads).toContain('[REDACTED]');
	});
});
