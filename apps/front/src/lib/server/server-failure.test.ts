import { describe, expect, test } from 'vitest';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';

import { ServerFailure, throwServerFailurePayload } from './server-failure';

describe('ServerFailure', () => {
	test('is a real Error with a stack trace and the wire-shape fields', () => {
		const failure = new ServerFailure({
			responseStatusCode: 401,
			status: 401,
			title: 'Unauthorized',
			detail: 'missing session token',
		});

		expect(failure).toBeInstanceOf(Error);
		expect(failure.stack).toBeDefined();
		expect(failure.status).toBe(401);
		expect(failure.responseStatusCode).toBe(401);
		expect(failure.detail).toBe('missing session token');
	});

	test('toApiFailure reads it the same way it read the old plain-object throw', () => {
		try {
			throwServerFailurePayload({
				responseStatusCode: 403,
				status: 403,
				title: 'Forbidden',
				detail: 'user has no accessible scope',
			});
		} catch (error) {
			const failure = toApiFailure(error);
			expect(failure.kind).toBe('problem');
			if (failure.kind === 'problem') {
				expect(failure.status).toBe(403);
				expect(failure.detail).toBe('user has no accessible scope');
			}
		}
	});
});
