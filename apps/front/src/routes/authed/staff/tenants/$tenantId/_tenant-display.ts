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

/** Access is now binary: either the tenant's full-access role or not. The
 * role names themselves live on the row, so this only names the distinction. */
export const tenantUserAccessChipClassName = (isFullAccess: boolean): string =>
	isFullAccess
		? 'publy-detail-chip publy-detail-chip--amber'
		: 'publy-detail-chip publy-detail-chip--outline';

export const formatTenantUserAccessLabel = (
	isFullAccess: boolean,
	t: (key: string) => string,
): string => (isFullAccess ? t('full-access') : t('standard-access'));

export {
	formatDateTime,
	formatMonthYear,
	formatShortDate,
	getRelativeTimeParts,
} from '~/utils/format-time';
