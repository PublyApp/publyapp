import { isFrench } from '~/lib/dates/localized-date';

/**
 * #2410: a native `<input type="time">` renders 12 h or 24 h from the browser's
 * locale, not the page's, so a French UI showed « 10:30 AM ». These helpers
 * render and accept the UI language's convention while the value stays
 * `HH:mm` (24 h), as `datetime-local` and `Date` expect.
 */

const ISO_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const pad = (value: number): string => String(value).padStart(2, '0');

export const localizedTimePlaceholder = (locale: string): string =>
	isFrench(locale) ? 'hh:mm' : 'hh:mm AM';

/** `HH:mm` → the locale's display format (24 h in French, 12 h in English). */
export const formatLocalizedTime = (
	isoTime: string | undefined,
	locale: string,
): string => {
	const match = isoTime ? ISO_TIME_PATTERN.exec(isoTime) : null;
	if (!match) {
		return '';
	}
	if (isFrench(locale)) {
		return isoTime ?? '';
	}
	const hours = Number(match[1]);

	return `${pad(hours % 12 === 0 ? 12 : hours % 12)}:${match[2]} ${
		hours < 12 ? 'AM' : 'PM'
	}`;
};

const TIME_PATTERN = /^(\d{1,2})(?:\s*[:h.]\s*|(?=\d{2}$))(\d{2})\s*(am|pm)?$/i;

/**
 * What the user typed (24 h anywhere, `am`/`pm` accepted too) → `HH:mm`.
 * `undefined` for an incomplete or invalid time, `''` for an empty field.
 */
export const parseLocalizedTime = (raw: string): string | undefined | '' => {
	const trimmed = raw.trim();
	if (trimmed.length === 0) {
		return '';
	}
	const match = TIME_PATTERN.exec(trimmed);
	if (!match) {
		return undefined;
	}
	let hours = Number(match[1]);
	const minutes = Number(match[2]);
	const meridiem = match[3]?.toLowerCase();
	if (minutes > 59) {
		return undefined;
	}
	if (meridiem) {
		if (hours < 1 || hours > 12) {
			return undefined;
		}
		hours = (hours % 12) + (meridiem === 'pm' ? 12 : 0);
	} else if (hours > 23) {
		return undefined;
	}

	return `${pad(hours)}:${pad(minutes)}`;
};
