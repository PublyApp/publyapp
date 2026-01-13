import {
	parseAppProblemDetails,
	parseValidationProblemDetails,
} from './schemas';
import type { ApiFailure } from './types';

/**
 * Converts any error into a normalized ApiFailure discriminated union.
 *
 * This is the single source of truth for error classification.
 * All error handling in the app should go through this function.
 *
 * @param error - Any error thrown by the API client or network layer
 * @returns Normalized ApiFailure object
 */
export const toApiFailure = (error: unknown): ApiFailure => {
	// 1. ValidationProblemDetails (HTTP 422) - field-level errors
	const validationDetails = parseValidationProblemDetails(error);
	if (validationDetails) {
		return {
			kind: 'validation',
			status:
				validationDetails.status ?? validationDetails.responseStatusCode ?? 422,
			translationKey: validationDetails.translationKey ?? undefined,
			detail: validationDetails.detail ?? undefined,
			title: validationDetails.title ?? undefined,
			fieldErrors: validationDetails.errors ?? {},
			raw: error,
		};
	}

	// 2. AppProblemDetails (HTTP 400, 401, 403, 404, 500, etc.)
	const problemDetails = parseAppProblemDetails(error);
	if (problemDetails) {
		return {
			kind: 'problem',
			status: problemDetails.status ?? problemDetails.responseStatusCode ?? 500,
			translationKey: problemDetails.translationKey ?? undefined,
			detail: problemDetails.detail ?? undefined,
			title: problemDetails.title ?? undefined,
			raw: error,
		};
	}

	// 3. AbortError - request was cancelled (user navigated away, component unmount)
	// IMPORTANT: Check this BEFORE network errors - AbortError should be silent
	// Guard DOMException for SSR where it may not exist
	if (
		(typeof DOMException !== 'undefined' &&
			error instanceof DOMException &&
			error.name === 'AbortError') ||
		(error instanceof Error && error.name === 'AbortError')
	) {
		return {
			kind: 'abort',
			raw: error,
		};
	}

	// 4. Network errors - TypeError usually indicates fetch failure
	if (error instanceof TypeError) {
		// Common fetch failure messages
		const message = error.message.toLowerCase();
		if (
			message.includes('fetch') ||
			message.includes('network') ||
			message.includes('failed to fetch') ||
			message.includes('networkerror')
		) {
			return {
				kind: 'network',
				message: 'Network error - please check your connection',
				raw: error,
			};
		}
	}

	// 5. Raw Response object (rare - usually means unexpected response format)
	// Guard Response for SSR where it may not exist
	if (typeof Response !== 'undefined' && error instanceof Response) {
		return {
			kind: 'problem',
			status: error.status,
			translationKey: undefined,
			detail: `HTTP ${error.status}: ${error.statusText}`,
			title: error.statusText,
			raw: error,
		};
	}

	// 6. Kiota's DefaultApiError or similar (has responseStatusCode but failed shape validation)
	if (
		error != null &&
		typeof error === 'object' &&
		'responseStatusCode' in error &&
		typeof (error as Record<string, unknown>).responseStatusCode === 'number'
	) {
		const statusCode = (error as { responseStatusCode: number })
			.responseStatusCode;
		return {
			kind: 'problem',
			status: statusCode,
			translationKey: undefined,
			detail:
				error instanceof Error ? error.message : `HTTP Error ${statusCode}`,
			title: `HTTP Error ${statusCode}`,
			raw: error,
		};
	}

	// 7. Standard Error object
	if (error instanceof Error) {
		return {
			kind: 'unknown',
			message: error.message || 'An unexpected error occurred',
			raw: error,
		};
	}

	// 8. Truly unknown - string, null, undefined, or other primitive
	return {
		kind: 'unknown',
		message: error != null ? String(error) : 'An unexpected error occurred',
		raw: error,
	};
};

/**
 * Helper to get a user-friendly message from any ApiFailure.
 * Useful for simple toast notifications.
 */
export const getFailureMessage = (
	failure: ApiFailure,
	t?: (key: string) => string,
): string => {
	switch (failure.kind) {
		case 'validation':
			// For validation, prefer translationKey, then generic message
			if (failure.translationKey && t) {
				return t(failure.translationKey);
			}
			return failure.detail ?? failure.title ?? 'Validation failed';

		case 'problem':
			// For problem, prefer translationKey, then detail, then title
			if (failure.translationKey && t) {
				return t(failure.translationKey);
			}
			return failure.detail ?? failure.title ?? 'An error occurred';

		case 'network':
			return failure.message;

		case 'abort':
			return ''; // Never displayed

		case 'unknown':
			return failure.message;
	}
};
