// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

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
});
