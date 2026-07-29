import { describe, expect, test } from 'vitest';

import {
	fromTableSortDescriptor,
	toSortingState,
	toTableSortDescriptor,
} from './sort-descriptor';

describe('toSortingState', () => {
	test('maps asc/desc to TanStack desc boolean', () => {
		expect(toSortingState({ id: 'level', order: 'asc' })).toEqual([
			{ id: 'level', desc: false },
		]);
		expect(toSortingState({ id: 'level', order: 'desc' })).toEqual([
			{ id: 'level', desc: true },
		]);
	});
});

describe('toTableSortDescriptor', () => {
	test('maps the primary sort entry to a table sort descriptor', () => {
		expect(toTableSortDescriptor([{ id: 'level', desc: true }])).toEqual({
			column: 'level',
			direction: 'descending',
		});
		expect(toTableSortDescriptor([{ id: 'level', desc: false }])).toEqual({
			column: 'level',
			direction: 'ascending',
		});
	});

	test('returns undefined for an empty sorting state', () => {
		expect(toTableSortDescriptor([])).toBeUndefined();
	});
});

describe('fromTableSortDescriptor', () => {
	test('maps a table sort descriptor back to sort state', () => {
		expect(
			fromTableSortDescriptor({ column: 'level', direction: 'ascending' }),
		).toEqual({ id: 'level', order: 'asc' });
		expect(
			fromTableSortDescriptor({ column: 'level', direction: 'descending' }),
		).toEqual({ id: 'level', order: 'desc' });
	});

	test('returns undefined when there is no column', () => {
		expect(fromTableSortDescriptor(undefined)).toBeUndefined();
		expect(
			fromTableSortDescriptor({ column: '', direction: 'ascending' }),
		).toBeUndefined();
	});

	test('round-trips through toSortingState/toTableSortDescriptor', () => {
		const sort = { id: 'status', order: 'desc' as const };
		const descriptor = toTableSortDescriptor(toSortingState(sort));
		expect(fromTableSortDescriptor(descriptor)).toEqual(sort);
	});
});
