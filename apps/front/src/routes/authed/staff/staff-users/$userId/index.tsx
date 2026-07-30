import { IconId, IconLoader2 } from '@tabler/icons-react';
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

import { staffUserCrumbsBase } from './_crumbs';
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
	const { t } = useTranslation(['staff-users', 'common']);

	return (
		<section className="rounded-[var(--publy-radius-card)] bg-[var(--publy-surface)] shadow-[var(--publy-shadow-ring)]">
			<div className="publy-card-header">
				<p className="publy-type-section-title">{t('contact-details')}</p>
			</div>
			<div className="px-4 pb-4 pt-3">
				<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
					<DetailMetaItem
						label={t('common:name')}
						value={details.displayName}
					/>
					<DetailMetaItem
						label={t('common:email')}
						value={details.email || t('common:no-email-address')}
					/>
					{details.accountLevel ? (
						<DetailMetaItem
							label={t('role')}
							value={formatAccountLevelLabel(details.accountLevel, t)}
						/>
					) : null}
					<DetailMetaItem
						label={t('common:status')}
						value={
							<StatusPill tone={statusPillTone(details.status)}>
								{formatStaffStatusLabel(details.status, t)}
							</StatusPill>
						}
					/>
					<DetailMetaItem
						label={t('common:created')}
						value={formatDateTime(details.createdAt, locale)}
					/>
					<DetailMetaItem
						label={t('common:updated')}
						value={formatDateTime(details.updatedAt, locale)}
					/>
				</div>
			</div>
		</section>
	);
};

const AssignedProfilesLoadingCard = () => {
	const { t } = useTranslation(['staff-users', 'common']);

	return (
		<section
			className="rounded-[var(--publy-radius-card)] bg-[var(--publy-surface)] shadow-[var(--publy-shadow-ring)]"
			data-testid="staff-user-profiles-loading"
		>
			<div className="publy-card-header">
				<p className="publy-type-section-title">
					{t('assigned-profiles-and-roles')}
				</p>
			</div>
			<div className="flex items-center gap-2.5 px-4 pb-4 pt-3 text-sm text-muted-foreground">
				<IconLoader2
					role="status"
					aria-label={t('common:common-loading')}
					className="size-4 animate-spin"
				/>
				<span>{t('loading-assigned-profiles')}</span>
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
	const { t } = useTranslation(['staff-users', 'common']);
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
											{profile.name ?? t('common:unnamed-profile')}
										</Link>
										<p
											className="truncate text-xs text-muted-foreground"
											title={profile.description || undefined}
										>
											{profile.description ??
												t('common:no-description-provided')}
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
	const { t } = useTranslation(['staff-users', 'common']);

	return (
		<section className="rounded-[var(--publy-radius-card)] bg-[var(--publy-surface)] shadow-[var(--publy-shadow-ring)]">
			<div className="publy-card-header">
				<p className="publy-type-section-title">{t('account')}</p>
			</div>
			<div className="px-4 pb-4 pt-3">
				<div className="space-y-3 text-sm">
					<DetailMetaItem label={t('common:user-id')} value={displayId} />
				</div>
			</div>
		</section>
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

function StaffUserOverviewTab() {
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
}
