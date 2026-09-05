/**
 * Single publication-status vocabulary shared by publications list (History),
 * scheduled queue, and calendar. Every consumer of publication wire statuses
 * MUST import from here — never define a local copy.
 */

/** i18n label key + StatusPill tone for a wire status. Tone matches the
 * StatusPill props (`danger | info | neutral | primary | success | warning`);
 * labelKey is the resource key under the `posts:` namespace. Unknown statuses
 * return null so the call site can render the neutral em-dash fallback. */
export type PublicationStatusPresentation = {
	tone: 'danger' | 'info' | 'neutral' | 'primary' | 'success' | 'warning';
	labelKey: string;
};

const PUBLICATION_WIRE_STATUSES = [
	'scheduled',
	'in_progress',
	'published',
	'failed',
	'paused',
] as const;

export type PublicationWireStatus = (typeof PUBLICATION_WIRE_STATUSES)[number];

export const isPublicationWireStatus = (
	value: string,
): value is PublicationWireStatus =>
	(PUBLICATION_WIRE_STATUSES as readonly string[]).includes(value);

/**
 * Single source of truth for `{tone, labelKey}` per wire status. Centralising
 * here removes the parallel `if`-ladder the queue, calendar, and history
 * rows previously carried: each consumer renders the same pill for the same
 * status, and a new status only needs one entry.
 */
const PUBLICATION_STATUS_PRESENTATION = {
	scheduled: { tone: 'neutral', labelKey: 'publish-status-scheduled' },
	in_progress: { tone: 'info', labelKey: 'publish-status-in-progress' },
	paused: { tone: 'warning', labelKey: 'publish-status-paused' },
	published: { tone: 'success', labelKey: 'publish-status-published' },
	failed: { tone: 'danger', labelKey: 'publish-status-failed' },
} satisfies Record<PublicationWireStatus, PublicationStatusPresentation>;

/** Returns the `{tone, labelKey}` metadata for a wire status, or null for
 * unknown / empty statuses (the neutral em-dash fallback wins at the call site). */
export const publicationStatusPresentation = (
	status: string | null,
): PublicationStatusPresentation | null => {
	if (status === null || status === '') {
		return null;
	}
	if (!isPublicationWireStatus(status)) {
		return null;
	}
	return PUBLICATION_STATUS_PRESENTATION[status];
};

/** Maps a publication wire status to a StatusPillTone. Unknown/null statuses
 * map to 'neutral' (the explicit fallback). Kept as a thin wrapper for
 * existing call sites; new code should prefer `publicationStatusPresentation`. */
export const publicationStatusTone = (
	status: string | null,
): 'danger' | 'info' | 'neutral' | 'primary' | 'success' | 'warning' =>
	publicationStatusPresentation(status)?.tone ?? 'neutral';

/**
 * Returns the i18n label key for a publication wire status, or null for
 * unknown statuses (the neutral fallback renders '—' at the call site).
 * Thin wrapper kept for existing call sites; new code should prefer
 * `publicationStatusPresentation`.
 */
export const publicationStatusLabelKey = (
	status: string | null,
): string | null => publicationStatusPresentation(status)?.labelKey ?? null;
