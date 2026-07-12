import {
	IconAlertCircle,
	IconBuildingOff,
	IconLoader2,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { StateView } from '~/components/ui/state-view';

export const TenantPortalLoadingState = () => {
	const { t } = useTranslation('common');

	return (
		<div
			className="flex justify-center py-12"
			data-testid="tenant-portal-loading"
		>
			<IconLoader2
				aria-hidden="true"
				className="size-8 animate-spin text-muted-foreground"
			/>
			<span className="sr-only">{t('common-loading')}</span>
		</div>
	);
};

export const TenantPortalErrorState = () => {
	const { t } = useTranslation('common');

	return (
		<StateView
			scale="inline"
			tone="danger"
			icon={<IconAlertCircle aria-hidden="true" />}
			title={t('failed-to-load-organizations')}
			testId="tenant-portal-error"
		/>
	);
};

export const TenantPortalEmptyState = () => {
	const { t } = useTranslation('common');

	return (
		<StateView
			scale="inline"
			tone="neutral"
			icon={<IconBuildingOff aria-hidden="true" />}
			title={t('no-organizations-found')}
			testId="tenant-portal-empty"
		/>
	);
};
