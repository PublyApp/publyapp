import { IconId } from '@tabler/icons-react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import {
	DangerZoneCard,
	DangerZoneRow,
	DetailAside,
	DetailGrid,
	DetailMain,
} from '~/components/ui/detail-layout';
import { StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
import { formatDateTime } from '~/lib/format-date-time';
import type { AssignedStaffProfile } from '~/lib/query/staff-users';
import {
	formatAccountLevelLabel,
	formatStaffStatusLabel,
} from '~/routes/authed/staff/staff-users/status-labels';

import { useStaffUserOverviewContext } from './_overview-context';

const DetailMetaItem = ({
	label,
	value,
}: {
	label: string;
	value: React.ReactNode;
}) => (
	<div className="space-y-1.5">
		<div className="publy-type-metadata-label">{label}</div>
		<div className="publy-type-metadata-value">{value}</div>
	</div>
);

const ContactDetailsCard = ({
	details,
	locale,
}: {
	details: {
		displayName: string;
		email: string;
		firstName: string | null;
		lastName: string | null;
		accountLevel: string | null;
		status: string | null;
		createdAt: Date | null;
		updatedAt: Date | null;
	};
	locale: string;
}) => {
	const { t } = useTranslation('common');

	return (
		<section className="rounded-[var(--publy-radius-card)] bg-[var(--publy-surface)] shadow-[var(--publy-shadow-ring)]">
			<div className="publy-card-header">
				<p className="publy-type-section-title">{t('contact-details')}</p>
			</div>
			<div className="px-4 pb-4 pt-3">
				<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
					<DetailMetaItem label={t('name')} value={details.displayName} />
					<DetailMetaItem
						label={t('email')}
						value={details.email || t('no-email-address')}
					/>
					{details.accountLevel ? (
						<DetailMetaItem
							label={t('role')}
							value={formatAccountLevelLabel(details.accountLevel, t)}
						/>
					) : null}
					<DetailMetaItem
						label={t('status')}
						value={
							<StatusPill tone={statusPillTone(details.status)}>
								{formatStaffStatusLabel(details.status, t)}
							</StatusPill>
						}
					/>
					<DetailMetaItem
						label={t('created')}
						value={formatDateTime(details.createdAt, locale)}
					/>
					<DetailMetaItem
						label={t('updated')}
						value={formatDateTime(details.updatedAt, locale)}
					/>
				</div>
			</div>
		</section>
	);
};

const AssignedProfilesCard = ({
	profiles,
	maxProfiles,
}: {
	profiles: AssignedStaffProfile[];
	maxProfiles: number;
}) => {
	const { t } = useTranslation('common');
	const assignedCount = profiles.length;
	const meterPercent =
		maxProfiles > 0 ? Math.min((assignedCount / maxProfiles) * 100, 100) : 0;

	return (
		<section className="rounded-[var(--publy-radius-card)] bg-[var(--publy-surface)] shadow-[var(--publy-shadow-ring)]">
			<div className="publy-card-header">
				<p className="publy-type-section-title">
					{t('assigned-profiles-and-roles')}
				</p>
				<span className="text-xs text-muted-foreground">
					{t('assigned-count', { count: assignedCount })}
				</span>
			</div>
			<div className="px-4 pb-4 pt-3 space-y-4">
				{profiles.length === 0 ? (
					<div className="rounded-large border border-dashed border-border bg-muted/30 px-4 py-4 text-sm text-muted-foreground">
						{t('no-profiles-assigned')}
					</div>
				) : (
					<div className="space-y-2">
						{profiles.map((profile) => (
							<div
								key={profile.id}
								className="flex items-center justify-between gap-3 rounded-[10px] px-1 py-1"
							>
								<div className="flex min-w-0 items-center gap-2.5">
									<span
										aria-hidden="true"
										className="publy-icon-tile inline-flex h-7 w-7 items-center justify-center rounded-[9px]"
									>
										<IconId className="size-4" />
									</span>
									<div className="min-w-0">
										<Link
											to="/staff/profiles/$profileId"
											params={{ profileId: profile.id }}
											className="text-sm font-medium text-foreground hover:underline"
										>
											{profile.name}
										</Link>
										<p
											className="truncate text-xs text-muted-foreground"
											title={profile.description || undefined}
										>
											{profile.description ?? t('no-description-provided')}
										</p>
									</div>
								</div>
							</div>
						))}
					</div>
				)}
				{maxProfiles > 0 ? (
					<div className="rounded-[9px] border border-border bg-background p-2">
						<div className="flex items-center justify-between text-xs text-muted-foreground">
							<span>{t('profile-summary')}</span>
							<span>
								{t('count-of-max', { count: assignedCount, max: maxProfiles })}
							</span>
						</div>
						<div className="mt-2 h-1 rounded-[4px] bg-[var(--publy-row-border)]">
							<div
								className="h-full rounded-[4px] bg-[var(--publy-primary)]"
								style={{ width: `${meterPercent}%` }}
							/>
						</div>
					</div>
				) : null}
			</div>
		</section>
	);
};

const AccountCard = ({ displayId }: { displayId: string }) => {
	const { t } = useTranslation('common');

	return (
		<section className="rounded-[var(--publy-radius-card)] bg-[var(--publy-surface)] shadow-[var(--publy-shadow-ring)]">
			<div className="publy-card-header">
				<p className="publy-type-section-title">{t('account')}</p>
			</div>
			<div className="px-4 pb-4 pt-3">
				<div className="space-y-3 text-sm">
					<DetailMetaItem label={t('user-id')} value={displayId} />
				</div>
			</div>
		</section>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/staff/staff-users/$userId/',
)({
	component: StaffUserOverviewTab,
});

function StaffUserOverviewTab() {
	const { t } = useTranslation('common');
	const {
		user,
		locale,
		profiles,
		profilesHasError,
		maxProfilesPerUser,
		canSuspend,
		canReactivate,
		suspendLabelKey,
		suspendDescription,
		isDeletePending,
		onOpenSuspendDialog,
		onOpenDeleteDialog,
	} = useStaffUserOverviewContext();

	return (
		<DetailGrid>
			<DetailMain>
				<ContactDetailsCard details={user} locale={locale} />
				{profilesHasError ? (
					<div
						data-testid="staff-user-profiles-error"
						className="rounded-[var(--publy-radius-card)] bg-[var(--publy-surface)] p-4 shadow-[var(--publy-shadow-ring)] text-sm text-muted-foreground"
					>
						{t('unable-to-load-assigned-profiles')}
					</div>
				) : (
					<AssignedProfilesCard
						profiles={profiles}
						maxProfiles={maxProfilesPerUser}
					/>
				)}
			</DetailMain>
			<DetailAside>
				<AccountCard displayId={user.id} />
				<DangerZoneCard title={t('danger-zone')}>
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
								{t(suspendLabelKey)}
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
								{t('delete')}
							</Button>
						}
					/>
				</DangerZoneCard>
			</DetailAside>
		</DetailGrid>
	);
}
