/** Locale-aware `date + time` formatting for admin detail views. Returns
 * `'—'` for anything that isn't a valid `Date` — never a raw `Invalid Date`
 * string. */
export const formatDateTime = (
	value: Date | null | undefined,
	locale: string,
): string => {
	if (!(value instanceof Date) || Number.isNaN(value.valueOf())) {
		return '—';
	}

	return new Intl.DateTimeFormat(locale, {
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(value);
};
