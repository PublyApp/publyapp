/**
 * Shared decision for "what text to show for a failure cause" — single source
 * of truth for the column AND the two drawers (dead-letter, queue). Without
 * this, the three sites diverge: the column used `||` (catches empty string),
 * the drawers used `??` (lets an empty/whitespace cause through as a blank
 * cell). Rule: a cause that is null, undefined, or only whitespace is absent
 * and renders as the designated "no cause recorded" marker.
 *
 * Returns the trimmed cause when present, the translated marker otherwise.
 * Never returns the dash (`no-value`) — that key is for genuinely-empty
 * non-cause fields (e.g. a missing job type), not for a missing failure cause.
 *
 * Uses a whitespace predicate wider than `String.prototype.trim` so that
 * zero-width spaces (U+200B) and other Cf-category "invisible" characters
 * that `trim()` leaves behind are treated as absent — see brief #1879.
 */
export const formatFailureCause = (
	cause: string | null | undefined,
	t: (key: string) => string,
): string => {
	if (typeof cause !== 'string') {
		return t('common:no-cause');
	}

	const trimmed = cause.trim();
	// `String.prototype.trim` does not strip U+200B (zero-width space,
	// category Cf) or other invisible/zero-width characters. A cause that
	// is visually empty — e.g. only U+200B or only spaces around it — must
	// still show the marker. Strip Cf characters and re-check emptiness.
	if (trimmed.replace(/\p{Cf}/gu, '').trim().length === 0) {
		return t('common:no-cause');
	}

	return trimmed;
};
