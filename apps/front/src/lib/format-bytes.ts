/**
 * One byte-size formatter for the whole front, driven by the UI language:
 * « 16.8 MB » in English, « 16,8 Mo » in French (Intl decimal separator,
 * French octet units). Decimal units (1 KB = 1000 B), the limits the
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

/** `size` rounds to the nearest tenth (a file's size); `limit` floors it, so a
 * displayed cap never reads above the real one (8 388 608 B → « 8,3 MB »). */
type RoundMode = 'size' | 'limit';

const UNKNOWN = '—';

export const formatBytes = (
	bytes: number,
	locale: string,
	mode: RoundMode = 'size',
): string => {
	if (!Number.isFinite(bytes)) {
		return UNKNOWN;
	}
	const units = locale.toLowerCase().startsWith('fr') ? UNITS.fr : UNITS.en;
	const safe = Math.max(0, bytes);
	const round =
		mode === 'limit'
			? (v: number) => Math.floor(v * 10 + 1e-9) / 10
			: (v: number) => Math.round(v * 10) / 10;
	let exponent = 0;
	while (exponent < units.length - 1 && safe >= 1000 ** (exponent + 1)) {
		exponent += 1;
	}
	let value =
		exponent === 0 ? Math.floor(safe) : round(safe / 1000 ** exponent);
	// A value that rounds up to 1000 carries into the next unit (999.96 KB → 1 MB).
	while (value >= 1000 && exponent < units.length - 1) {
		exponent += 1;
		value = round(safe / 1000 ** exponent);
	}
	return `${numberFormat(locale).format(value)} ${units[exponent]}`;
};
