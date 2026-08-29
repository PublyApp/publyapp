import type { TFunction } from 'i18next';

import type { NameSpace } from '../lib/i18n/resources';

const GENERIC_FALLBACK = 'An error occurred';

/**
 * Check if a string looks like raw JSON (starts with { or [).
 * These should never be displayed to users.
 */
const looksLikeJson = (str: string): boolean => {
	const trimmed = str.trimStart();
	return trimmed.startsWith('{') || trimmed.startsWith('[');
};

/**
 * Sanitize a message string: if it looks like raw JSON or is
 * excessively long, return a generic fallback instead.
 */
const sanitizeMessage = (message: string): string => {
	if (looksLikeJson(message)) {
		return GENERIC_FALLBACK;
	}
	return message;
};

/**
 * Extract a user-friendly error message from a serialized API error.
 * Tries translationKey/key first (for i18n), then falls back to
 * getErrorMessage.
 *
 * Used by SSR auth forms that receive serialized errors from server actions.
 */
export const getSerializedErrorMessage = (
	error: unknown,
	t: TFunction<NameSpace>,
): string | null => {
	if (error == null) {
		return null;
	}

	if (typeof error === 'object') {
		const obj = error as Record<string, unknown>;
		const translationKey = obj.translationKey || obj.key;
		if (typeof translationKey === 'string' && translationKey.length > 0) {
			// Missing keys render the key itself; naming it as defaultValue
			// keeps that behavior under the strict dynamic-key overload.
			return t(translationKey, {
				ns: 'response-message',
				defaultValue: translationKey,
			});
		}
	}

	return getErrorMessage(error);
};

export const getErrorMessage = (error: unknown): string => {
	if (error instanceof Error) {
		const msg = error.message || error.name || GENERIC_FALLBACK;
		return sanitizeMessage(msg);
	}

	if (typeof error === 'string') {
		return sanitizeMessage(error);
	}

	if (typeof error === 'object' && error !== null) {
		const errorMessage = (error as { message?: string }).message;

		if (typeof errorMessage === 'string') {
			return sanitizeMessage(errorMessage);
		}
	}

	return GENERIC_FALLBACK;
};
