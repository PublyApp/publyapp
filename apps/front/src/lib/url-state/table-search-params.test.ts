import { describe, expect, test } from 'vitest';

import {
	parseTableSearchParams,
	serializeTableSearchParams,
} from './table-search-params';

describe('parseTableSearchParams', () => {
	test('parses all supported fields with trimming', () => {
		const parsed = parseTableSearchParams({
			q: ' alpha ',
			sort_id: ' created_at ',
			sort_order: ' desc ',
			cursor: ' cursor-token ',
			size: ' 25 ',
		});

		expect(parsed).toEqual({
			q: 'alpha',
			sortId: 'created_at',
			sortOrder: 'desc',
			cursor: 'cursor-token',
			size: 25,
		});
	});

	test('removes empty string values', () => {
		expect(parseTableSearchParams({ q: '   ' })).toEqual({});
		expect(
			parseTableSearchParams({
				sort_id: '   ',
				cursor: '\n',
				sort_order: '   ',
				size: '   ',
			}),
		).toEqual({});
	});

	test('removes invalid sort order values', () => {
		expect(
			parseTableSearchParams({
				sort_order: 'ascending',
			}),
		).toEqual({});

		expect(
			parseTableSearchParams({
				sort_order: 'ASC',
			}),
		).toEqual({});
	});

	test('parses size from number and string', () => {
		expect(parseTableSearchParams({ size: 20 })).toEqual({ size: 20 });
		expect(parseTableSearchParams({ size: '30' })).toEqual({ size: 30 });
	});

	test('removes invalid size values', () => {
		expect(parseTableSearchParams({ size: 0 })).toEqual({});
		expect(parseTableSearchParams({ size: -1 })).toEqual({});
		expect(parseTableSearchParams({ size: 1.5 })).toEqual({});
		expect(parseTableSearchParams({ size: Number.POSITIVE_INFINITY })).toEqual(
			{},
		);
		expect(parseTableSearchParams({ size: Number.NaN })).toEqual({});
		expect(parseTableSearchParams({ size: ['10'] })).toEqual({});
		expect(parseTableSearchParams({ size: { count: '10' } })).toEqual({});
		expect(parseTableSearchParams({ size: null })).toEqual({});
		expect(parseTableSearchParams({})).toEqual({});
	});

	test('falls back to the default for a size above the largest page-size option', () => {
		expect(parseTableSearchParams({ size: 500 })).toEqual({});
		expect(parseTableSearchParams({ size: '100000' })).toEqual({});
		expect(parseTableSearchParams({ size: 100 })).toEqual({ size: 100 });
	});
});

describe('serializeTableSearchParams', () => {
	test('serializes using snake_case keys only', () => {
		const serialized = serializeTableSearchParams({
			q: 'alpha',
			sortId: 'created_at',
			sortOrder: 'asc',
			cursor: 'cursor-token',
			size: 20,
		});

		expect(serialized).toEqual({
			q: 'alpha',
			sort_id: 'created_at',
			sort_order: 'asc',
			cursor: 'cursor-token',
			size: 20,
		});
		expect(Object.keys(serialized)).toEqual([
			'q',
			'sort_id',
			'sort_order',
			'cursor',
			'size',
		]);
	});

	test('omits undefined and empty values', () => {
		expect(
			serializeTableSearchParams({
				q: undefined,
				sortId: undefined,
				sortOrder: undefined,
				cursor: undefined,
				size: undefined,
			}),
		).toEqual({});

		expect(serializeTableSearchParams({ q: '   ' })).toEqual({});
	});
});

describe('parse/serialize round-trip', () => {
	test('normalizes values consistently', () => {
		const original = {
			q: '  alpha  ',
			sort_id: ' created_at ',
			sort_order: ' DESC ',
			cursor: '  cursor-token ',
			size: ' 11 ',
		};

		const parsed = parseTableSearchParams(original);
		const serialized = serializeTableSearchParams(parsed);
		const roundTripped = parseTableSearchParams(serialized);

		expect(roundTripped).toEqual(parsed);
	});
});
