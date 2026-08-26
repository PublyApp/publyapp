import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';

import { MALFORMED_ID_TRANSLATION_KEY } from '../../_tenant-details-shell';

const isProblemStatus = (
	error: unknown,
	status: number,
	translationKey?: string,
): boolean => {
	const failure = toApiFailure(error);

	if (failure.kind !== 'problem' || failure.status !== status) {
		return false;
	}

	return (
		translationKey === undefined || failure.translationKey === translationKey
	);
};

/**
 * The failure surfaces this route can own, classified from an error by
 * `classifyProfileDetailsFailure`.
 */
export type ProfileDetailsErrorSurface =
	| 'not-found'
	| 'forbidden'
	| 'load-failed'
	| 'unclassified';

/**
 * The ONE status classifier for this route's failures — shared verbatim by
 * the page body's error path (`TenantProfileDetailsError`) and the route's
 * `errorComponent` (#851 round 2), so a loader rejection resolves to the
 * same surface the equivalent in-page failure would. `unclassified` marks a
 * failure with no recognizable API-failure shape (a programming error, not
 * a server answer); the route boundary rethrows those to the parent layout
 * boundary instead of guessing a view for them.
 */
export const classifyProfileDetailsFailure = (
	error: unknown,
): ProfileDetailsErrorSurface => {
	if (
		isProblemStatus(error, 404) ||
		isProblemStatus(error, 400, MALFORMED_ID_TRANSLATION_KEY)
	) {
		return 'not-found';
	}

	if (isProblemStatus(error, 403)) {
		return 'forbidden';
	}

	const failure = toApiFailure(error);

	if (
		failure.kind === 'problem' ||
		failure.kind === 'network' ||
		failure.kind === 'validation'
	) {
		return 'load-failed';
	}

	return 'unclassified';
};
