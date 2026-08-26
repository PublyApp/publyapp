import { expect, test } from 'vitest';

import { checkIfEmptyQueryData } from './query-state';

test('returns false while query is pending even with empty data', () => {
	const query = { data: undefined, isPending: true };
	expect(checkIfEmptyQueryData(query)).toBe(false);
});

test('returns true for non-pending query with undefined data', () => {
	const query = { data: undefined, isPending: false };
	expect(checkIfEmptyQueryData(query)).toBe(true);
});

test('returns true for non-pending query with null data', () => {
	const query = { data: null, isPending: false };
	expect(checkIfEmptyQueryData(query)).toBe(true);
});

test('returns true for non-pending query with empty array', () => {
	const query = { data: [], isPending: false };
	expect(checkIfEmptyQueryData(query)).toBe(true);
});
