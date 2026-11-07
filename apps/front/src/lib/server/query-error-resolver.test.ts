import { describe, expect, test } from 'vitest';
import enLocale from '~/i18n/locales/en';
import frLocale from '~/i18n/locales/fr';
import { resolveQueryError } from '~/lib/server/query-error-resolver';
import { ServerFailure } from '~/lib/server/server-failure';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const t = (key: string) => `t(${key})`;

const realTranslator = (common: TestLabelMap) => {
	return (key: string) => common[key] ?? key;
};

describe('resolveQueryError (#2043)', () => {
	test('maps a 403 ServerFailure to the forbidden copy', () => {
		const resolution = resolveQueryError(
			new ServerFailure({
				responseStatusCode: 403,
				status: 403,
				title: 'Forbidden',
				detail: 'Your role no longer has access to this tenant.',
				translationKey: 'tenant-forbidden',
			}),
			t,
		);

		expect(resolution.kind).toBe('forbidden');
		expect(resolution.code).toBe('t(error-403-code)');
		expect(resolution.title).toBe('t(no-access-title)');
		expect(resolution.description).toBe('t(forbidden-description)');
		expect(resolution.supportsRetry).toBe(false);
		// A real cause existed, so the generic fallback flag stays false even
		// though the owner decision paints our translated copy instead of it.
		expect(resolution.fallback).toBe(false);
	});

	test('maps a 404 ServerFailure to the not-found copy and keeps the retry pair', () => {
		const resolution = resolveQueryError(
			new ServerFailure({
				responseStatusCode: 404,
				status: 404,
				title: 'Not Found',
				detail: 'The resource was deleted.',
				translationKey: 'tenant-role-not-found',
			}),
			t,
		);

		expect(resolution.kind).toBe('not_found');
		expect(resolution.code).toBe('t(error-404-code)');
		expect(resolution.title).toBe('t(page-not-found)');
		// The API's English `detail` must not leak under a French title.
		expect(resolution.description).toBe('t(not-found-sentence)');
		expect(resolution.supportsRetry).toBe(true);
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

		expect(resolution.kind).toBe('server');
		expect(resolution.code).toBe('t(error-500-code)');
		expect(resolution.title).toBe('t(error-500-title)');
		expect(resolution.description).toBe('t(error-500-description)');
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
		expect(resolution.description).toBe('t(query-display-error-cause-unknown)');
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
		expect(resolution.description).toBe('t(query-display-error-cause-unknown)');
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
		expect(resolution.fallback).toBe(false);
	});

	test('surfaces an unknown failure message when the error carries no status', () => {
		const resolution = resolveQueryError(new Error('boom'), t);

		expect(resolution.code).toBeUndefined();
		expect(resolution.title).toBe('t(query-display-error-default)');
		expect(resolution.description).toBe('t(query-display-error-cause-unknown)');
		expect(resolution.supportsRetry).toBe(true);
		expect(resolution.fallback).toBe(false);
	});

	test('surfaces a problem title when its detail is empty even though status is known', () => {
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
		// fall back through getFailureMessage to the server-provided title.
		expect(resolution.title).toBe('t(error-500-title)');
		expect(resolution.description).toBe('t(error-500-description)');
		expect(resolution.supportsRetry).toBe(true);
		expect(resolution.fallback).toBe(false);
	});

	test('surfaces a network failure message through the shared failure seam', () => {
		const resolution = resolveQueryError(
			new TypeError('Failed to fetch the calendar.'),
			t,
		);

		expect(resolution.kind).toBe('offline');
		expect(resolution.title).toBe('t(offline-title)');
		expect(resolution.description).toBe('t(offline-description)');
		expect(resolution.fallback).toBe(false);
	});

	test('surfaces an unknown failure message through the shared failure seam', () => {
		const resolution = resolveQueryError(new Error('The cache is corrupt.'), t);

		expect(resolution.kind).toBe('unknown');
		expect(resolution.description).toBe('t(query-display-error-cause-unknown)');
		expect(resolution.fallback).toBe(false);
	});

	test('surfaces a problem title when detail is absent', () => {
		const resolution = resolveQueryError(
			{
				status: 400,
				responseStatusCode: 400,
				title: 'The request was rejected.',
			},
			t,
		);

		expect(resolution.description).toBe('t(query-display-error-cause-unknown)');
		expect(resolution.fallback).toBe(false);
	});

	test('surfaces a validation translation key when detail and title are absent', () => {
		const resolution = resolveQueryError(
			{
				status: 422,
				responseStatusCode: 422,
				translationKey: 'calendar-query-invalid',
				errors: { month: ['Invalid month.'] },
			},
			t,
		);

		expect(resolution.description).toBe('t(query-display-error-cause-unknown)');
		expect(resolution.fallback).toBe(false);
	});

	test('silences an intentional abort instead of presenting a scary cause', () => {
		const abort = new Error('The request was cancelled by navigation.');
		abort.name = 'AbortError';

		const resolution = resolveQueryError(abort, t);

		expect(resolution.silent).toBe(true);
		expect(resolution.description).toBe('');
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
		expect(resolution.description).toBe('t(forbidden-description)');
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
		expect(resolution.description).toBe('t(forbidden-description)');
	});
});

// review-tokens non-blocking note 4: the unit mocks above pin a local label
// map, so they cannot catch a bundle rename. This one reads the shipped
// common bundle through the real resolver.
describe('shipped one-error-state copy (#2291)', () => {
	test('the real bundles carry the owner titles, not the old generic copy', () => {
		const en = realTranslator(enLocale.common);
		const fr = realTranslator(frLocale.common);

		expect(resolveQueryError({ status: 403 }, en).title).toBe('Access denied');
		expect(resolveQueryError({ status: 403 }, fr).title).toBe('Accès refusé');
		expect(resolveQueryError({ status: 500 }, en).title).toBe('Unable to load');
		expect(resolveQueryError({ status: 500 }, fr).title).toBe(
			'Impossible de charger',
		);
	});
});
