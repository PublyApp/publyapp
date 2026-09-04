/**
 * @vitest-environment jsdom
 *
 * KEPT RED TEST — issue #1613 / #1651.
 *
 * This test proves the negligent-caller loss is REAL: it asserts the IDEAL
 * (a resetKeys change should leave even a negligent caller on page 0) and
 * FAILS against the current hook. The hook is a PURE derivation — it returns
 * the page to display but never writes into the caller's state — so a caller
 * that discards the returned 0 is silently stranded on a non-zero page. That
 * failure is the proof; it is why this test lives under tests/proofs/ (excluded
 * from the main suite via vitest.proofs.config.ts) rather than in the suite
 * (it would be permanently red).
 *
 * Replay:
 *   pnpm --filter front exec vitest run --config vitest.proofs.config.ts \
 *     tests/proofs/1613/red-1613-negligent-caller-no-reset.test.ts
 *
 * Expected: FAIL — `expected 1 to be 0`. See .dump/preuve-1613-convention.md.
 */
import { act, render } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, test } from 'vitest';

import { useOffsetPageClamp } from '../../../src/components/table/offset-pagination';

type ClampProps = {
	pageIndex: number;
	count: number | null | undefined;
	resetKeys: readonly unknown[];
};

// A negligent consumer: holds `pageIndex` fixed and never commits the
// returned value. The hook returns the right thing; the caller throws it away.
const negligentRenders = (initial: ClampProps) => {
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
		act(() => holder.rerender(createElement(Comp)));
	};
	return { renders, rerender };
};

describe('useOffsetPageClamp — RED: a negligent caller loses the reset-to-0 (#1613)', () => {
	test('a caller that discards the returned reset-to-0 is stranded on a non-zero page — the reset does NOT stick without a commit', () => {
		const consumer = negligentRenders({
			pageIndex: 5,
			count: 1000,
			resetKeys: ['A'],
		});
		expect(consumer.renders[0]).toBe(5);

		// resetKeys change (['A'] -> ['ada']): the hook returns 0, the caller
		// discards it.
		consumer.rerender({ count: 25, resetKeys: ['ada'] });
		expect(consumer.renders[1]).toBe(0);

		// Next render: resetKeys unchanged, hook re-clamps from the stale
		// pageIndex 5 -> 1. The reset is lost because nobody committed the 0.
		//
		// The IDEAL would be 0 (the reset should win even for a negligent
		// caller). The ACTUAL is 1. This assertion therefore FAILS — and that
		// failure is the proof that the contract violation has a cost.
		consumer.rerender({ count: 26, resetKeys: ['ada'] });
		expect(consumer.renders[2]).toBe(0); // RED: actual is 1
	});
});
