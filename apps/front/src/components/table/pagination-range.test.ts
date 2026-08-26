import { describe, expect, test } from 'vitest';

import { derivePaginationRange } from './pagination-range';

describe('derivePaginationRange (#282 honesty matrix)', () => {
	test('a known total yields start–end of total', () => {
		expect(
			derivePaginationRange({
				pageIndex: 1,
				size: 20,
				pageRowCount: 20,
				totalCount: 137,
			}),
		).toEqual({ kind: 'known-total', start: 21, end: 40, total: 137 });
	});

	test.each([undefined, null] as const)(
		'an absent total (%s) is UNKNOWN, never zero',
		(totalCount) => {
			expect(
				derivePaginationRange({
					pageIndex: 1,
					size: 20,
					pageRowCount: 20,
					totalCount,
				}),
			).toEqual({ kind: 'unknown-total', start: 21, end: 40 });
		},
	);

	test('only an explicit zero is a genuine zero', () => {
		expect(
			derivePaginationRange({
				pageIndex: 0,
				size: 20,
				pageRowCount: 0,
				totalCount: 0,
			}),
		).toEqual({ kind: 'zero' });
	});

	test('a partial last page ends at the rendered row count, not the page size', () => {
		expect(
			derivePaginationRange({
				pageIndex: 6,
				size: 20,
				pageRowCount: 17,
				totalCount: 137,
			}),
		).toEqual({ kind: 'known-total', start: 121, end: 137, total: 137 });
	});
});
