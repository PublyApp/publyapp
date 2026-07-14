import { describe, expect, test } from 'vitest';

import { classifyPrecheckFailure } from './precheck-outcome';

// users-auth-r6-F1: a terminal 4xx means the link itself is invalid; a
// network failure, an abort, or a 5xx means the API just could not be
// reached — that must classify as 'unavailable' (retryable), never as an
// invalid link.
describe('classifyPrecheckFailure', () => {
	test('classifies a 400 as invalid', () => {
		expect(
			classifyPrecheckFailure({
				responseStatusCode: 400,
				title: 'Bad request',
			}),
		).toBe('invalid');
	});

	test('classifies a 404 as invalid', () => {
		expect(
			classifyPrecheckFailure({ responseStatusCode: 404, title: 'Not found' }),
		).toBe('invalid');
	});

	test('classifies a 422 as invalid', () => {
		expect(
			classifyPrecheckFailure({
				responseStatusCode: 422,
				title: 'Unprocessable',
				errors: {},
			}),
		).toBe('invalid');
	});

	test('classifies a 500 as unavailable, not invalid', () => {
		expect(
			classifyPrecheckFailure({
				responseStatusCode: 500,
				title: 'Internal error',
			}),
		).toBe('unavailable');
	});

	test('classifies a 503 as unavailable, not invalid', () => {
		expect(
			classifyPrecheckFailure({
				responseStatusCode: 503,
				title: 'Service unavailable',
			}),
		).toBe('unavailable');
	});

	test('classifies a network TypeError as unavailable', () => {
		expect(classifyPrecheckFailure(new TypeError('Failed to fetch'))).toBe(
			'unavailable',
		);
	});

	test('classifies an aborted request as unavailable', () => {
		const abortError = new Error('The operation was aborted');
		abortError.name = 'AbortError';
		expect(classifyPrecheckFailure(abortError)).toBe('unavailable');
	});

	test('classifies an unrecognized error as unavailable', () => {
		expect(classifyPrecheckFailure(new Error('mystery failure'))).toBe(
			'unavailable',
		);
	});
});
