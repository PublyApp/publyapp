import { z } from 'zod';

/** Mirrors the server's `MustBePatchFieldUrl`/create-body URL check: an
 * absolute http(s) URL, not a bare hostname or relative path. */
export const isAbsoluteHttpUrl = (value: string): boolean => {
	try {
		const url = new URL(value);
		return url.protocol === 'http:' || url.protocol === 'https:';
	} catch {
		return false;
	}
};

export const isValidEmailAddress = (value: string): boolean =>
	z.string().trim().pipe(z.email()).safeParse(value).success;

/** Hostname for the preview card's website row; null for an empty or
 * unparsable URL rather than showing a half-typed value while editing. */
export const getWebsiteHostname = (value: string): string | null => {
	const trimmed = value.trim();
	if (trimmed.length === 0) {
		return null;
	}

	try {
		return new URL(trimmed).hostname;
	} catch {
		return null;
	}
};
