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
 */
export const formatFailureCause = (
	cause: string | null | undefined,
	t: (key: string) => string,
): string => {
	if (typeof cause !== 'string') {
		return t('common:no-cause');
	}

	const trimmed = cause.trim();
	if (trimmed.length === 0) {
		return t('common:no-cause');
	}

	return trimmed;
};
