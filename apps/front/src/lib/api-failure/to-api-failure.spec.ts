import { describe, expect, test } from 'vitest';

import { toApiFailure } from './to-api-failure';

describe('toApiFailure', () => {
	test('uses problem body status before transport status', () => {
		const failure = toApiFailure({
			title: 'Invalid session',
			status: 401,
			detail: 'The session is no longer valid.',
			responseStatusCode: 403,
		});

		expect(failure).toMatchObject({
			kind: 'problem',
			status: 401,
			title: 'Invalid session',
			detail: 'The session is no longer valid.',
		});
	});

	test('uses validation body status before transport status and preserves field errors', () => {
		const failure = toApiFailure({
			title: 'Validation failed',
			status: 422,
			detail: 'Please check the submitted fields.',
			responseStatusCode: 400,
			errors: {
				email: ['Email is required'],
				password: ['Password is too short'],
			},
		});

		expect(failure).toMatchObject({
			kind: 'validation',
			status: 422,
			title: 'Validation failed',
			detail: 'Please check the submitted fields.',
			fieldErrors: {
				email: ['Email is required'],
				password: ['Password is too short'],
			},
		});
	});

	test('uses transport status when the problem body omits status', () => {
		const failure = toApiFailure({
			title: 'Teapot',
			detail: 'Transport status is the only usable status.',
			responseStatusCode: 418,
		});

		expect(failure).toMatchObject({
			kind: 'problem',
			status: 418,
			title: 'Teapot',
			detail: 'Transport status is the only usable status.',
		});
	});

	test('defaults problem details to 500 when no status is usable', () => {
		const failure = toApiFailure({
			type: 'https://publyapp.local/problems/malformed',
			title: 'Malformed problem',
			detail: 'The body is recognizable problem details without a status.',
		});

		expect(failure).toMatchObject({
			kind: 'problem',
			status: 500,
			title: 'Malformed problem',
			detail: 'The body is recognizable problem details without a status.',
		});
	});

	test('does not classify empty objects as problem details', () => {
		const failure = toApiFailure({});

		expect(failure).toMatchObject({
			kind: 'unknown',
			message: 'An unexpected error occurred',
		});
	});

	test.each([
		['title-only object', { title: 'Not an API problem' }],
		['detail-only object', { detail: 'Not an API problem' }],
		['status-only object', { status: 401 }],
	])('does not classify %s as problem details', (_name, error) => {
		const failure = toApiFailure(error);

		expect(failure).toMatchObject({
			kind: 'unknown',
			message: 'An unexpected error occurred',
		});
	});
});
