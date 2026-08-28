/**
 * @vitest-environment jsdom
 *
 * KEPT RED TEST — bug: resetKeysSignature collision (#1672).
 *
 * The `resetKeysSignature` helper in `offset-pagination.ts` joins reset key
 * values with `|` as a separator, but does NOT escape `|` inside individual
 * values. Two different arrays of reset keys can therefore produce the same
 * signature string, causing `useOffsetPageClamp` to fail to detect that the
 * reset keys genuinely changed — and silently NOT reset the reader to page 0.
 *
 * This test FAILS against the current (buggy) code: it drives the hook with
 * two different resetKeys arrays that collide under the current signature
 * function, and asserts the hook detects the change (returns 0 on the change
 * render). With the bug present, the signature is identical, so the hook
 * thinks nothing changed and returns the stale clamped page (1) instead of 0.
 *
 * Replay:
 *   pnpm --filter front exec vitest run --config vitest.preuves.config.ts \
 *     tests/proofs/1672/red-1672-reset-keys-signature-collision.test.tsx
 *
 * Expected: FAIL — `expected 1 to be 0` on the change render.
 *
 * Mutation to introduce the red:
 *   Replace the `resetKeysSignature` body so it escapes `|` in values:
 *
 *   Before (buggy):
 *     `${resetKeys.length}:${resetKeys
 *       .map((value) => (typeof value === 'string' ? value : String(value)))
 *       .join('|')}`
 *
 *   After (fixed):
 *     `${resetKeys.length}:${resetKeys
 *       .map((value) => (typeof value === 'string' ? value : String(value)).replace(/\|/g, '\\|'))
 *       .join('|')}`
 *
 * This is NOT a proof-of-limitation case — the hook CAN distinguish these two
 * key sets if the signature function escapes the separator. The fix is a
 * one-line change to `resetKeysSignature`.
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
		act(() => holder.rerender(createElement(Comp)));
	};
	return { renders, rerender };
};

describe('useOffsetPageClamp — RED: resetKeysSignature collision lets a genuine reset go undetected (#1672)', () => {
	test('two different resetKeys arrays with colliding signatures both reset to page 0', () => {
		// keysA = ['a', 'b|c']  -> signature: "2:a|b|c"
		// keysB = ['a|b', 'c']  -> signature: "2:a|b|c"  (COLLISION!)
		//
		// The resetKeys content genuinely changed, but the signature is
		// identical, so the hook sees resetKeysChanged = false and does NOT
		// reset to page 0.
		const consumer = captureRenders({
			pageIndex: 5,
			count: 1000,
			resetKeys: ['a', 'b|c'],
		});
		expect(consumer.renders[0]).toBe(5);

		// Warm destination query (count 25, last index 1) and a genuine
		// resetKeys change to a DIFFERENT array that collides under the
		// buggy signature. The hook SHOULD detect the change and return 0.
		consumer.rerender({ count: 25, resetKeys: ['a|b', 'c'] });

		// IDEAL: the reset wins — the hook returns 0 on the first change render.
		// BUGGY: the signature is identical ("2:a|b|c"), so the hook thinks
		// nothing changed and clamps from the stale pageIndex 5 -> 1.
		expect(consumer.renders[1]).toBe(0);
	});
});
