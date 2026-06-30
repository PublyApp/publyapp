import { expect, test } from 'vitest';

import { toApiFailure } from './to-api-failure';

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

	const failure = toApiFailure(payload);
	expect(failure.kind).toBe('validation');
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

	const failure = toApiFailure(payload);
	expect(failure.kind).toBe('validation');
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

	const failure = toApiFailure(payload);
	expect(failure.kind).toBe('validation');
	expect(failure.status).toBe(422);
	expect(failure.fieldErrors).toEqual({ password: ['too weak'] });
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

	const failure = toApiFailure(payload);
	expect(failure.kind).toBe('validation');
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

	const failure = toApiFailure(payload);
	expect(failure.kind).toBe('validation');
	expect(failure.status).toBe(422);
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

	const failure = toApiFailure(payload);
	expect(failure.kind).toBe('problem');
	expect(failure.status).toBe(501);
});

test('maps transport-level error when body is missing and fallback is responseStatusCode', () => {
	const payload = {
		responseStatusCode: 400,
		detail: 'transport detail',
		title: 'transport title',
	};

	const failure = toApiFailure(payload);
	expect(failure.kind).toBe('problem');
	expect(failure.status).toBe(400);
	expect(failure.detail).toBe('transport detail');
	expect(failure.title).toBe('transport title');
});

test('maps fallback status to 500 when no status-like fields are available', () => {
	const payload = {
		detail: 'unresolved',
	};

	const failure = toApiFailure(payload);
	expect(failure.kind).toBe('problem');
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

	const failure = toApiFailure(payload);
	expect(failure.kind).toBe('validation');
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
