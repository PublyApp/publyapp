import { IconAlertCircle, IconSearchOff } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { View403 } from '~/components/error-views/View403';
import { LoadingSpinner } from '~/components/ui/loading-spinner';

import { classifyRoleDetailsFailure } from './_role-details-error-classifier';

export const RoleDetailsLoading = () => {
	const { t } = useTranslation('staff-tenant-roles');

	return (
		<div
			className="mx-auto flex min-h-[50vh] w-full max-w-5xl items-center justify-center px-4 py-12"
			data-testid="staff-tenant-role-details-loading"
		>
			<div className="flex items-center gap-3 text-sm text-muted-foreground">
				<LoadingSpinner />
				<span>{t('common:loading-tenant-role')}</span>
			</div>
		</div>
	);
};

export const MissingTenantRoleView = () => {
	const { t } = useTranslation('staff-tenant-roles');

	return (
		<AppErrorView
			icon={<IconSearchOff aria-hidden="true" className="size-7" />}
			code={t('common:error-404-code')}
			title={t('common:tenant-role-not-found-title')}
			description={t('common:tenant-role-not-found-description')}
			testId="staff-tenant-role-details-not-found"
		/>
	);
};

export const TenantRoleDetailsError = ({
	error,
	onRetry,
}: {
	error: unknown;
	onRetry: () => void;
}) => {
	const { t } = useTranslation('staff-tenant-roles');

	// Same classifier the route-level `errorComponent` uses (#851 round 2).
	// Unlike the route boundary, the page keeps its catch-all: even an
	// `unclassified` failure renders the generic retry view here.
	const surface = classifyRoleDetailsFailure(error);

	if (surface === 'not-found') {
		return <MissingTenantRoleView />;
	}

	if (surface === 'forbidden') {
		return <View403 />;
	}

	return (
		<AppErrorView
			icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
			code={t('common:error-500-code')}
			title={t('common:unable-to-load-tenant-role')}
			description={t('common:tenant-role-load-error-description')}
			testId="staff-tenant-role-details-error"
			onRetry={onRetry}
		/>
	);
};
