import { describe, test } from 'vitest';

describe('REPRO 1784 — thrown Error containing AssertionError', () => {
	test('throws an Error whose message contains AssertionError', () => {
		throw new Error('AssertionError: something went wrong in the harness');
	});
});
