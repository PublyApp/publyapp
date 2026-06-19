import { expect, test } from 'vitest';

import { toApiFailure } from './api-failure';

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
