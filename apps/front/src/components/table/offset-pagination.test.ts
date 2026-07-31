/**
 * @vitest-environment jsdom
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { clampOffsetPageIndex, useOffsetPageClamp } from './offset-pagination';

describe('clampOffsetPageIndex', () => {
	// #999: the actual defect — a page in flight (count not yet known) must
	// never be reverted, even though `pageIndex` is now "beyond" a stale
	// zero-derived bound.
	test('returns the requested page unchanged when the count is unknown (missing), even beyond page 0', () => {
		expect(clampOffsetPageIndex(1, 10, undefined)).toBe(1);
		expect(clampOffsetPageIndex(5, 10, undefined)).toBe(5);
	});

	// The generated client types `count` as `number | null` — a `null` wire
	// value is defensive typing, not a business "zero"; treat it the same as
	// "unknown" rather than inventing a third meaning.
	test('treats a null count the same as a missing one — unknown, not zero', () => {
		expect(clampOffsetPageIndex(1, 10, null)).toBe(1);
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

type ClampProps = {
	pageIndex: number;
	count: number | null | undefined;
	resetKeys: readonly unknown[];
};

describe('useOffsetPageClamp', () => {
	// Review follow-up to #999: all three call sites used to run a SEPARATE
	// "reset pageIndex to 0" effect immediately before this hook. Both effects
	// read the pre-update (stale) pageIndex from the same render, so when a
	// resetKeys change (filter/sort/size/tenant/profile) landed in the same
	// commit as a clamp against an ALREADY-WARM cached count for the
	// destination query, the clamp won with a stale, clamped-but-nonzero page
	// instead of the intended reset to page 0. Folding the reset into this
	// hook's own resetKeys makes "reset wins" true by construction: this test
	// simulates the exact race (pageIndex has not yet been re-rendered to 0
	// when the resetKeys change and the new count is already known) and
	// proves the reset — not the clamp — determines the outcome.
	test('a resetKeys change wins over a clamp derived from an already-known (warm) count, even before pageIndex itself has been reset', () => {
		const setPageIndex = vi.fn();
		const { rerender } = renderHook(
			(props: ClampProps) =>
				useOffsetPageClamp({
					pageIndex: props.pageIndex,
					setPageIndex,
					size: 20,
					count: props.count,
					resetKeys: props.resetKeys,
				}),
			{ initialProps: { pageIndex: 5, count: 1000, resetKeys: ['all'] } },
		);

		expect(setPageIndex).not.toHaveBeenCalled();

		// The resetKeys changed (a filter committed), but pageIndex is still
		// the stale 5 from before the change — the destination query is
		// already warm with count=25 (last page index 1 at size 20), smaller
		// than 5 but not 0. A clamp-from-stale-pageIndex bug would land on 1.
		rerender({ pageIndex: 5, count: 25, resetKeys: ['ada'] });

		expect(setPageIndex).toHaveBeenCalledWith(0);
		expect(setPageIndex).not.toHaveBeenCalledWith(1);
		expect(setPageIndex).toHaveBeenCalledTimes(1);
	});

	test('without a resetKeys change, a known count still clamps from the current pageIndex (ordinary in-place clamp is unaffected)', () => {
		const setPageIndex = vi.fn();
		const { rerender } = renderHook(
			(props: ClampProps) =>
				useOffsetPageClamp({
					pageIndex: props.pageIndex,
					setPageIndex,
					size: 20,
					count: props.count,
					resetKeys: props.resetKeys,
				}),
			{ initialProps: { pageIndex: 5, count: 1000, resetKeys: ['all'] } },
		);

		// Same resetKeys value (by content) both renders — not a reset.
		rerender({ pageIndex: 5, count: 25, resetKeys: ['all'] });

		expect(setPageIndex).toHaveBeenCalledWith(1);
		expect(setPageIndex).not.toHaveBeenCalledWith(0);
	});

	test('does not clamp when the count is unknown and resetKeys is unchanged (the original #999 cold-path fix)', () => {
		const setPageIndex = vi.fn();
		renderHook(() =>
			useOffsetPageClamp({
				pageIndex: 5,
				setPageIndex,
				size: 20,
				count: undefined,
				resetKeys: ['all'],
			}),
		);

		expect(setPageIndex).not.toHaveBeenCalled();
	});
});
