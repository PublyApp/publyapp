import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';

/**
 * Shared resolver for QueryDisplay / read-only card error branches (issue
 * #2043). The per-screen error views already had a hand-rolled status→copy
 * matcher duplicated ~10 times; the shared slot consumed by ~30 call sites
 * had none of it and was discarding the cause. This module is the smallest
 * extraction that lets both call sites use the same logic:
 *
 * - takes any `unknown` (so it survives `ServerFailure extends Error`, plain
 *   `Error`, and the duck-typed problem-details objects `toApiFailure` already
 *   reads),
 * - delegates status/detail extraction to `toApiFailure`, so nested Kiota/API
 *   problem payloads and direct `ServerFailure` instances follow one parser,
 * - returns a typed shape with `code`/`title`/`description`/`supportsRetry`/
 *   `fallback` so the consumer can paint either an inline span (QueryDisplay)
 *   or a full state surface (the read-only card).
 *
 * It deliberately returns the raw `ServerFailure.detail` string for
 * `description` when the server provided one — that is the cause the user
 * is asking us to show. The whole `ServerFailure` is already i18n-routed:
 * `t()` keys live under `common:error-403-code`, `common:no-access-title`,
 * etc., and `error.title` is **not** rendered raw (the API can send English
 * in any locale).
 */
export type ResolvedQueryError = {
	code: string | undefined;
	title: string;
	description: string;
	/** True for retryable server failures; false for forbidden or missing data. */
	supportsRetry: boolean;
	/** True when we had nothing usable to resolve; the title/description are
	 * the generic fallback and the UI is expected to make that clear. */
	fallback: boolean;
	/** True for intentional request cancellation, which should not paint a failure. */
	silent: boolean;
};

type Translator = (key: string) => string;

const getFallbackMessage = (
	status: number | undefined,
	t: Translator,
): string => {
	if (status === 403) {
		return t('forbidden-description');
	}

	if (status === 404) {
		return t('not-found-sentence');
	}

	return t('query-display-error-cause-unknown');
};

const hasFailureCause = (failure: ReturnType<typeof toApiFailure>): boolean => {
	if (failure.kind === 'problem' || failure.kind === 'validation') {
		return Boolean(
			failure.detail?.trim() || failure.title || failure.translationKey,
		);
	}

	if (failure.kind === 'network' || failure.kind === 'unknown') {
		return Boolean(failure.message);
	}

	return false;
};

export const resolveQueryError = (
	error: unknown,
	t: Translator,
): ResolvedQueryError => {
	const failure = toApiFailure(error);
	const status =
		failure.kind === 'problem' || failure.kind === 'validation'
			? failure.status
			: undefined;
	const normalizedFailure =
		failure.kind === 'problem' || failure.kind === 'validation'
			? { ...failure, detail: failure.detail?.trim() || undefined }
			: failure;
	const fallbackMessage = getFallbackMessage(status, t);
	const description = getFailureMessage(normalizedFailure, {
		fallback: fallbackMessage,
	});
	const hasCause = hasFailureCause(failure);

	if (failure.kind === 'abort') {
		return {
			code: undefined,
			title: '',
			description,
			supportsRetry: false,
			fallback: false,
			silent: true,
		};
	}

	if (status === 403) {
		return {
			code: t('error-403-code'),
			title: t('no-access-title'),
			description,
			supportsRetry: false,
			fallback: !hasCause,
			silent: false,
		};
	}

	if (status === 404) {
		return {
			code: t('error-404-code'),
			title: t('page-not-found'),
			description,
			supportsRetry: false,
			fallback: !hasCause,
			silent: false,
		};
	}

	if (status !== undefined && status >= 500 && status < 600) {
		return {
			code: t('error-500-code'),
			title: t('error-500-title'),
			description,
			supportsRetry: true,
			fallback: !hasCause,
			silent: false,
		};
	}

	// Every remaining failure kind still goes through getFailureMessage: network
	// and unknown messages, plus problem/validation title or translationKey,
	// are real causes and must not be replaced with generic copy.
	return {
		code: undefined,
		title: t('query-display-error-default'),
		description,
		supportsRetry: true,
		fallback: !hasCause,
		silent: false,
	};
};
