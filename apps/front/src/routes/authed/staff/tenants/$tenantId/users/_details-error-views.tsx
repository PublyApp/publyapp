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
			testId="staff-tenant-user-details-not-found"
			actions={<BackToTenantsLink />}
		/>
	);
};

export const StaffTenantUserDetailsError = ({
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
		return <View403 />;
	}

	return (
		<AppErrorView
			icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
			code={t('error-500-code')}
			title={t('unable-to-load-tenant-user')}
			description={t('tenant-user-load-error-description')}
			testId="staff-tenant-user-details-error"
			actions={<TenantRetryActions onRetry={onRetry} />}
		/>
	);
};

export const TenantUserDetailsLoading = () => {
	const { t } = useTranslation('common');

	return (
		<div
			className="mx-auto flex min-h-[50vh] w-full max-w-5xl items-center justify-center px-4 py-12"
			data-testid="staff-tenant-user-details-loading"
		>
			<div className="flex items-center gap-3 text-sm text-muted-foreground">
				<LoadingSpinner />
				<span>{t('loading-tenant-user')}</span>
			</div>
		</div>
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
			testId="staff-tenant-user-details-empty"
			actions={<BackToTenantsLink />}
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
			testId="staff-tenant-details-empty"
			actions={<TenantRetryActions onRetry={onRetry} />}
		/>
	);
};
