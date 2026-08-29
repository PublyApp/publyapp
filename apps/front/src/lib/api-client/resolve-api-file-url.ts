import { resolveApiBaseUrl } from './client-manager';

const API_FILES_PREFIX = '/files/';

/** BE-4 returns root-relative `/files/...` urls (see `apps/api/Program.cs`'s
 * static-file mapping); resolve them against the same origin the kiota
 * client talks to so `<img src>` doesn't fall back to the front origin. */
export const resolveApiFileUrl = (value: string): string => {
	if (!value.startsWith(API_FILES_PREFIX)) {
		return value;
	}

	return new URL(value, resolveApiBaseUrl()).toString();
};

/** Trims and resolves a possibly-`null`/blank API file path against the API
 * origin, collapsing anything empty to `null` — the shared read-side
 * counterpart to {@link resolveApiFileUrl} every `avatarUrl`/`logoUrl`
 * mapper should use instead of a plain string normalizer, so a root-relative
 * `/files/...` path never renders against the front origin. */
export const normalizeNullableFileUrl = (
	value: string | null | undefined,
): string | null => {
	const trimmed = typeof value === 'string' ? value.trim() : '';
	if (trimmed) {
		return resolveApiFileUrl(trimmed);
	}
	return null;
};

/** Inverse of {@link resolveApiFileUrl} — strips the API origin back off a
 * same-origin `/files/...` url before persisting, so the stored value stays
 * root-relative and doesn't bake today's API origin into the DB. Absolute
 * urls from a different origin (e.g. a legacy externally hosted logo) pass
 * through unchanged. */
export const toRootRelativeApiFileUrl = (value: string): string => {
	if (!value.startsWith('http://') && !value.startsWith('https://')) {
		return value;
	}

	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		return value;
	}

	const apiOrigin = new URL(resolveApiBaseUrl()).origin;
	if (
		parsed.origin !== apiOrigin ||
		!parsed.pathname.startsWith(API_FILES_PREFIX)
	) {
		return value;
	}

	return `${parsed.pathname}${parsed.search}`;
};
