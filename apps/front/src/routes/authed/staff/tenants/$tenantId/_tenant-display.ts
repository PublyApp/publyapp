/**
 * Pure display formatters and constants for the tenant-details surfaces.
 * Kept out of `_tenant-details-shell.tsx` so that file stays component-only
 * (react-doctor `only-export-components`); sibling routes import from here.
 */

export const MALFORMED_ID_TRANSLATION_KEY = 'malformed-id';

/** Formats the raw backend tenant status (e.g. `"Active"`) for display — the
 * identity header must not render the unlocalized backend string directly. */
export const formatTenantStatusLabel = (
	status: string,
	t: (key: string) => string,
): string => {
	const normalized = status.trim().toLowerCase();
	if (normalized === 'active') {
		return t('status-active');
	}
	if (normalized === 'suspended') {
		return t('status-suspended');
	}
	if (normalized === 'pending') {
		return t('status-pending');
	}
	return status;
};

/** Backend row status is PascalCase (`Active`/`Suspended`/`GloballySuspended`);
 * the `t()` keys are the honest display labels for those three values only. */
export const formatTenantUserStatusLabel = (
	status: string | null,
	t: (key: string) => string,
): string => {
	const normalized = status?.trim().toLowerCase() ?? '';
	if (normalized === 'active') {
		return t('status-active');
	}
	if (normalized === 'suspended') {
		return t('status-suspended');
	}
	if (
		normalized === 'globallysuspended' ||
		normalized === 'globally_suspended'
	) {
		return t('status-globally-suspended');
	}
	return status ?? t('status-unknown');
};

export const tenantUserLevelChipClassName = (level: string | null): string =>
	(level ?? '').trim().toLowerCase() === 'admin'
		? 'publy-detail-chip publy-detail-chip--amber'
		: 'publy-detail-chip publy-detail-chip--outline';

export const formatTenantUserLevelLabel = (
	level: string | null,
	t: (key: string) => string,
): string => {
	const normalized = level?.trim().toLowerCase() ?? '';
	if (normalized === 'admin') {
		return t('admin');
	}
	if (normalized === 'user') {
		return t('user');
	}
	// data-honesty-ignore: an unrecognized/absent account level is a genuine "no value" formatter case, not fabricated identity data
	return level ?? '—';
};

export {
	formatDateTime,
	formatInZone,
	formatMonthYear,
	formatShortDate,
	getRelativeTimeParts,
	type FormatDateTimeOptions,
	type FormatTimeOptions,
	type RelativeTimeParts,
} from '~/utils/format-time';
