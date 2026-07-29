export type StatusPillTone =
	| 'danger'
	| 'info'
	| 'neutral'
	| 'primary'
	| 'success'
	| 'warning';

/**
 * Maps backend lifecycle status labels to Gray UI chip tones:
 * Active → emerald, Invited → sky, Suspended → rose, Pending → amber.
 */
export const statusPillTone = (status: string | null): StatusPillTone => {
	const normalized = status?.trim().toLowerCase() ?? '';
	if (normalized === 'active' || normalized === 'accepted') {
		return 'success';
	}
	if (normalized === 'invited' || normalized === 'sent') {
		return 'info';
	}
	if (
		normalized === 'suspended' ||
		normalized === 'expired' ||
		normalized === 'revoked' ||
		normalized === 'deleted' ||
		normalized === 'globallysuspended' ||
		normalized === 'globally_suspended'
	) {
		return 'danger';
	}
	if (normalized.startsWith('pending')) {
		return 'warning';
	}
	return 'neutral';
};
