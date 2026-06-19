import { expect, test, vi } from 'vitest';

import {
	SESSION_TOKEN_COOKIE_KEY,
	SESSION_TOKEN_HEADER_KEY,
} from '@org/shared-ts/lib/constants';

import {
	logRouteError,
	toSafeBoundaryLogPayload,
} from './DefaultCatchBoundary';

const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug'] as const;

const expectNoSecretInConsoleOutput = (outputs: string[]) => {
	for (const output of outputs) {
		expect(output).not.toContain('SECRET_TOKEN');
		expect(output).not.toContain('s:SECRET_TOKEN');
	}
};

const createConsoleSpies = () => {
	const outputs: string[] = [];
	const spies = CONSOLE_METHODS.map((level) =>
		vi
			.spyOn(console, level)
			.mockImplementation((...args: unknown[]) =>
				outputs.push(args.map(String).join(' ')),
			),
	);

	return {
		outputs,
		restore: () => spies.forEach((spy) => spy.mockRestore()),
	};
};

test('error logging redacts token-like payload data', () => {
	const { outputs, restore } = createConsoleSpies();

	const error = {
		message: 'login failed',
		status: 500,
		payload: {
			[SESSION_TOKEN_HEADER_KEY]: 'SECRET_TOKEN',
			cookie: `${SESSION_TOKEN_COOKIE_KEY}=s:SECRET_TOKEN`,
		},
	};

	logRouteError(error);

	expectNoSecretInConsoleOutput(outputs);
	expect(outputs.join('\n')).toContain('"Error"');
	expect(outputs.join('\n')).toContain('500');
	restore();
});

test('sanitized boundary payload includes only allowlisted fields', () => {
	const payload = toSafeBoundaryLogPayload({
		name: 'AuthError',
		status: 401,
		details: { shouldStay: 'yes' },
	});

	expect(payload).toEqual({ name: 'AuthError', status: 401 });
});

test('error logging does not output token in message, stack, nested strings, or detail', () => {
	const cases = [
		{
			label: 'message',
			error: {
				message: 'Error message with SECRET_TOKEN',
				status: 400,
			},
		},
		{
			label: 'stack',
			error: {
				message: 'generic route error',
				stack: 'stack line with SECRET_TOKEN',
				status: 500,
			},
		},
		{
			label: 'nested response body',
			error: {
				message: 'generic route error',
				response: {
					body: '{"error":"SECRET_TOKEN"}',
				},
				status: 502,
			},
		},
		{
			label: 'body',
			error: {
				message: 'generic route error',
				body: 'SECRET_TOKEN',
				status: 503,
			},
		},
		{
			label: 'top-level detail',
			error: {
				message: 'generic route error',
				detail: 'detail contains SECRET_TOKEN',
				status: 503,
			},
		},
	];

	for (const tokenErrorCase of cases) {
		const { outputs, restore } = createConsoleSpies();

		logRouteError(tokenErrorCase.error);

		expectNoSecretInConsoleOutput(outputs);
		const payload = toSafeBoundaryLogPayload(tokenErrorCase.error);
		expect(payload).toHaveProperty('name');
		expect(payload).toHaveProperty('status');
		restore();
	}
});
