export type ErrorTone = 'info' | 'neutral' | 'warning' | 'danger';

/**
 * The visible code eyebrow ("404 — Not Found", translated) is what tells the
 * error families apart: not-found stays neutral, auth/permission is a
 * warning, everything else (5xx, unknown) is danger (owner decision 04/11).
 */
export const errorToneFromCode = (code?: string): ErrorTone => {
	if (!code) {
		return 'danger';
	}
	if (/\b404\b/.test(code)) {
		return 'neutral';
	}
	if (/\b(?:401|403)\b/.test(code)) {
		return 'warning';
	}
	return 'danger';
};
