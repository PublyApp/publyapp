import { isVisuallyBlank } from '~/lib/is-visually-blank';

/**
 * Shared decision for "what text to show for a failure cause" — single source
 * of truth for the column AND the two drawers (dead-letter, queue). A cause
 * that is null, undefined, or visually blank (see `isVisuallyBlank` in
 * `~/lib/is-visually-blank`) renders as the designated "no cause recorded"
 * marker; otherwise the trimmed cause is returned. Never returns the dash
 * (`no-value`) — that key is for genuinely-empty non-cause fields.
 * See briefs #1879 and #1931.
 */
export const formatFailureCause = (
	cause: string | null | undefined,
	t: (key: string) => string,
): string => {
	if (typeof cause !== 'string') {
		return t('common:no-cause');
	}

	const trimmed = cause.trim();
	if (isVisuallyBlank(trimmed)) {
		return t('common:no-cause');
	}

	return trimmed;
};
