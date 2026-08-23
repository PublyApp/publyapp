import { expect, test } from 'vitest';

import { toApiFailure } from './to-api-failure';
import type { ApiFailure, ProblemFailure, ValidationFailure } from './types';

// `ApiFailure` is a discriminated union, so property reads (`status`,
// `fieldErrors`, ...) must happen on a narrowed variant. Each helper asserts
// the expected kind once and hands back the narrowed type; the single cast is
// guarded by the assertion immediately above it.
const expectValidation = (failure: ApiFailure): ValidationFailure => {
	expect(failure.kind).toBe('validation');
	return failure as ValidationFailure;
};

const expectProblem = (failure: ApiFailure): ProblemFailure => {
	expect(failure.kind).toBe('problem');
	return failure as ProblemFailure;
};

test('maps body/problem-first status via problemDetails.status ?? responseStatusCode ?? 500', () => {
	const payload = {
		status: 500,
		responseStatusCode: 401,
		detail: 'root detail',
		body: {
			status: 422,
			responseStatusCode: 499,
			detail: 'body detail',
			errors: {
				email: ['invalid'],
			},
		},
	};

	const failure = expectValidation(toApiFailure(payload));
	expect(failure.status).toBe(422);
	expect(failure.detail).toBe('body detail');
	expect(failure.fieldErrors).toEqual({
		email: ['invalid'],
	});
});

test('parses nested error container when body is empty and status resolves from wrapper', () => {
	const payload = {
		error: {
			errors: {
				email: ['required'],
			},
		},
		responseStatusCode: 422,
	};

	const failure = expectValidation(toApiFailure(payload));
	expect(failure.status).toBe(422);
	expect(failure.fieldErrors).toEqual({ email: ['required'] });
});

test('prefers nested error payload over empty wrapper metadata when nested contains validation errors', () => {
	const payload = {
		title: 'wrapped',
		responseStatusCode: 422,
		error: {
			errors: {
				password: ['too weak'],
			},
		},
	};

	const failure = expectValidation(toApiFailure(payload));
	expect(failure.status).toBe(422);
	expect(failure.fieldErrors).toEqual({ password: ['too weak'] });
});

test('parses nested error container before wrapper for validation', () => {
	const payload = {
		title: 'wrapped',
		responseStatusCode: 400,
		error: {
			errors: {
				email: ['required'],
			},
		},
	};

	const failure = expectValidation(toApiFailure(payload));
	expect(failure.status).toBe(400);
	expect(failure.fieldErrors).toEqual({ email: ['required'] });
});

test('uses nested validation status over wrapper response status', () => {
	const payload = {
		responseStatusCode: 400,
		title: 'wrapper',
		error: {
			status: 422,
			errors: {
				password: ['too weak'],
			},
		},
	};

	const failure = expectValidation(toApiFailure(payload));
	expect(failure.status).toBe(422);
	expect(failure.fieldErrors).toEqual({ password: ['too weak'] });
});

test('uses body errors with wrapper response status when body.status is missing', () => {
	const payload = {
		responseStatusCode: 422,
		body: {
			errors: {
				name: ['is required'],
			},
			detail: 'nested validation',
		},
		title: 'ignored',
	};

	const failure = expectValidation(toApiFailure(payload));
	expect(failure.status).toBe(422);
});

test('uses wrapper responseStatusCode for validation when nested responseStatusCode is present', () => {
	const payload = {
		responseStatusCode: 422,
		error: {
			responseStatusCode: 499,
			errors: {
				name: ['is required'],
			},
		},
	};

	const failure = expectValidation(toApiFailure(payload));
	expect(failure.status).toBe(422);
	expect(failure.fieldErrors).toEqual({
		name: ['is required'],
	});
});

test('uses wrapper responseStatusCode instead of wrapper status for validation when selected status is missing', () => {
	const payload = {
		status: 409,
		responseStatusCode: 422,
		body: {
			responseStatusCode: 499,
			errors: {
				email: ['required'],
			},
		},
	};

	const failure = expectValidation(toApiFailure(payload));
	expect(failure.status).toBe(422);
	expect(failure.fieldErrors).toEqual({
		email: ['required'],
	});
});

test('uses body status then wrapper response/status fallback for problem failures', () => {
	const payload = {
		responseStatusCode: 500,
		status: 501,
		body: {
			title: 'body title',
			detail: 'bad shape',
		},
	};

	const failure = expectProblem(toApiFailure(payload));
	expect(failure.status).toBe(500);
});

test('uses wrapper responseStatusCode when body responseStatusCode is set without a status', () => {
	const payload = {
		responseStatusCode: 401,
		body: {
			responseStatusCode: 499,
			detail: 'body detail',
		},
	};

	const failure = expectProblem(toApiFailure(payload));
	expect(failure.status).toBe(401);
	expect(failure.detail).toBe('body detail');
});

test('maps transport-level error when body is missing and fallback is responseStatusCode', () => {
	const payload = {
		responseStatusCode: 400,
		detail: 'transport detail',
		title: 'transport title',
	};

	const failure = expectProblem(toApiFailure(payload));
	expect(failure.status).toBe(400);
	expect(failure.detail).toBe('transport detail');
	expect(failure.title).toBe('transport title');
});

test('maps fallback status to 500 when no status-like fields are available', () => {
	const payload = {
		detail: 'unresolved',
	};

	const failure = expectProblem(toApiFailure(payload));
	expect(failure.status).toBe(500);
	expect(failure.detail).toBe('unresolved');
});

test('maps 422 validation body with field errors', () => {
	const payload = {
		body: {
			status: 422,
			responseStatusCode: 400,
			errors: {
				email: ['required'],
				name: ['too short', 'invalid'],
			},
		},
		title: 'outer title',
	};

	const failure = expectValidation(toApiFailure(payload));
	expect(failure.status).toBe(422);
	expect(failure.fieldErrors).toEqual({
		email: ['required'],
		name: ['too short', 'invalid'],
	});
});

test('maps unknown Error to unknown failure', () => {
	const failure = toApiFailure(new Error('boom'));
	expect(failure.kind).toBe('unknown');
	expect(failure).toMatchObject({ message: 'boom' });
});

test('falls back to 500 for out-of-range response status', () => {
	const failure = expectProblem(
		toApiFailure({
			responseStatusCode: 700,
			title: 'ignored',
		}),
	);

	expect(failure.status).toBe(500);
});

test('lower-camels the PascalCase field-error keys FluentValidation.ToDictionary() actually sends', () => {
	// A real API 422 body shape (ReqBodyValidationFilter.cs -> ValidationResult.ToDictionary()):
	// keys are the rule's PropertyName verbatim, not the wire's camelCase convention.
	const payload = {
		body: {
			status: 422,
			responseStatusCode: 422,
			errors: {
				Email: ['Email is required'],
				NewPassword: ['Password must be at least 12 characters'],
				ID: ['must be a valid id'],
			},
		},
	};

	const failure = expectValidation(toApiFailure(payload));
	expect(failure.fieldErrors).toEqual({
		email: ['Email is required'],
		newPassword: ['Password must be at least 12 characters'],
		id: ['must be a valid id'],
	});
});
