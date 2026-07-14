import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';

/**
 * Shared by every anonymous token precheck (accept-invitation, verify-email,
 * reset-password): a terminal 4xx (malformed/expired/reused token, or the
 * API's `.check`/`.details` endpoint declining it outright) means the link
 * itself is invalid. A network failure, an aborted request, or a 5xx means
 * the API just could not be reached right now — that is retryable, and must
 * never be shown as "this link is invalid" (users-auth-r6-F1).
 */
export type PrecheckFailureReason = 'invalid' | 'unavailable';

export const classifyPrecheckFailure = (
	error: unknown,
): PrecheckFailureReason => {
	const failure = toApiFailure(error);

	if (
		failure.kind === 'problem' &&
		failure.status >= 400 &&
		failure.status < 500
	) {
		return 'invalid';
	}

	return 'unavailable';
};
