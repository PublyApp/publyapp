import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import {
	DangerZoneCard,
	DangerZoneRow,
	DetailAside,
	DetailGrid,
	DetailMain,
} from '~/components/ui/detail-layout';

import { AccountCard } from './_account-card';
import { AssignedRolesCard } from './_assigned-roles-card';
import { AssignedRolesLoadingCard } from './_assigned-roles-loading-card';
import { ContactDetailsCard } from './_contact-details-card';
import { staffUserCrumbsBase } from './_crumbs';
import { useStaffUserOverviewContext } from './_overview-context';

const StaffUserOverviewTab = () => {
	const { t } = useTranslation(['staff-users', 'common']);
	const {
		user,
		locale,
		roles,
		rolesIsPending,
		rolesHasError,
		onRetryRoles,
		maxRolesPerUser,
		canSuspend,
		canReactivate,
		suspendLabelKey,
		suspendDescription,
		isDeletePending,
		onOpenSuspendDialog,
		onOpenDeleteDialog,
	} = useStaffUserOverviewContext();

	const renderRolesCard = () => {
		// Order matters: pending must win over the empty-collection render even
		// though `toAssignedStaffRoles` maps an unresolved query's `undefined`
		// data to `[]` — otherwise "no roles assigned" renders as a definitive
		// statement while the authorization query is still outstanding (r5-F6).
		if (rolesIsPending) {
			return <AssignedRolesLoadingCard />;
		}

		if (rolesHasError) {
			return (
				<div
					data-testid="staff-user-roles-error"
					className="space-y-3 rounded-[var(--publy-radius-card)] bg-[var(--publy-surface)] p-4 shadow-[var(--publy-shadow-ring)] text-sm text-muted-foreground"
				>
					<p>{t('unable-to-load-assigned-roles')}</p>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={onRetryRoles}
					>
						{t('common:try-again')}
					</Button>
				</div>
			);
		}

		return <AssignedRolesCard roles={roles} maxRoles={maxRolesPerUser} />;
	};

	return (
		<DetailGrid>
			<DetailMain>
				<ContactDetailsCard details={user} locale={locale} />
				{renderRolesCard()}
			</DetailMain>
			<DetailAside>
				<AccountCard displayId={user.id} />
				<DangerZoneCard title={t('common:danger-zone')}>
					<DangerZoneRow
						title={t('suspend-or-reactivate')}
						description={suspendDescription}
						action={
							<Button
								type="button"
								variant="destructive"
								size="sm"
								onClick={onOpenSuspendDialog}
								disabled={!canSuspend && !canReactivate}
							>
								{t(`common:${suspendLabelKey}`)}
							</Button>
						}
					/>
					<DangerZoneRow
						title={t('confirm-delete-staff-user-title')}
						description={t('confirm-delete-staff-user-message')}
						action={
							<Button
								type="button"
								variant="destructive"
								size="sm"
								onClick={onOpenDeleteDialog}
								disabled={isDeletePending}
							>
								{t('common:delete')}
							</Button>
						}
					/>
				</DangerZoneCard>
			</DetailAside>
		</DetailGrid>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/staff/staff-users/$userId/',
)({
	staticData: {
		i18nNamespaces: ['staff-users'],
		crumbs: staffUserCrumbsBase,
	},
	component: StaffUserOverviewTab,
});
