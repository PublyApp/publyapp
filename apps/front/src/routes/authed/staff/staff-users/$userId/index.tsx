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
import { AssignedProfilesCard } from './_assigned-profiles-card';
import { AssignedProfilesLoadingCard } from './_assigned-profiles-loading-card';
import { ContactDetailsCard } from './_contact-details-card';
import { staffUserCrumbsBase } from './_crumbs';
import { useStaffUserOverviewContext } from './_overview-context';

const StaffUserOverviewTab = () => {
	const { t } = useTranslation(['staff-users', 'common']);
	const {
		user,
		locale,
		profiles,
		profilesIsPending,
		profilesHasError,
		onRetryProfiles,
		maxProfilesPerUser,
		canSuspend,
		canReactivate,
		suspendLabelKey,
		suspendDescription,
		isDeletePending,
		onOpenSuspendDialog,
		onOpenDeleteDialog,
	} = useStaffUserOverviewContext();

	const renderProfilesCard = () => {
		// Order matters: pending must win over the empty-collection render even
		// though `toAssignedStaffProfiles` maps an unresolved query's `undefined`
		// data to `[]` — otherwise "no profiles assigned" renders as a definitive
		// statement while the authorization query is still outstanding (r5-F6).
		if (profilesIsPending) {
			return <AssignedProfilesLoadingCard />;
		}

		if (profilesHasError) {
			return (
				<div
					data-testid="staff-user-profiles-error"
					className="space-y-3 rounded-[var(--publy-radius-card)] bg-[var(--publy-surface)] p-4 shadow-[var(--publy-shadow-ring)] text-sm text-muted-foreground"
				>
					<p>{t('unable-to-load-assigned-profiles')}</p>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={onRetryProfiles}
					>
						{t('common:try-again')}
					</Button>
				</div>
			);
		}

		return (
			<AssignedProfilesCard
				profiles={profiles}
				maxProfiles={maxProfilesPerUser}
			/>
		);
	};

	return (
		<DetailGrid>
			<DetailMain>
				<ContactDetailsCard details={user} locale={locale} />
				{renderProfilesCard()}
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
