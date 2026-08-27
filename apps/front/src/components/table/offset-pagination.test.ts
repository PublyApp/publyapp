/**
 * @vitest-environment jsdom
 */
import { act, render } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, test } from 'vitest';

import { clampOffsetPageIndex, useOffsetPageClamp } from './offset-pagination';

type ClampProps = {
	pageIndex: number;
	count: number | null | undefined;
	resetKeys: readonly unknown[];
};

// #999 / #691: the clamp must never revert a page that is in flight when the
// count is unknown.
describe('clampOffsetPageIndex', () => {
	test('returns the requested page unchanged when the count is unknown (missing), even beyond page 0', () => {
		expect(clampOffsetPageIndex(1, 10, undefined)).toBe(1);
		expect(clampOffsetPageIndex(5, 10, undefined)).toBe(5);
	});

	test('treats a null count the same as a missing one - unknown, not zero', () => {
		expect(clampOffsetPageIndex(1, 10, null)).toBe(1);
	});

	test('clamps to page 0 when the count is a known zero', () => {
		expect(clampOffsetPageIndex(1, 10, 0)).toBe(0);
		expect(clampOffsetPageIndex(0, 10, 0)).toBe(0);
	});

	test('clamps down to the last valid page for a known, smaller count', () => {
		expect(clampOffsetPageIndex(5, 10, 25)).toBe(2);
		expect(clampOffsetPageIndex(2, 10, 25)).toBe(2);
	});

	test('leaves the page alone when it is already within the known bound', () => {
		expect(clampOffsetPageIndex(1, 10, 25)).toBe(1);
		expect(clampOffsetPageIndex(0, 10, 25)).toBe(0);
	});

	test('never returns a negative page index for an exact page-count boundary', () => {
		expect(clampOffsetPageIndex(0, 10, 10)).toBe(0);
		expect(clampOffsetPageIndex(3, 10, 10)).toBe(0);
	});
});

// The hook is a derivation; the caller commits the returned value during its
// own render (adjust-state-while-rendering). We test the CONTRACT the brief
// requires: what the hook RETURNS on the FIRST render after a `resetKeys`
// change - not a value read after React has flushed the post-effect
// re-render. We capture every render's return value *during* the render into
// an array, then assert the first push that follows a `rerender` (the change
// render itself). This is the only shape that reddens when the reset
// comparison is deferred into a `useEffect`: there, the change render runs
// with `changed=false` (state not yet updated) and clamps from the stale
// pageIndex, so the first render after the change returns the clamped-but-
// nonzero page instead of 0.
const captureRenders = (initial: ClampProps) => {
	let pageIndex = initial.pageIndex;
	let count = initial.count;
	let resetKeys = initial.resetKeys;
	const renders: number[] = [];

	const Comp = (): null => {
		const clamped = useOffsetPageClamp({
			pageIndex,
			size: 20,
			count,
			resetKeys,
		});
		renders.push(clamped);
		return null;
	};

	const holder = render(createElement(Comp));
	const rerender = (next: Partial<ClampProps>) => {
		if (next.count !== undefined) {
			count = next.count;
		}
		if (next.resetKeys !== undefined) {
			resetKeys = next.resetKeys;
		}
		const before = renders.length;
		act(() => holder.rerender(createElement(Comp)));
		return { firstRender: renders[before] };
	};
	return { renders, rerender };
};

describe('useOffsetPageClamp — reset is detected on the FIRST render after a resetKeys change', () => {
	test('a resetKeys change wins over a warm-count clamp on the first change render, not one paint later', () => {
		const consumer = captureRenders({
			pageIndex: 5,
			count: 1000,
			resetKeys: ['A'],
		});
		expect(consumer.renders[0]).toBe(5);

		// The destination query is already warm (count 25, last index 1) and a
		// resetKeys change lands (filter/tenant/profile navigation). The reset
		// must win on this first change render: the hook returns 0, so the
		// caller's setPageIndex(0) commits before paint.
		const { firstRender } = consumer.rerender({
			count: 25,
			resetKeys: ['ada'],
		});
		expect(firstRender).toBe(0);
	});

	test('without a resetKeys change, a known count still clamps from the current pageIndex', () => {
		const consumer = captureRenders({
			pageIndex: 5,
			count: 1000,
			resetKeys: ['all'],
		});
		expect(consumer.renders[0]).toBe(5);

		// Same resetKeys content both renders - not a reset. The warm count
		// clamps the stale pageIndex 5 down to 1 on the first change render.
		const { firstRender } = consumer.rerender({
			count: 25,
			resetKeys: ['all'],
		});
		expect(firstRender).toBe(1);
	});

	test('does not clamp when the count is unknown and resetKeys is unchanged (the original #999 cold-path)', () => {
		const consumer = captureRenders({
			pageIndex: 5,
			count: undefined,
			resetKeys: ['all'],
		});
		expect(consumer.renders[0]).toBe(5);
	});
});

