import { describe, expect, test } from 'vitest';

import {
	countSelected,
	fromTableSelection,
	pruneSelection,
	toTableSelection,
} from './use-row-selection';

describe('pruneSelection', () => {
	test('drops entries for row ids no longer visible', () => {
		const selection = { 'row-1': true, 'row-2': true, 'row-3': true };
		expect(pruneSelection(selection, ['row-1', 'row-3'])).toEqual({
			'row-1': true,
			'row-3': true,
		});
	});

	test('returns the same reference when nothing changes', () => {
		const selection = { 'row-1': true };
		expect(pruneSelection(selection, ['row-1', 'row-2'])).toBe(selection);
	});

	test('clears everything when nothing is visible', () => {
		const selection = { 'row-1': true, 'row-2': true };
		expect(pruneSelection(selection, [])).toEqual({});
	});
});

describe('countSelected', () => {
	test('counts only truthy entries', () => {
		expect(countSelected({ a: true, b: false, c: true })).toBe(2);
		expect(countSelected({})).toBe(0);
	});
});

describe('toTableSelection / fromTableSelection', () => {
	test('round-trips a specific set of ids', () => {
		const selection = { 'row-1': true, 'row-2': true };
		const tableSelection = toTableSelection(selection);
		expect(tableSelection).toEqual(new Set(['row-1', 'row-2']));

		expect(
			fromTableSelection(tableSelection, ['row-1', 'row-2', 'row-3']),
		).toEqual({
			'row-1': true,
			'row-2': true,
		});
	});

	test('"all" selection maps to every visible row id', () => {
		expect(fromTableSelection('all', ['row-1', 'row-2'])).toEqual({
			'row-1': true,
			'row-2': true,
		});
	});

	test('an empty Set clears selection', () => {
		expect(fromTableSelection(new Set(), ['row-1'])).toEqual({});
	});

	test('ignores keys not present in visible rows', () => {
		expect(
			fromTableSelection(new Set(['row-1', 'row-3']), ['row-1', 'row-2']),
		).toEqual({
			'row-1': true,
		});
	});
});
