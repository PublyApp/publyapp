/**
 * Pure derivation of the #282 range-counter state for a pagination footer.
 *
 * A missing total means "unknown", NEVER zero — the exact distinction
 * `clampOffsetPageIndex` has held since #999: a count is briefly
 * `undefined` while a page query is in flight (cold cache, slow response,
 * a large tenant where the count lags the rows), and cursor-paginated
 * surfaces never have one at all. Treating that absence as zero makes the
 * label claim "the collection is empty", which is a lie about the data,
 * not a loading state. The label shows the bare range instead and picks up
 * "of N" whenever the total actually lands.
 */
export type PaginationRangeState =
	| { kind: 'zero' }
	| { kind: 'unknown-total'; start: number; end: number }
	| { kind: 'known-total'; start: number; end: number; total: number };

/**
 * Precondition: the footer only mounts when the current page has at least
 * one row (DataTable gates its whole card behind the non-empty rows body
 * state), so `pageRowCount >= 1` at every call site today.
 */
export const derivePaginationRange = ({
	pageIndex,
	size,
	pageRowCount,
	totalCount,
}: {
	pageIndex: number;
	size: number;
	pageRowCount: number;
	totalCount: number | null | undefined;
}): PaginationRangeState => {
	// Only an EXPLICIT zero is a genuine zero. An absent total is unknown —
	// never coerced here (#999's rule propagated to the label).
	if (totalCount === 0) {
		return { kind: 'zero' };
	}

	const start = pageIndex * size + 1;
	const end = pageIndex * size + pageRowCount;

	if (totalCount === undefined || totalCount === null) {
		return { kind: 'unknown-total', start, end };
	}

	return { kind: 'known-total', start, end, total: totalCount };
};
