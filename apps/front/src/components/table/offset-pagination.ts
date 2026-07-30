import { useEffect, useRef } from 'react';

/**
 * A missing item count means "unknown", not "zero" (#999). A page query's
 * `count` is briefly `undefined` while the destination page is in flight —
 * during a cold cache, a slow response, or a large tenant where the count
 * query lags the page query. Treating that absence as zero makes a clamp
 * conclude "there are zero items" and revert the just-requested page back to
 * 0, producing a request sequence of `[0, 1, 0]` instead of `[0, 1]` and
 * silently undoing the user's Next click.
 *
 * Returns `pageIndex` unchanged whenever `count` is unknown. Only a genuinely
 * known total (including a real zero) may clamp the page down.
 */
export const clampOffsetPageIndex = (
	pageIndex: number,
	size: number,
	count: number | null | undefined,
): number => {
	if (count === undefined || count === null) {
		return pageIndex;
	}

	const lastPageIndex =
		count > 0 ? Math.max(Math.ceil(count / size) - 1, 0) : 0;

	return Math.min(pageIndex, lastPageIndex);
};

const areResetKeysEqual = (
	previous: readonly unknown[],
	next: readonly unknown[],
): boolean =>
	previous.length === next.length &&
	previous.every((value, index) => Object.is(value, next[index]));

/**
 * Wires `clampOffsetPageIndex` into a `pageIndex` state setter as the ONE
 * effect governing that state — the shared shape used by every
 * local-offset-pagination surface (as opposed to the cursor-history
 * pagination `useCursorPagination` owns), so the fix for #999 lives in one
 * place rather than being re-implemented (and re-drifted) per route.
 *
 * `resetKeys` names everything that means "the reader deliberately navigated
 * away from this listing" — tenant/profile identity, committed search, sort,
 * page size, and so on. It is deliberately folded into THIS effect rather
 * than left as a separate "reset pageIndex to 0" effect at the call site:
 * two separate effects both read the pre-update `pageIndex` from the same
 * render, so when a resetKey change lands in the same commit as a clamp
 * against an already-warm cached count for the destination query, the clamp
 * would win with a stale, clamped-but-nonzero page instead of the intended
 * reset to page 0 (review follow-up to #999 - a warm cache, not just a
 * missing count, can strand the reader on the wrong page). Folding both into
 * one effect makes "reset wins" true by construction: a resetKeys change
 * always clamps from page 0, never from the stale pageIndex.
 */
export const useOffsetPageClamp = ({
	pageIndex,
	setPageIndex,
	size,
	count,
	resetKeys,
}: {
	pageIndex: number;
	setPageIndex: (nextPageIndex: number) => void;
	size: number;
	count: number | null | undefined;
	resetKeys: readonly unknown[];
}): void => {
	const previousResetKeysRef = useRef(resetKeys);

	useEffect(() => {
		const resetKeysChanged = !areResetKeysEqual(
			previousResetKeysRef.current,
			resetKeys,
		);
		previousResetKeysRef.current = resetKeys;

		const basePageIndex = resetKeysChanged ? 0 : pageIndex;
		const clamped = clampOffsetPageIndex(basePageIndex, size, count);

		if (clamped !== pageIndex) {
			setPageIndex(clamped);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps -- resetKeys is a variable-length array spread into this static-shaped effect (each call site always passes the same number of keys); setPageIndex identity is not part of the trigger condition
	}, [...resetKeys, pageIndex, size, count]);
};
