import { useState } from 'react';

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

type UseOffsetPageClampOptions = {
	pageIndex: number;
	size: number;
	count: number | null | undefined;
	resetKeys: readonly unknown[];
};

// Stable identity for "the resetKeys the derivation last ran against". The
// signature is a STRING (not the array reference) compared DURING the render,
// so a reset is detected by VALUE on the same render the keys change — there
// is no ref/effect lag where one render reads the pre-change keys. #691 R3:
// deferring the comparison into a `useEffect` (or reading a ref the effect
// updates) lets the change render run with `changed=false`, so the hook
// clamps from the stale `pageIndex` and the caller commits the wrong page
// one paint later. Comparing against state held from the prior render — and
// committing the new signature on the SAME render — makes "reset wins" true
// on every render, including the one where the warm count finally lands. This
// is the same during-render derivation `useCursorPagination` uses for
// generation changes.
const resetKeysSignature = (resetKeys: readonly unknown[]): string =>
	`${resetKeys.length}:${resetKeys
		.map((value) => (typeof value === 'string' ? value : String(value)))
		.join('|')}`;

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
 * #691: the previous shape called `setPageIndex(clamped)` from a `useEffect`
 * to push the clamped value back up to the parent's state. That violated
 * `no-pass-live-state-to-parent` / `no-pass-data-to-parent`, and the parent
 * re-rendered with the clamped value one frame late, flashing the stale
 * pageIndex after paint. The hook is now a pure derivation: the caller calls
 * `setPageIndex(clamped)` from inside its own render, in the
 * adjust-state-while-rendering pattern, so the new pageIndex is committed
 * before the same render's paint — no post-paint effect, no parent-state
 * mutation from a child. The resetKeys comparison is likewise performed
 * DURING the render (against a signature held in state), so no render can
 * ever observe the reset on a later paint than the clamp (see the
 * `useOffsetPageClamp` tests, which assert the FIRST render after a
 * `resetKeys` change returns 0).
 */
export const useOffsetPageClamp = ({
	pageIndex,
	size,
	count,
	resetKeys,
}: UseOffsetPageClampOptions): number => {
	// Hold the last-seen resetKeys signature in state so the comparison is a
	// DURING-RENDER derivation, never a value read from a ref that an effect
	// updates after commit. The signature is updated on the SAME render we
	// observe a change (React's adjust-state-while-rendering pattern:
	// setPreviousSignature re-renders before paint with the synced value), so
	// there is no render where the previous keys stand in for the current
	// ones.
	const [previousSignature, setPreviousSignature] = useState(() =>
		resetKeysSignature(resetKeys),
	);
	const currentSignature = resetKeysSignature(resetKeys);
	const resetKeysChanged = currentSignature !== previousSignature;
	if (resetKeysChanged) {
		setPreviousSignature(currentSignature);
	}

	const basePageIndex = resetKeysChanged ? 0 : pageIndex;
	return clampOffsetPageIndex(basePageIndex, size, count);
};
