import { expect, test, vi } from 'vitest';

import {
	SESSION_TOKEN_COOKIE_KEY,
	SESSION_TOKEN_HEADER_KEY,
} from '@org/shared-ts/lib/constants';

import {
	logRouteError,
	toSafeBoundaryLogPayload,
} from './DefaultCatchBoundary';

test('error logging redacts token-like payload data', () => {
	const logs: string[] = [];
	const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
		(level) =>
			vi
				.spyOn(console, level)
				.mockImplementation((...args: unknown[]) => logs.push(args.join(' '))),
	);

	const error = {
		message: 'login failed',
		status: 500,
		payload: {
			[SESSION_TOKEN_HEADER_KEY]: 'SECRET_TOKEN',
			cookie: `${SESSION_TOKEN_COOKIE_KEY}=s:SECRET_TOKEN`,
		},
	};

	logRouteError(error);

	const output = logs.join('\n');
	expect(output).not.toContain('SECRET_TOKEN');
	expect(output).not.toContain('s:SECRET_TOKEN');
	expect(output).toContain('login failed');
	expect(output).toContain('500');

	for (const spy of spies) {
		spy.mockRestore();
	}
});

test('sanitized boundary payload includes message and status only', () => {
	const payload = toSafeBoundaryLogPayload({
		message: 'auth failed',
		status: 401,
		details: { shouldStay: 'yes' },
	});

	expect(payload).toMatchObject({ message: 'auth failed', status: 401 });
	expect(payload.details).toHaveProperty('details');
});
