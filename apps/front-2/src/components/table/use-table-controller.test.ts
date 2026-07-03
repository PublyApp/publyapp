import { describe, expect, test } from 'vitest';
import type { TableSearchParams } from '~/lib/url-state/table-search-params';

import {
	buildSearchCommitSearch,
	buildSizeChangeSearch,
	buildSortChangeSearch,
	resolveSize,
	resolveSort,
} from './use-table-controller';

const DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const DEFAULT_SIZE = 25;

describe('resolveSort / resolveSize', () => {
	test('falls back to defaults when the URL has no sort/size', () => {
		expect(resolveSort({}, DEFAULT_SORT)).toEqual(DEFAULT_SORT);
		expect(resolveSize({}, DEFAULT_SIZE)).toBe(DEFAULT_SIZE);
	});

	test('prefers URL state over defaults', () => {
		const search: TableSearchParams = {
			sortId: 'level',
			sortOrder: 'asc',
			size: 10,
		};
		expect(resolveSort(search, DEFAULT_SORT)).toEqual({
			id: 'level',
			order: 'asc',
		});
		expect(resolveSize(search, DEFAULT_SIZE)).toBe(10);
	});
});

describe('buildSortChangeSearch', () => {
	test('writes the new sort and always drops cursor', () => {
		const search: TableSearchParams = { q: 'alpha', cursor: 'stale-cursor' };
		expect(
			buildSortChangeSearch(search, { id: 'level', order: 'asc' }),
		).toEqual({
			q: 'alpha',
			cursor: undefined,
			sortId: 'level',
			sortOrder: 'asc',
		});
	});

	test('clearing the sort clears both sortId and sortOrder', () => {
		const search: TableSearchParams = { sortId: 'level', sortOrder: 'asc' };
		expect(buildSortChangeSearch(search, undefined)).toEqual({
			sortId: undefined,
			sortOrder: undefined,
			cursor: undefined,
		});
	});
});

describe('buildSizeChangeSearch', () => {
	test('writes the new size and drops cursor', () => {
		const search: TableSearchParams = { size: 10, cursor: 'stale-cursor' };
		expect(buildSizeChangeSearch(search, 50)).toEqual({
			size: 50,
			cursor: undefined,
		});
	});
});

describe('buildSearchCommitSearch', () => {
	test('trims and writes q, drops cursor', () => {
		const search: TableSearchParams = {
			sortId: 'level',
			cursor: 'stale-cursor',
		};
		expect(buildSearchCommitSearch(search, '  alpha  ')).toEqual({
			sortId: 'level',
			cursor: undefined,
			q: 'alpha',
		});
	});

	test('an empty/whitespace-only value clears q to undefined, not empty string', () => {
		const search: TableSearchParams = { q: 'alpha' };
		expect(buildSearchCommitSearch(search, '   ')).toEqual({
			q: undefined,
			cursor: undefined,
		});
		expect(buildSearchCommitSearch(search, '')).toEqual({
			q: undefined,
			cursor: undefined,
		});
	});
});
