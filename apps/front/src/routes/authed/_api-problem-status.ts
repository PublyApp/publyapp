import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';

/**
 * HTTP status behind an API problem failure, or undefined for any other
 * failure shape. Shared by the authed layout body (query-error gating) and
 * its error boundary (render-error gating) so both classify identically.
 */
export const getFailureStatus = (error: unknown): number | undefined => {
	const failure = toApiFailure(error);
	return failure.kind === 'problem' ? failure.status : undefined;
};
