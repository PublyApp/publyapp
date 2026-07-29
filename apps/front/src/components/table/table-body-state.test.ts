import { describe, expect, test } from 'vitest';

import { resolveTableBodyState } from './table-body-state';

describe('resolveTableBodyState', () => {
	test('loading takes priority over everything else', () => {
		expect(
			resolveTableBodyState({
				isPending: true,
				isError: true,
				rowCount: 5,
				hasActiveSearch: true,
			}),
		).toBe('loading');
	});

	test('error takes priority over row count once not pending', () => {
		expect(
			resolveTableBodyState({
				isPending: false,
				isError: true,
				rowCount: 5,
				hasActiveSearch: false,
			}),
		).toBe('error');
	});

	test('zero rows with no active search is empty', () => {
		expect(
			resolveTableBodyState({
				isPending: false,
				isError: false,
				rowCount: 0,
				hasActiveSearch: false,
			}),
		).toBe('empty');
	});

	test('zero rows with an active search is no-match', () => {
		expect(
			resolveTableBodyState({
				isPending: false,
				isError: false,
				rowCount: 0,
				hasActiveSearch: true,
			}),
		).toBe('no-match');
	});

	test('rows render once data exists', () => {
		expect(
			resolveTableBodyState({
				isPending: false,
				isError: false,
				rowCount: 3,
				hasActiveSearch: true,
			}),
		).toBe('rows');
	});
});
