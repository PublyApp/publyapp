import { IconAlertCircle, IconSearchOff } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { View403 } from '~/components/error-views/View403';
import { LoadingSpinner } from '~/components/ui/loading-spinner';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';

import {
	BackToTenantsLink,
	MALFORMED_ID_TRANSLATION_KEY,
	TenantRetryActions,
} from '../../_tenant-details-shell';

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

const getFailureDescription = (error: unknown, fallback: string): string => {
	const failure = toApiFailure(error);

	if (failure.kind === 'problem' && failure.detail) {
		return failure.detail;
	}

	return fallback;
};

export const ProfileDetailsLoading = () => {
	const { t } = useTranslation('staff-tenant-profiles');

	return (
		<div
			className="mx-auto flex min-h-[50vh] w-full max-w-5xl items-center justify-center px-4 py-12"
			data-testid="staff-tenant-profile-details-loading"
		>
			<div className="flex items-center gap-3 text-sm text-muted-foreground">
				<LoadingSpinner />
				<span>{t('common:loading-tenant-profile')}</span>
			</div>
		</div>
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

export const MissingTenantProfileView = ({ error }: { error: unknown }) => {
	const { t } = useTranslation('staff-tenant-profiles');

	return (
		<AppErrorView
			icon={<IconSearchOff aria-hidden="true" className="size-7" />}
			code={t('common:error-404-code')}
			title={t('common:tenant-profile-not-found-title')}
			description={getFailureDescription(
				error,
				t('common:tenant-profile-not-found-description'),
			)}
			testId="staff-tenant-profile-details-not-found"
			actions={<BackToTenantsLink />}
		/>
	);
};

export const TenantProfileDetailsError = ({
	error,
	onRetry,
}: {
	error: unknown;
	onRetry: () => void;
}) => {
	const { t } = useTranslation('staff-tenant-profiles');

	// Same classifier the route-level `errorComponent` uses (#851 round 2).
	// Unlike the route boundary, the page keeps its catch-all: even an
	// `unclassified` failure renders the generic retry view here.
	const surface = classifyProfileDetailsFailure(error);

	if (surface === 'not-found') {
		return <MissingTenantProfileView error={error} />;
	}

	if (surface === 'forbidden') {
		return <View403 />;
	}

	return (
		<AppErrorView
			icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
			code={t('common:error-500-code')}
			title={t('common:unable-to-load-tenant-profile')}
			description={t('common:tenant-profile-load-error-description')}
			testId="staff-tenant-profile-details-error"
			actions={<TenantRetryActions onRetry={onRetry} />}
		/>
	);
};
