import { expect, test } from 'vitest';

import { createClient } from './api-client';
import { toApiFailure } from './api-failure';

const isLogoutFailure = (failure: ReturnType<typeof toApiFailure>) =>
	failure.kind === 'problem' && failure.status === 401;

test('maps 422 validation bodies to ValidationFailure with fieldErrors', () => {
	const failure = toApiFailure({
		responseStatusCode: 422,
		body: {
			status: 422,
			title: 'Validation failed',
			errors: {
				email: ['Email is required.'],
				password: ['Password is too short.'],
			},
		},
	});

	expect(failure).toMatchObject({
		kind: 'validation',
		status: 422,
		fieldErrors: {
			email: ['Email is required.'],
			password: ['Password is too short.'],
		},
	});
});

test('maps AppProblemDetails status without responseStatusCode to problem failures', () => {
	const unauthorizedFailure = toApiFailure({
		type: 'about:blank',
		title: 'Unauthorized',
		status: 401,
		detail: 'Session is invalid',
		translationKey: 'invalid-session',
	});
	const forbiddenFailure = toApiFailure({
		type: 'about:blank',
		title: 'Forbidden',
		status: 403,
		detail: 'Missing permission',
		translationKey: 'forbidden',
	});
	const serverFailure = toApiFailure({
		type: 'about:blank',
		title: 'Server error',
		status: 500,
		detail: 'Unexpected server error',
		translationKey: 'server-error',
	});

	expect(unauthorizedFailure).toMatchObject({
		kind: 'problem',
		status: 401,
		translationKey: 'invalid-session',
	});
	expect(forbiddenFailure).toMatchObject({
		kind: 'problem',
		status: 403,
		translationKey: 'forbidden',
	});
	expect(serverFailure).toMatchObject({
		kind: 'problem',
		status: 500,
		translationKey: 'server-error',
	});
});

test('ignores string problem status values instead of coercing them to logout statuses', () => {
	const failure = toApiFailure({
		type: 'about:blank',
		title: 'Unauthorized',
		status: '401',
		detail: 'Session is invalid',
	});

	expect(isLogoutFailure(failure)).toBe(false);
	expect(failure).not.toMatchObject({
		kind: 'problem',
		status: 401,
	});
});

test('ignores invalid responseStatusCode values before falling back to body status', () => {
	const falseStatusFailure = toApiFailure({
		responseStatusCode: false,
		body: {
			status: 401,
			title: 'Unauthorized',
			translationKey: 'invalid-session',
		},
	});
	const zeroStatusFailure = toApiFailure({
		responseStatusCode: 0,
		body: {
			status: 401,
			title: 'Unauthorized',
			translationKey: 'invalid-session',
		},
	});

	expect(falseStatusFailure).toMatchObject({
		kind: 'problem',
		status: 401,
		translationKey: 'invalid-session',
	});
	expect(zeroStatusFailure).toMatchObject({
		kind: 'problem',
		status: 401,
		translationKey: 'invalid-session',
	});
});

test('keeps responseStatusCode precedence over body status when both are valid', () => {
	const failure = toApiFailure({
		responseStatusCode: 403,
		body: {
			status: 401,
			title: 'Forbidden',
			translationKey: 'forbidden',
		},
	});

	expect(failure).toMatchObject({
		kind: 'problem',
		status: 403,
		translationKey: 'forbidden',
	});
	expect(isLogoutFailure(failure)).toBe(false);
});

test('does not treat non-error statuses or non-problem failures as logout failures', () => {
	const successStatusFailure = toApiFailure({
		type: 'about:blank',
		title: 'OK',
		status: 200,
	});
	const errorFailure = toApiFailure(new Error('plain error'));
	const stringFailure = toApiFailure('plain string');
	const networkFailure = toApiFailure(new TypeError('Failed to fetch'));

	expect(isLogoutFailure(successStatusFailure)).toBe(false);
	expect(successStatusFailure).toMatchObject({
		kind: 'problem',
		status: 200,
	});
	expect(isLogoutFailure(errorFailure)).toBe(false);
	expect(errorFailure).toMatchObject({ kind: 'unknown' });
	expect(isLogoutFailure(stringFailure)).toBe(false);
	expect(stringFailure).toMatchObject({ kind: 'unknown' });
	expect(isLogoutFailure(networkFailure)).toBe(false);
	expect(networkFailure).toMatchObject({ kind: 'network' });
});

test('maps responseStatusCode 401 to the logout-driving problem failure', () => {
	const failure = toApiFailure({
		responseStatusCode: 401,
		body: {
			status: 401,
			title: 'Unauthorized',
			translationKey: 'invalid-session',
		},
	});

	expect(failure).toMatchObject({
		kind: 'problem',
		status: 401,
		translationKey: 'invalid-session',
	});
});

test('maps generated Kiota AppProblemDetails 401 to the logout-driving problem failure', async () => {
	process.env.SERVER_API_BASE_URL = 'https://api.test.local';

	const client = createClient({
		base: 'server',
		fetchImpl: (async () =>
			new Response(
				JSON.stringify({
					type: 'about:blank',
					title: 'Unauthorized',
					status: 401,
					detail: 'Session is invalid',
					translationKey: 'invalid-session',
				}),
				{
					status: 401,
					headers: { 'content-type': 'application/problem+json' },
				},
			)) as typeof fetch,
	});

	try {
		await client.staff.users.get();
		throw new Error('expected staff users request to throw');
	} catch (error) {
		expect(toApiFailure(error)).toMatchObject({
			kind: 'problem',
			status: 401,
			translationKey: 'invalid-session',
		});
	}
});
