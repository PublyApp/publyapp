/**
 * Single publication-status vocabulary shared by publications list (History),
 * scheduled queue, and calendar. Every consumer of publication wire statuses
 * MUST import from here — never define a local copy.
 */

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
 * Maps a publication wire status to a StatusPillTone.
 * Unknown/null statuses map to 'neutral' (the explicit fallback).
 */
export const publicationStatusTone = (
	status: string | null,
): 'danger' | 'info' | 'neutral' | 'primary' | 'success' | 'warning' => {
	if (status === 'in_progress') {
		return 'info';
	}
	if (status === 'paused') {
		return 'warning';
	}
	if (status === 'published') {
		return 'success';
	}
	if (status === 'failed') {
		return 'danger';
	}
	return 'neutral';
};

/**
 * Returns the i18n label key for a publication wire status, or null for
 * unknown statuses (the neutral fallback renders '—' at the call site).
 */
export const publicationStatusLabelKey = (
	status: string | null,
): string | null => {
	if (status === 'scheduled') {
		return 'publish-status-scheduled';
	}
	if (status === 'in_progress') {
		return 'publish-status-in-progress';
	}
	if (status === 'paused') {
		return 'publish-status-paused';
	}
	if (status === 'published') {
		return 'publish-status-published';
	}
	if (status === 'failed') {
		return 'publish-status-failed';
	}
	return null;
};
