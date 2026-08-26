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

type UseOffsetPageClampOptions = {
	pageIndex: number;
	size: number;
	count: number | null | undefined;
	resetKeys: readonly unknown[];
};

/**
 * Pure derivation of the pageIndex that should actually be used, given the
 * caller's current intent (`pageIndex`) and the destination query's known
 * count. The caller owns the state; this hook returns the value to commit
 * and the caller uses React's documented adjust-state-while-rendering
 * pattern to apply it (the same pattern `useCursorPagination` uses for
 * generation changes and the table-controller uses for the search draft).
 *
 * `resetKeys` names everything that means "the reader deliberately navigated
 * away from this listing" — tenant/profile identity, committed search, sort,
 * page size, and so on. It is deliberately folded into THIS derivation
 * rather than left as a separate "reset pageIndex to 0" effect at the call
 * site: two separate rules would both read the pre-update `pageIndex` from
 * the same render, so when a resetKey change lands in the same commit as a
 * clamp against an already-warm cached count for the destination query, the
 * clamp would win with a stale, clamped-but-nonzero page instead of the
 * intended reset to page 0 (review follow-up to #999 - a warm cache, not
 * just a missing count, can strand the reader on the wrong page). Folding
 * both into one in-render derivation makes "reset wins" true by
 * construction: a resetKeys change always clamps from page 0, never from
 * the stale pageIndex.
 *
 * #691: the previous shape of this hook called `setPageIndex(clamped)` from
 * a `useEffect` to push the clamped value back up to the parent's state.
 * That violated `no-pass-live-state-to-parent` / `no-pass-data-to-parent`:
 * a child hook cannot mutate a parent's state, and the parent would
 * re-render with the clamped value one frame later than the children that
 * read `pageIndex` directly, producing a stale-paint flicker after the
 * count landed. The hook is now a pure derivation: the caller calls
 * `setPageIndex(clamped)` from inside its own render, in the
 * adjust-state-while-rendering pattern, so the new pageIndex is committed
 * before the same render's paint — no post-paint effect, no
 * parent-state mutation from a child.
 */
export const useOffsetPageClamp = ({
	pageIndex,
	size,
	count,
	resetKeys,
}: UseOffsetPageClampOptions): number => {
	const previousResetKeysRef = useRef(resetKeys);

	const resetKeysChanged = !areResetKeysEqual(
		previousResetKeysRef.current,
		resetKeys,
	);
	// Commit the latest resetKeys to the ref AFTER the render commits -
	// writing during render triggers `no-ref-current-in-render`. The
	// in-render derivation above only READS the ref, so the next render
	// sees the most recent value.
	useEffect(() => {
		previousResetKeysRef.current = resetKeys;
	}, [resetKeys]);

	const basePageIndex = resetKeysChanged ? 0 : pageIndex;
	return clampOffsetPageIndex(basePageIndex, size, count);
};
