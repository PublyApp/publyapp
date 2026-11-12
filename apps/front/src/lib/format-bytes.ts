/**
 * One byte-size formatter for the whole front, driven by the UI language:
 * « 16.8 MB » in English, « 16,8 Mo » in French (Intl decimal separator,
 * French octet units). Decimal units (1 KB = 1000 B), matching the limits the
 * API advertises.
 */

const UNITS = {
	en: ['B', 'KB', 'MB', 'GB'],
	fr: ['o', 'Ko', 'Mo', 'Go'],
} as const;

/** Building an `Intl.NumberFormat` is slow; keep one per locale. */
const formatters = new Map<string, Intl.NumberFormat>();

const numberFormat = (locale: string): Intl.NumberFormat => {
	const cached = formatters.get(locale);
	if (cached) {
		return cached;
	}
	const formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
	formatters.set(locale, formatter);
	return formatter;
};

export const formatBytes = (bytes: number, locale: string): string => {
	const units = locale.toLowerCase().startsWith('fr') ? UNITS.fr : UNITS.en;
	const safe = Math.max(0, bytes);
	if (safe < 1000) {
		return `${numberFormat(locale).format(safe)} ${units[0]}`;
	}
	let exponent = Math.min(Math.floor(Math.log10(safe) / 3), units.length - 1);
	// 999,5 KB rounds up to 1000 KB: show it as 1 MB instead.
	if (exponent === 1 && Math.ceil(safe / 1000) >= 1000) {
		exponent = 2;
	}
	const value = safe / 1000 ** exponent;
	// KB reads as a whole number (977 KB), larger units keep one decimal.
	const text =
		exponent === 1
			? numberFormat(locale).format(Math.ceil(value))
			: numberFormat(locale).format(value);
	return `${text} ${units[exponent]}`;
};
