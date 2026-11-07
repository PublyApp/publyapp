import { IconAlertCircle, IconSearchOff } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { View403 } from '~/components/error-views/View403';
import { LoadingSpinner } from '~/components/ui/loading-spinner';

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

export const RoleMembersLoading = () => {
	const { t } = useTranslation('common');

	return (
		<div
			className="mx-auto flex min-h-[50vh] w-full max-w-5xl items-center justify-center px-4 py-12"
			data-testid="staff-tenant-role-members-loading"
		>
			<div className="flex items-center gap-3 text-sm text-muted-foreground">
				<LoadingSpinner />
				<span>{t('loading-tenant-role')}</span>
			</div>
		</div>
	);
};

const MissingTenantRoleView = () => {
	const { t } = useTranslation('common');

	return (
		<AppErrorView
			icon={<IconSearchOff aria-hidden="true" className="size-7" />}
			code={t('error-404-code')}
			title={t('tenant-role-not-found-title')}
			description={t('tenant-role-not-found-description')}
			testId="staff-tenant-role-members-not-found"
		/>
	);
};

export const TenantRoleMembersError = ({
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
		return <MissingTenantRoleView />;
	}

	if (isProblemStatus(error, 403)) {
		return <View403 />;
	}

	return (
		<AppErrorView
			icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
			code={t('error-500-code')}
			title={t('unable-to-load-tenant-role')}
			description={t('tenant-role-load-error-description')}
			testId="staff-tenant-role-members-error"
			onRetry={onRetry}
		/>
	);
};

export const TenantMissingSlot = ({ onRetry }: { onRetry: () => void }) => {
	const { t } = useTranslation('common');

	return (
		<AppErrorView
			icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
			code={t('error-500-code')}
			title={t('tenant-details-error-title')}
			description={t('tenant-response-incomplete')}
			testId="staff-tenant-details-error"
			onRetry={onRetry}
		/>
	);
};

export const RoleMissingSlot = () => {
	const { t } = useTranslation('common');

	return (
		<AppErrorView
			icon={<IconSearchOff aria-hidden="true" className="size-7" />}
			code={t('error-404-code')}
			title={t('tenant-role-not-found-title')}
			description={t('tenant-role-payload-empty')}
			testId="staff-tenant-role-members-not-found"
		/>
	);
};
