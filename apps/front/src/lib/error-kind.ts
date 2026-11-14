import {
	NETWORK_FAILURE_MESSAGE,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';
import { logger } from '@org/shared-ts/lib/logger/iso-logger';

/**
 * What went wrong, as far as an error screen cares. Mirrors ShopKart OS's
 * `classifyError` (`src/lib/error-kind.ts`) so every full-page and inline
 * load error picks the same pictogram, tone, title and actions.
 */
export type ErrorKind =
	| 'signed_out'
	| 'offline'
	| 'not_found'
	| 'forbidden'
	| 'server'
	| 'unknown';

const messageOf = (cause: unknown) =>
	cause instanceof Error ? cause.message : String(cause);

const clean = (value: unknown): string | undefined => {
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
};

/**
 * The sanitised raw cause, for the log only: HTTP status, problem
 * `title`/`detail`, translation key and the API `traceId` request id. It is
 * never rendered in the UI (owner decision 04/11) and never carries a token
 * or a stack trace.
 */
const describeFailureCause = (cause: unknown): string => {
	const failure = toApiFailure(cause);

	if (failure.kind === 'problem' || failure.kind === 'validation') {
		const lines = [`HTTP ${failure.status}`];
		const title = clean(failure.title);
		if (title) {
			lines.push(title);
		}
		const detail = clean(failure.detail);
		if (detail) {
			lines.push(detail);
		}
		const translationKey = clean(failure.translationKey);
		if (translationKey) {
			lines.push(`translationKey: ${translationKey}`);
		}
		const traceId =
			clean(failure.extensions?.traceId) ??
			clean((cause as { traceId?: unknown } | null)?.traceId);
		if (traceId) {
			lines.push(`traceId: ${traceId}`);
		}
		return lines.join('\n');
	}

	if (failure.kind === 'network') {
		return `network: ${failure.message}`;
	}

	if (failure.kind === 'abort') {
		return 'aborted';
	}

	return failure.kind === 'unknown' ? failure.message : String(cause);
};

// One line per error object: an error surface re-renders (and the same cause
// flows through the resolver and the view), so the cause is logged once.
const loggedCauses = new WeakSet<object>();

const logClassifiedCause = (cause: unknown, kind: ErrorKind): void => {
	if (typeof cause === 'object' && cause !== null) {
		if (loggedCauses.has(cause)) {
			return;
		}
		loggedCauses.add(cause);
	}

	const context = { kind, cause: describeFailureCause(cause) };
	if (kind === 'server' || kind === 'unknown') {
		logger.error('[error-kind] classified failure', context);
		return;
	}
	logger.warn('[error-kind] classified failure', context);
};

/**
 * Classifies a load error from PublyApp's own shapes: RFC 7807 problem+json
 * (401/403/404/5xx), a fetch network failure, and `navigator.onLine`.
 *
 * `online` is `navigator.onLine`; it is true on the server. Order matches
 * ShopKart OS: a signed-out session wins, then the network, then the status.
 */
const classifyKind = (cause: unknown, online: boolean): ErrorKind => {
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
		NETWORK_FAILURE_MESSAGE.test(messageOf(cause))
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

/** Classifies the cause and logs its sanitised raw form once (the UI never
 * shows it — owner decision 04/11). */
export const classifyError = (cause: unknown, online: boolean): ErrorKind => {
	const kind = classifyKind(cause, online);
	logClassifiedCause(cause, kind);
	return kind;
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
