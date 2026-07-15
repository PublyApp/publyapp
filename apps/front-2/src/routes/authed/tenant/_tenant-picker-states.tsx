import {
	IconAlertCircle,
	IconBuildingOff,
	IconLoader2,
} from '@tabler/icons-react';
import type { UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { StateView } from '~/components/ui/state-view';
import { useLogout } from '~/lib/hooks/use-logout';

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

export const TenantPortalErrorState = ({
	query,
}: {
	query: Pick<UseQueryResult, 'refetch'>;
}) => {
	const { t } = useTranslation('common');
	const { logout, isLoggingOut } = useLogout();

	return (
		<StateView
			scale="inline"
			tone="danger"
			icon={<IconAlertCircle aria-hidden="true" />}
			title={t('failed-to-load-organizations')}
			testId="tenant-portal-error"
			actions={
				<>
					<Button
						variant="default"
						type="button"
						onClick={() => void query.refetch()}
					>
						{t('retry')}
					</Button>
					<Button
						variant="ghost"
						type="button"
						disabled={isLoggingOut}
						onClick={() => logout()}
						className="text-muted-foreground"
						data-testid="tenant-portal-error-logout-button"
					>
						{isLoggingOut ? (
							<IconLoader2 aria-hidden="true" className="size-4 animate-spin" />
						) : null}
						{t('log-out')}
					</Button>
				</>
			}
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
