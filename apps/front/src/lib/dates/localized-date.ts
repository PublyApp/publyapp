/**
 * #2291 M8: a native `<input type="date">` renders its segments in the
 * browser's own locale, not the page's (`lang="fr"` is ignored by Chromium),
 * so a French UI showed `mm/dd/yyyy`. These two helpers let the audit-log
 * filters render and accept the locale the app is actually in, while the URL
 * contract stays `YYYY-MM-DD`.
 */

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export const isFrench = (locale: string): boolean =>
	locale.toLowerCase().startsWith('fr');

export const localizedDatePlaceholder = (locale: string): string =>
	isFrench(locale) ? 'jj/mm/aaaa' : 'mm/dd/yyyy';

const pad = (value: number): string => String(value).padStart(2, '0');

const isValidDateParts = (
	year: number,
	month: number,
	day: number,
): boolean => {
	if (month < 1 || month > 12 || day < 1 || day > 31) {
		return false;
	}

	const date = new Date(Date.UTC(year, month - 1, day));

	return (
		date.getUTCFullYear() === year &&
		date.getUTCMonth() === month - 1 &&
		date.getUTCDate() === day
	);
};

/** ISO (`YYYY-MM-DD`) → the locale's display format. */
export const formatLocalizedDate = (
	isoDate: string | undefined,
	locale: string,
): string => {
	if (!isoDate) {
		return '';
	}

	const match = ISO_DATE_PATTERN.exec(isoDate);
	if (!match) {
		return '';
	}

	const [, year = '', month = '', day = ''] = match;

	if (isFrench(locale)) {
		return `${day}/${month}/${year}`;
	}

	return `${month}/${day}/${year}`;
};

/**
 * The locale's display format (or an ISO date, for programmatic fills) →
 * ISO `YYYY-MM-DD`. Returns `undefined` for an incomplete/invalid date and
 * `''` for an empty field (the filter was cleared).
 */
export const parseLocalizedDate = (
	raw: string,
	locale: string,
): string | undefined | '' => {
	const trimmed = raw.trim();
	if (trimmed.length === 0) {
		return '';
	}

	const iso = ISO_DATE_PATTERN.exec(trimmed);
	if (iso) {
		const [, year = '', month = '', day = ''] = iso;
		if (isValidDateParts(Number(year), Number(month), Number(day))) {
			return trimmed;
		}
		return undefined;
	}

	const parts = trimmed.split(/[/.-]/);
	if (parts.length !== 3 || parts.some((part) => !/^\d{1,4}$/.test(part))) {
		return undefined;
	}

	const numbers = parts.map(Number);
	const [first = 0, second = 0, third = 0] = numbers;
	const [day, month, year] = isFrench(locale)
		? [first, second, third]
		: [second, first, third];
	const fullYear = year < 100 ? 2000 + year : year;

	if (!isValidDateParts(fullYear, month, day)) {
		return undefined;
	}

	return `${fullYear}-${pad(month)}-${pad(day)}`;
};
