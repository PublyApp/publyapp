const FORMAT_OPTIONS = {
	weekday: 'short',
	year: 'numeric',
	month: 'short',
	day: 'numeric',
	hour: 'numeric',
	minute: '2-digit',
} as const;

const toDate = (value: Date | string | null | undefined): Date | null => {
	let date: Date | null = null;
	if (value instanceof Date) {
		date = value;
	} else if (typeof value === 'string') {
		date = new Date(value);
	}
	if (date === null || Number.isNaN(date.valueOf())) {
		return null;
	}

	return date;
};

/** Formats an instant in an IANA zone using the active UI locale. */
export const formatInZone = (
	value: Date | string | null | undefined,
	zone: string | null | undefined,
	language: string,
): string => {
	const date = toDate(value);
	if (date === null) {
		return '—';
	}

	try {
		return new Intl.DateTimeFormat(language, {
			...FORMAT_OPTIONS,
			timeZone: zone ?? undefined,
		}).format(date);
	} catch {
		return '—';
	}
};
