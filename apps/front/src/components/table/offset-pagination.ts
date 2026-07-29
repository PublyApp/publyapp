import { useEffect } from 'react';

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

/**
 * Wires `clampOffsetPageIndex` into a `pageIndex` state setter as an effect —
 * the shared shape used by every local-offset-pagination surface (as opposed
 * to the cursor-history pagination `useCursorPagination` owns), so the fix
 * for #999 lives in one place rather than being re-implemented per route.
 */
export const useOffsetPageClamp = ({
	pageIndex,
	setPageIndex,
	size,
	count,
}: {
	pageIndex: number;
	setPageIndex: (nextPageIndex: number) => void;
	size: number;
	count: number | null | undefined;
}): void => {
	useEffect(() => {
		const clamped = clampOffsetPageIndex(pageIndex, size, count);
		if (clamped !== pageIndex) {
			setPageIndex(clamped);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps -- setPageIndex identity is not part of the clamp's trigger condition
	}, [pageIndex, size, count]);
};
