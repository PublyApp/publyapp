import { describe, expect, it, vi } from 'vitest';

import type { ApiFailure } from '@org/shared-ts/lib/api-failure/types';

import { applyTenantUserUpdateFailure } from './_edit-submit-handler';

const validationFailure = (fieldErrors: Record<string, string[]>): ApiFailure =>
	({
		kind: 'validation',
		status: 422,
		fieldErrors,
	}) as unknown as ApiFailure;

const run = (failure: ApiFailure) => {
	const setError = vi.fn();
	const setRootValidationError = vi.fn();

	applyTenantUserUpdateFailure({
		failure,
		fallback: 'fallback-message',
		setError,
		setRootValidationError,
	});

	return { setError, setRootValidationError };
};

describe('applyTenantUserUpdateFailure', () => {
	it('maps an avatarUrl-only validation failure to the field', () => {
		const { setError, setRootValidationError } = run(
			validationFailure({ avatarUrl: ['bad url'] }),
		);

		expect(setError).toHaveBeenCalledWith(
			'avatarUrl',
			expect.objectContaining({ type: 'server' }),
		);
		expect(setRootValidationError).not.toHaveBeenCalled();
	});

	it('raises a root error when an unmapped field also failed', () => {
		const { setError, setRootValidationError } = run(
			validationFailure({
				avatarUrl: ['bad url'],
				firstName: ['too long'],
			}),
		);

		expect(setError).toHaveBeenCalledTimes(1);
		expect(setRootValidationError).toHaveBeenCalledTimes(1);
	});

	it('raises only a root error when no field maps to the form', () => {
		const { setError, setRootValidationError } = run(
			validationFailure({ firstName: ['too long'] }),
		);

		expect(setError).not.toHaveBeenCalled();
		expect(setRootValidationError).toHaveBeenCalledTimes(1);
	});

	it('ignores a non-validation failure', () => {
		const { setError, setRootValidationError } = run({
			kind: 'problem',
			status: 500,
		} as unknown as ApiFailure);

		expect(setError).not.toHaveBeenCalled();
		expect(setRootValidationError).not.toHaveBeenCalled();
	});
});
