import { describe, expect, test } from 'vitest';
import { resolveQueryError } from '~/lib/server/query-error-resolver';
import { ServerFailure } from '~/lib/server/server-failure';

const t = (key: string) => `t(${key})`;

describe('resolveQueryError (#2043)', () => {
	test('maps a 403 ServerFailure to the forbidden copy', () => {
		const resolution = resolveQueryError(
			new ServerFailure({
				responseStatusCode: 403,
				status: 403,
				title: 'Forbidden',
				detail: 'Your profile no longer has access to this tenant.',
				translationKey: 'tenant-forbidden',
			}),
			t,
		);

		expect(resolution.code).toBe('t(error-403-code)');
		expect(resolution.title).toBe('t(no-access-title)');
		expect(resolution.description).toBe(
			'Your profile no longer has access to this tenant.',
		);
		expect(resolution.supportsRetry).toBe(false);
		expect(resolution.fallback).toBe(false);
	});

	test('maps a 404 ServerFailure to the not-found copy and disables retry', () => {
		const resolution = resolveQueryError(
			new ServerFailure({
				responseStatusCode: 404,
				status: 404,
				title: 'Not Found',
				detail: 'The resource was deleted.',
				translationKey: 'tenant-profile-not-found',
			}),
			t,
		);

		expect(resolution.code).toBe('t(error-404-code)');
		expect(resolution.title).toBe('t(page-not-found)');
		expect(resolution.description).toBe('The resource was deleted.');
		expect(resolution.supportsRetry).toBe(false);
		expect(resolution.fallback).toBe(false);
	});

	test('maps a 500 ServerFailure to the server-error copy and keeps retry', () => {
		const resolution = resolveQueryError(
			new ServerFailure({
				responseStatusCode: 500,
				status: 500,
				title: 'Internal Server Error',
				detail: 'Trace id: abc',
				translationKey: 'request-failed',
			}),
			t,
		);

		expect(resolution.code).toBe('t(error-500-code)');
		expect(resolution.title).toBe('t(error-500-title)');
		expect(resolution.description).toBe('Trace id: abc');
		expect(resolution.supportsRetry).toBe(true);
		expect(resolution.fallback).toBe(false);
	});

	test('preserves a 400 ServerFailure detail for an otherwise unhandled status', () => {
		const resolution = resolveQueryError(
			new ServerFailure({
				responseStatusCode: 400,
				status: 400,
				title: 'Bad Request',
				detail: 'The request could not be understood.',
				translationKey: 'bad-request',
			}),
			t,
		);

		expect(resolution.code).toBeUndefined();
		expect(resolution.title).toBe('t(query-display-error-default)');
		expect(resolution.description).toBe('The request could not be understood.');
		expect(resolution.supportsRetry).toBe(true);
		expect(resolution.fallback).toBe(false);
	});

	test('preserves a 429 ServerFailure detail for an otherwise unhandled status', () => {
		const resolution = resolveQueryError(
			new ServerFailure({
				responseStatusCode: 429,
				status: 429,
				title: 'Too Many Requests',
				detail: 'Please wait before trying again.',
				translationKey: 'rate-limited',
			}),
			t,
		);

		expect(resolution.code).toBeUndefined();
		expect(resolution.title).toBe('t(query-display-error-default)');
		expect(resolution.description).toBe('Please wait before trying again.');
		expect(resolution.supportsRetry).toBe(true);
		expect(resolution.fallback).toBe(false);
	});

	test('uses the honest generic fallback for an unhandled status without detail', () => {
		const resolution = resolveQueryError(
			new ServerFailure({
				responseStatusCode: 400,
				status: 400,
				title: 'Bad Request',
				detail: '',
				translationKey: 'bad-request',
			}),
			t,
		);

		expect(resolution.title).toBe('t(query-display-error-default)');
		expect(resolution.description).toBe('t(query-display-error-cause-unknown)');
		expect(resolution.supportsRetry).toBe(true);
		expect(resolution.fallback).toBe(true);
	});

	test('falls back to the generic copy and "cause unknown" when the error carries no status', () => {
		const resolution = resolveQueryError(new Error('boom'), t);

		expect(resolution.code).toBeUndefined();
		expect(resolution.title).toBe('t(query-display-error-default)');
		expect(resolution.description).toBe('t(query-display-error-cause-unknown)');
		expect(resolution.supportsRetry).toBe(true);
		expect(resolution.fallback).toBe(true);
	});

	test('falls back to "cause unknown" when the failure detail is empty even though status is known', () => {
		const resolution = resolveQueryError(
			new ServerFailure({
				responseStatusCode: 503,
				status: 503,
				title: 'Service Unavailable',
				detail: '',
				translationKey: 'service-unavailable',
			}),
			t,
		);

		// 503 is a 5xx — generic server-error copy, server detail absent so we
		// say so explicitly rather than pretending to know.
		expect(resolution.title).toBe('t(error-500-title)');
		expect(resolution.description).toBe('t(query-display-error-cause-unknown)');
		expect(resolution.supportsRetry).toBe(true);
	});

	test('reads plain problem-like objects (duck-typed ServerFailure) without forcing an Error subclass', () => {
		const resolution = resolveQueryError(
			{
				status: 403,
				responseStatusCode: 403,
				title: 'Forbidden',
				detail: 'No access.',
				translationKey: 'tenant-forbidden',
			},
			t,
		);

		expect(resolution.code).toBe('t(error-403-code)');
		expect(resolution.title).toBe('t(no-access-title)');
		expect(resolution.description).toBe('No access.');
	});

	test('reads nested problem details carried by an API client error', () => {
		const resolution = resolveQueryError(
			{
				body: {
					status: 403,
					detail: 'The tenant permission was revoked.',
				},
			},
			t,
		);

		expect(resolution.code).toBe('t(error-403-code)');
		expect(resolution.title).toBe('t(no-access-title)');
		expect(resolution.description).toBe('The tenant permission was revoked.');
	});
});
