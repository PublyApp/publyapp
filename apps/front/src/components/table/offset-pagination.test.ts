import { describe, expect, test } from 'vitest';

import { clampOffsetPageIndex } from './offset-pagination';

describe('clampOffsetPageIndex', () => {
	// #999: the actual defect — a page in flight (count not yet known) must
	// never be reverted, even though `pageIndex` is now "beyond" a stale
	// zero-derived bound.
	test('returns the requested page unchanged when the count is unknown (missing), even beyond page 0', () => {
		expect(clampOffsetPageIndex(1, 10, undefined)).toBe(1);
		expect(clampOffsetPageIndex(5, 10, undefined)).toBe(5);
	});

	// A missing count and a real zero are different states (#999) — only a
	// genuinely known zero total clamps back to page 0.
	test('clamps to page 0 when the count is a known zero', () => {
		expect(clampOffsetPageIndex(1, 10, 0)).toBe(0);
		expect(clampOffsetPageIndex(0, 10, 0)).toBe(0);
	});

	test('clamps down to the last valid page for a known, smaller count', () => {
		// 25 items at size 10 → pages [0, 1, 2] (last page index 2).
		expect(clampOffsetPageIndex(5, 10, 25)).toBe(2);
		expect(clampOffsetPageIndex(2, 10, 25)).toBe(2);
	});

	test('leaves the page alone when it is already within the known bound', () => {
		expect(clampOffsetPageIndex(1, 10, 25)).toBe(1);
		expect(clampOffsetPageIndex(0, 10, 25)).toBe(0);
	});

	test('never returns a negative page index for an exact page-count boundary', () => {
		// 10 items at size 10 → exactly one page → last page index 0.
		expect(clampOffsetPageIndex(0, 10, 10)).toBe(0);
		expect(clampOffsetPageIndex(3, 10, 10)).toBe(0);
	});
});
