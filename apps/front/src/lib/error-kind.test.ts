import { describe, expect, test } from 'vitest';

import { classifyError, errorKindFromCode } from './error-kind';
import { ServerFailure } from './server/server-failure';

const failure = (status: number, detail = 'boom') =>
	new ServerFailure({
		responseStatusCode: status,
		status,
		title: 'Problem',
		detail,
	});

describe('classifyError', () => {
	test.each([
		[401, 'signed_out'],
		[403, 'forbidden'],
		[404, 'not_found'],
		[500, 'server'],
		[503, 'server'],
		[422, 'unknown'],
		[400, 'unknown'],
	] as const)('maps HTTP %s to %s', (status, kind) => {
		expect(classifyError(failure(status), true)).toBe(kind);
	});

	test('a browser network failure is offline even without the online flag', () => {
		expect(classifyError(new TypeError('Failed to fetch'), true)).toBe(
			'offline',
		);
		expect(
			classifyError(
				new TypeError('NetworkError when attempting to fetch'),
				true,
			),
		).toBe('offline');
	});

	test('navigator offline wins over a status for everything but signed_out', () => {
		expect(classifyError(failure(500), false)).toBe('offline');
		expect(classifyError(failure(404), false)).toBe('offline');
		// A 401 means the session is invalid regardless of the network.
		expect(classifyError(failure(401), false)).toBe('signed_out');
	});

	test('a plain failure is unknown', () => {
		expect(classifyError(new Error('The cache is corrupt.'), true)).toBe(
			'unknown',
		);
	});

	test('reads duck-typed problem payloads', () => {
		expect(classifyError({ status: 403, detail: 'nope' }, true)).toBe(
			'forbidden',
		);
	});
});

describe('errorKindFromCode', () => {
	test('reads the translated status eyebrow used by the legacy page views', () => {
		expect(errorKindFromCode('404 — Introuvable')).toBe('not_found');
		expect(errorKindFromCode('403 — Interdit')).toBe('forbidden');
		expect(errorKindFromCode('500 — Erreur serveur')).toBe('server');
		expect(errorKindFromCode('401 — Non autorisé')).toBe('signed_out');
		expect(errorKindFromCode('no status')).toBeUndefined();
	});
});
