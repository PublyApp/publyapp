/** The shared history's day headings and times (§5.1 « Par jour »). */

const DAY_MS = 86_400_000;

const pad = (value: number): string => String(value).padStart(2, '0');

/** A local calendar day key, so two instants on the same day group together
 * even when a UTC boundary crosses midnight. */
export const historyDayKey = (date: Date | null): string => {
	if (!(date instanceof Date) || Number.isNaN(date.valueOf())) {
		return 'unknown';
	}
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const startOfLocalDay = (date: Date): number =>
	new Date(date.getFullYear(), date.getMonth(), date.getDate()).valueOf();

const capitalize = (value: string): string =>
	value.length > 0 ? value.charAt(0).toUpperCase() + value.slice(1) : value;

/**
 * « Aujourd'hui », « Hier », then the spelled-out date (« Dimanche 25
 * octobre »). `now` is a parameter so the label is testable and never reads a
 * clock twice.
 */
export const historyDayLabel = ({
	date,
	now,
	locale,
	today,
	yesterday,
	unknown,
}: {
	date: Date | null;
	now: Date;
	locale: string;
	today: string;
	yesterday: string;
	unknown: string;
}): string => {
	if (!(date instanceof Date) || Number.isNaN(date.valueOf())) {
		return unknown;
	}

	const day = startOfLocalDay(date);
	const current = startOfLocalDay(now);
	if (day === current) {
		return today;
	}
	if (day === current - DAY_MS) {
		return yesterday;
	}

	try {
		return capitalize(
			new Intl.DateTimeFormat(locale, {
				weekday: 'long',
				day: 'numeric',
				month: 'long',
			}).format(date),
		);
	} catch {
		return unknown;
	}
};

/** The event's clock time, always 24-hour like the reference. */
export const historyTimeLabel = (date: Date | null, locale: string): string => {
	if (!(date instanceof Date) || Number.isNaN(date.valueOf())) {
		return '—';
	}

	try {
		return new Intl.DateTimeFormat(locale, {
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23',
		}).format(date);
	} catch {
		return '—';
	}
};

/** The date alone, for a custom period chip (« 12/10/2026 – 20/10/2026 »). */
export const historyDateLabel = (value: string | undefined): string => {
	if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return '—';
	}
	const [year, month, day] = value.split('-');
	return `${day}/${month}/${year}`;
};
