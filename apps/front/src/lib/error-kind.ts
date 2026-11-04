import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';

/**
 * What went wrong, as far as an error screen cares. Mirrors ShopKart OS's
 * `classifyError` (`src/lib/error-kind.ts`) so every full-page and inline
 * load error picks the same pictogram, tone, title, actions and details.
 */
export type ErrorKind =
	| 'signed_out'
	| 'offline'
	| 'not_found'
	| 'forbidden'
	| 'server'
	| 'unknown';

// The fetch failures of Chrome, Firefox and Safari, when the request never
// reached the server (ShopKart OS's list).
const NETWORK_FAILURE =
	/failed to fetch|networkerror|load failed|network request failed/i;

const messageOf = (cause: unknown) =>
	cause instanceof Error ? cause.message : String(cause);

/**
 * Classifies a load error from PublyApp's own shapes: RFC 7807 problem+json
 * (401/403/404/5xx), a fetch network failure, and `navigator.onLine`.
 *
 * `online` is `navigator.onLine`; it is true on the server. Order matches
 * ShopKart OS: a signed-out session wins, then the network, then the status.
 */
export const classifyError = (cause: unknown, online: boolean): ErrorKind => {
	const failure = toApiFailure(cause);
	const status =
		failure.kind === 'problem' || failure.kind === 'validation'
			? failure.status
			: undefined;

	if (status === 401) {
		return 'signed_out';
	}

	if (
		!online ||
		failure.kind === 'network' ||
		NETWORK_FAILURE.test(messageOf(cause))
	) {
		return 'offline';
	}

	if (status === 404) {
		return 'not_found';
	}

	if (status === 403) {
		return 'forbidden';
	}

	if (status !== undefined && status >= 500 && status < 600) {
		return 'server';
	}

	return 'unknown';
};

/** The kind of a translated status eyebrow ("404 — Introuvable") used by the
 * legacy page-error views; it lets them keep their wording while taking the
 * ShopKart icon/tone/action pair. */
export const errorKindFromCode = (code?: string): ErrorKind | undefined => {
	const match = /\b(401|403|404|5\d\d)\b/.exec(code ?? '');
	if (!match) {
		return undefined;
	}

	const status = Number(match[1]);
	if (status === 401) {
		return 'signed_out';
	}
	if (status === 403) {
		return 'forbidden';
	}
	if (status === 404) {
		return 'not_found';
	}
	return 'server';
};