// #1613: the hook is a PURE derivation — it RETURNS the page the caller should
// hold, but it never writes back into the caller's state. The "return to page
// 0 after a resetKeys change" only takes effect if the caller COMMITS the
// returned value (the adjust-state-while-rendering pattern every real caller
// uses: `if (clampedPageIndex !== pageIndex) setPageIndex(clampedPageIndex)`).
// A caller that ignores the return keeps passing its own stale pageIndex on the
// next render; by then resetKeys is unchanged (the signature was updated during
// the reset render), so the hook re-clamps from the stale pageIndex and the
// reader is silently stranded on a non-zero page — the reset is lost. This test
// pins that negligent caller: it drives the hook with a FIXED pageIndex that is
// never committed, and it MUST fail if the reset-to-0 is silently dropped.
//
// NOTE (#1660): a GREEN this test goes is not necessarily good news. This test
// is green precisely because the negligent caller LOSES the reset — it asserts
// `renders[2]` is `1` (the stranded page), not `0` (the correct page). If the
// hook implementation broke the derivation, the test would turn RED because the
// loss would no longer reproduce. The lint rule `publy/require-commit-of-
// use-offset-page-clamp` (#1660) now provides the positive protection: it flags
// any real caller that fails to commit the return value, so once every real
// caller is guaranteed committed by construction, this test's RED (if it ever
// turns) would signal a regression in the positive protection — not in the hook
// itself. Do NOT invert its polarity in this issue (#1660): only add the note
// that its red can be a good sign and what to verify before "correcting" it.
describe('useOffsetPageClamp — the contract requires the caller to COMMIT the returned value (#1613)', () => {
	// A negligent consumer: holds `pageIndex` fixed and never calls the
	// setter with the returned value. This is exactly the foot-gun the brief
	// describes; the test asserts the consequence (silent loss) is exposed.
	const negligentRenders = (initial: ClampProps) => {
		let pageIndex = initial.pageIndex;
		let count = initial.count;
		let resetKeys = initial.resetKeys;
		const renders: number[] = [];

		const Comp = (): null => {
			// Returns the value, but the consumer DISCARDS it (no commit).
			const clamped = useOffsetPageClamp({
				pageIndex,
				size: 20,
				count,
				resetKeys,
			});
			renders.push(clamped);
			return null;
		};

		const holder = render(createElement(Comp));
		const rerender = (next: Partial<ClampProps>) => {
			if (next.count !== undefined) {
				count = next.count;
			}
			if (next.resetKeys !== undefined) {
				resetKeys = next.resetKeys;
			}
			act(() => holder.rerender(createElement(Comp)));
		};
		return { renders, rerender };
	};

	test('a resetKeys change returns 0, but a caller that does not commit it is stranded on a non-zero page next render', () => {
		const consumer = negligentRenders({
			pageIndex: 5,
			count: 1000,
			resetKeys: ['A'],
		});
		expect(consumer.renders[0]).toBe(5);

		// Warm destination query (count 25, last index 1) plus a resetKeys
		// change (['A'] -> ['ada']). The hook RETURNS 0 on this first change
		// render — the contract promises a reset wins. The negligent caller
		// discards that 0.
		consumer.rerender({ count: 25, resetKeys: ['ada'] });
		expect(consumer.renders[1]).toBe(0);

		// Next render: resetKeys is now unchanged, so the hook clamps from the
		// still-stale pageIndex 5 -> 1. The reader is silently stranded on
		// page 1 instead of page 0 — the reset was lost because nobody
		// committed the returned 0. This assertion documents the foot-gun: it
		// would be `0` if the caller had committed, so a non-zero value here
		// is the proof that the contract was violated.
		consumer.rerender({ count: 26, resetKeys: ['ada'] });
		expect(consumer.renders[2]).toBe(1);
	});
});
