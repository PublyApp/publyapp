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

const DATE_TIME_FORMAT_OPTIONS = {
	dateStyle: 'medium',
	timeStyle: 'short',
} as const;

const SHORT_DATE_FORMAT_OPTIONS = {
	dateStyle: 'medium',
} as const;

const MONTH_YEAR_FORMAT_OPTIONS = {
	month: 'short',
	year: 'numeric',
} as const;

export const formatDateTime = (
	value: Date | null | undefined,
	locale: string,
): string => {
	if (!(value instanceof Date) || Number.isNaN(value.valueOf())) {
		return '—';
	}

	return value.toLocaleString(locale, DATE_TIME_FORMAT_OPTIONS);
};

export const formatShortDate = (
	value: Date | null | undefined,
	locale: string,
): string => {
	if (!(value instanceof Date) || Number.isNaN(value.valueOf())) {
		return '—';
	}

	return value.toLocaleString(locale, SHORT_DATE_FORMAT_OPTIONS);
};

export const formatMonthYear = (
	value: Date | null | undefined,
	locale: string,
): string => {
	if (!(value instanceof Date) || Number.isNaN(value.valueOf())) {
		return '—';
	}

	return value.toLocaleString(locale, MONTH_YEAR_FORMAT_OPTIONS);
};

export type RelativeTimeParts = {
	key: 'minutes-ago' | 'hours-ago' | 'days-ago' | 'months-ago' | 'years-ago';
	count: number;
};

/** Coarse "x ago" magnitude for stat-card secondary rows — a helper caption,
 * not a billing-precision calculation, so 30-day months are fine. */
export const getRelativeTimeParts = (
	value: Date | null | undefined,
	now: Date = new Date(),
): RelativeTimeParts | null => {
	if (!(value instanceof Date) || Number.isNaN(value.valueOf())) {
		return null;
	}

	const diffMs = Math.max(now.getTime() - value.getTime(), 0);
	const minutes = Math.floor(diffMs / 60_000);
	if (minutes < 60) {
		return { key: 'minutes-ago', count: Math.max(minutes, 1) };
	}

	const hours = Math.floor(minutes / 60);
	if (hours < 24) {
		return { key: 'hours-ago', count: hours };
	}

	const days = Math.floor(hours / 24);
	if (days < 30) {
		return { key: 'days-ago', count: days };
	}

	const months = Math.floor(days / 30);
	if (months < 12) {
		return { key: 'months-ago', count: months };
	}

	const years = Math.floor(months / 12);
	return { key: 'years-ago', count: years };
};
