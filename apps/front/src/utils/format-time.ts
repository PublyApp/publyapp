const EM_DASH = '—';

type DateValue = Date | null | undefined;
type DateInput = Date | string | null | undefined;

export type FormatTimeOptions = {
	timeZone?: string | null;
};

export type FormatDateTimeOptions = FormatTimeOptions & {
	weekday?: 'short';
};

const isValidDate = (value: DateValue): value is Date =>
	value instanceof Date && !Number.isNaN(value.valueOf());

const toDate = (value: DateInput): Date | null => {
	if (value instanceof Date) {
		return isValidDate(value) ? value : null;
	}

	if (typeof value === 'string') {
		const date = new Date(value);
		return isValidDate(date) ? date : null;
	}

	return null;
};

const formatDate = (
	value: DateValue,
	locale: string,
	options: Intl.DateTimeFormatOptions,
	timeZone: string | null | undefined,
): string => {
	if (!isValidDate(value) || timeZone === null) {
		return EM_DASH;
	}

	try {
		return new Intl.DateTimeFormat(locale, {
			...options,
			timeZone,
		}).format(value);
	} catch {
		return EM_DASH;
	}
};

const DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
	dateStyle: 'medium',
	timeStyle: 'short',
};

const WEEKDAY_DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
	weekday: 'short',
	year: 'numeric',
	month: 'short',
	day: 'numeric',
	hour: 'numeric',
	minute: '2-digit',
};

const CALENDAR_DAY_OPTIONS: Intl.DateTimeFormatOptions = {
	weekday: 'short',
	year: 'numeric',
	month: 'short',
	day: 'numeric',
};

const SHORT_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
	dateStyle: 'medium',
};

const MONTH_YEAR_OPTIONS: Intl.DateTimeFormatOptions = {
	month: 'short',
	year: 'numeric',
};

export const formatDateTime = (
	value: DateValue,
	locale: string,
	options?: FormatDateTimeOptions,
): string =>
	formatDate(
		value,
		locale,
		options?.weekday === 'short'
			? WEEKDAY_DATE_TIME_OPTIONS
			: DATE_TIME_OPTIONS,
		options?.timeZone,
	);

export const formatShortDate = (
	value: DateValue,
	locale: string,
	options?: FormatTimeOptions,
): string => formatDate(value, locale, SHORT_DATE_OPTIONS, options?.timeZone);

export const formatMonthYear = (
	value: DateValue,
	locale: string,
	options?: FormatTimeOptions,
): string => formatDate(value, locale, MONTH_YEAR_OPTIONS, options?.timeZone);

export type RelativeTimeParts = {
	key: 'minutes-ago' | 'hours-ago' | 'days-ago' | 'months-ago' | 'years-ago';
	count: number;
};

/** Coarse "x ago" magnitude for stat-card secondary rows. */
export const getRelativeTimeParts = (
	value: DateValue,
	now: Date = new Date(),
): RelativeTimeParts | null => {
	if (!isValidDate(value)) {
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

/** Formats an instant with a weekday in an IANA zone using the UI locale. */
export const formatInZone = (
	value: DateInput,
	timeZone: string | null | undefined,
	language: string,
): string => {
	const date = toDate(value);
	return formatDate(date, language, WEEKDAY_DATE_TIME_OPTIONS, timeZone);
};

/** Formats a calendar day in UTC using the UI locale. */
export const formatCalendarDay = (value: DateInput, language: string): string =>
	formatDate(toDate(value), language, CALENDAR_DAY_OPTIONS, 'UTC');
