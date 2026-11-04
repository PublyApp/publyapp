import { classifyError, type ErrorKind } from '~/lib/error-kind';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';

/**
 * Shared resolver for QueryDisplay / list and card error branches (issue
 * #2043). It takes any `unknown` (ServerFailure, plain Error, duck-typed
 * problem payloads), classifies it through the one classifier
 * (`lib/error-kind.ts`) and returns the copy that kind owns.
 */
export type ResolvedQueryError = {
	/** The ShopKart OS error family (offline, not found, forbidden, …). */
	kind: ErrorKind;
	code: string | undefined;
	title: string;
	description: string;
	/** True when a retry makes sense (offline, server, unknown, not found). */
	supportsRetry: boolean;
	/** True when we had nothing usable to resolve; the title/description are
	 * the generic fallback and the UI is expected to make that clear. */
	fallback: boolean;
	/** True for intentional request cancellation, which should not paint a failure. */
	silent: boolean;
	/** 403 only: retrying cannot help, so the home button is the primary action. */
	backOnly?: boolean;
};

type Translator = (key: string) => string;

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

const browserOnline = (): boolean =>
	typeof navigator === 'undefined' || navigator.onLine !== false;

export const resolveQueryError = (
	error: unknown,
	t: Translator,
	online: boolean = browserOnline(),
): ResolvedQueryError => {
	const failure = toApiFailure(error);
	const hasCause = hasFailureCause(failure);

	if (failure.kind === 'abort') {
		return {
			kind: 'unknown',
			code: undefined,
			title: '',
			description: '',
			supportsRetry: false,
			fallback: false,
			silent: true,
		};
	}

	const kind = classifyError(error, online);

	if (kind === 'offline') {
		return {
			kind,
			code: undefined,
			title: t('offline-title'),
			description: t('offline-description'),
			supportsRetry: true,
			fallback: !hasCause,
			silent: false,
		};
	}

	if (kind === 'signed_out') {
		return {
			kind,
			code: t('error-401-code'),
			title: t('session-expired'),
			description: t('session-no-longer-valid-description'),
			supportsRetry: false,
			fallback: !hasCause,
			silent: false,
		};
	}

	if (kind === 'forbidden') {
		return {
			kind,
			code: t('error-403-code'),
			title: t('no-access-title'),
			description: t('forbidden-description'),
			supportsRetry: false,
			backOnly: true,
			fallback: !hasCause,
			silent: false,
		};
	}

	if (kind === 'not_found') {
		return {
			kind,
			code: t('error-404-code'),
			title: t('page-not-found'),
			description: t('not-found-sentence'),
			// The thing may exist by now; « Réessayer » is part of the pair.
			supportsRetry: true,
			fallback: !hasCause,
			silent: false,
		};
	}

	if (kind === 'server') {
		return {
			kind,
			code: t('error-500-code'),
			title: t('error-500-title'),
			description: t('error-500-description'),
			supportsRetry: true,
			fallback: !hasCause,
			silent: false,
		};
	}

	return {
		kind,
		code: undefined,
		title: t('query-display-error-default'),
		description: t('query-display-error-cause-unknown'),
		supportsRetry: true,
		fallback: !hasCause,
		silent: false,
	};
};
