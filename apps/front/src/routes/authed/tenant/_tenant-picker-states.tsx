import {
	IconAlertCircle,
	IconBuildingOff,
	IconLoader2,
} from '@tabler/icons-react';
import type { UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { buttonVariants } from '~/components/ui/button.variants';
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

/**
 * #258: two different situations land on this surface and must not read the
 * same. A user who was never invited anywhere gets the neutral "no
 * organizations found" message; a user whose every organization was deleted
 * by staff gets an explicit deletion notice with a support action — a
 * blocking situation shows its cause in plain words (owner product rule).
 * The branch signal is `hasDeletedTenants` from the picker response.
 */
export const TenantPortalEmptyState = ({
	hasDeletedTenants = false,
}: {
	hasDeletedTenants?: boolean;
}) => {
	const { t } = useTranslation('common');

	if (hasDeletedTenants) {
		return (
			<StateView
				scale="inline"
				tone="danger"
				icon={<IconBuildingOff aria-hidden="true" />}
				title={t('all-organizations-deleted-title')}
				description={t('all-organizations-deleted-description')}
				actions={
					<a
						href="mailto:support@publyapp.com?subject=All%20of%20my%20organizations%20were%20deleted"
						className={buttonVariants({ variant: 'outline' })}
						data-testid="tenant-portal-empty-support-link"
					>
						{t('contact-support')}
					</a>
				}
				testId="tenant-portal-empty"
			/>
		);
	}

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
