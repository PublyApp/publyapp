import { IconAlertCircle, IconLock, IconSearchOff } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LoadingSpinner } from '~/components/ui/loading-spinner';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';

import {
	BackToTenantsLink,
	MALFORMED_ID_TRANSLATION_KEY,
	TenantRetryActions,
} from '../_tenant-details-shell';

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

export const TenantUserEditLoading = () => {
	const { t } = useTranslation('common');

	return (
		<div
			className="mx-auto flex min-h-[50vh] w-full max-w-3xl items-center justify-center px-4 py-12"
			data-testid="staff-tenant-user-edit-loading"
		>
			<div className="flex items-center gap-3 text-sm text-muted-foreground">
				<LoadingSpinner />
				<span>{t('loading-tenant-user')}</span>
			</div>
		</div>
	);
};

const MissingTenantUserView = ({ error }: { error: unknown }) => {
	const { t } = useTranslation('common');

	return (
		<AppErrorView
			icon={<IconSearchOff aria-hidden="true" className="size-7" />}
			code={t('error-404-code')}
			title={t('tenant-user-not-found-title')}
			description={getFailureDescription(
				error,
				t('tenant-user-not-found-description'),
			)}
			testId="staff-tenant-user-edit-not-found"
			actions={<BackToTenantsLink />}
		/>
	);
};

export const TenantUserEditError = ({
	error,
	onRetry,
}: {
	error: unknown;
	onRetry: () => void;
}) => {
	const { t } = useTranslation('common');

	if (
		isProblemStatus(error, 404) ||
		isProblemStatus(error, 400, MALFORMED_ID_TRANSLATION_KEY)
	) {
		return <MissingTenantUserView error={error} />;
	}

	if (isProblemStatus(error, 403)) {
		return (
			<AppErrorView
				icon={<IconLock aria-hidden="true" className="size-7" />}
				code={t('error-403-code')}
				title={t('no-access-title')}
				description={t('tenant-user-edit-forbidden-description')}
				testId="forbidden-view"
			/>
		);
	}

	return (
		<AppErrorView
			icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
			code={t('error-500-code')}
			title={t('unable-to-load-tenant-user')}
			description={t('tenant-user-load-error-description')}
			testId="staff-tenant-user-edit-error"
			actions={<TenantRetryActions onRetry={onRetry} />}
		/>
	);
};

export const TenantDetailsIncompleteView = ({
	onRetry,
}: {
	onRetry: () => void;
}) => {
	const { t } = useTranslation('common');

	return (
		<AppErrorView
			icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
			code={t('error-500-code')}
			title={t('tenant-details-error-title')}
			description={t('tenant-response-incomplete')}
			testId="staff-tenant-details-error"
			actions={<TenantRetryActions onRetry={onRetry} />}
		/>
	);
};

export const MissingTenantUserPayloadView = () => {
	const { t } = useTranslation('common');

	return (
		<AppErrorView
			icon={<IconSearchOff aria-hidden="true" className="size-7" />}
			code={t('error-404-code')}
			title={t('tenant-user-not-found-title')}
			description={t('tenant-user-payload-empty')}
			testId="staff-tenant-user-edit-not-found"
			actions={<BackToTenantsLink />}
		/>
	);
};
