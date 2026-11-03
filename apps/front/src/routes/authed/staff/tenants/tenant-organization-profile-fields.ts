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

/** Hoisted to module scope: every email-bearing schema calls this once per
 * validation pass, and rebuilding the schema per call cost ~26x the parse it
 * enables. Deliberately NOT `z.compile()`d: this module is in the client
 * bundle, where the production CSP forbids `new Function` (src/server/csp.ts),
 * so compiling would fall back to the runtime after paying for the compiler. */
const EMAIL_ADDRESS_SCHEMA = z.string().trim().pipe(z.email());

export const isValidEmailAddress = (value: string): boolean =>
	EMAIL_ADDRESS_SCHEMA.safeParse(value).success;

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
