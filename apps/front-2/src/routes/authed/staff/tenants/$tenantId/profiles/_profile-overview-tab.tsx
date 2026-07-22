import {
	IconArrowRight,
	IconCircle,
	IconCircleCheck,
	IconKey,
	IconLayoutGrid,
	IconLock,
	IconShieldCheck,
	IconUsers,
} from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import {
	DangerZoneCard,
	DangerZoneRow,
	DetailAside,
	DetailGrid,
	DetailMain,
} from '~/components/ui/detail-layout';
import { AvatarStack, InitialsAvatar } from '~/components/ui/initials-avatar';
import { LoadingSpinner } from '~/components/ui/loading-spinner';
import { StatusPill } from '~/components/ui/product-page';
import { StatCard } from '~/components/ui/stat-card';
import type {
	StaffTenantPermissionGroup,
	StaffTenantProfileDetails,
	StaffTenantProfileMemberRow,
} from '~/lib/query/staff-tenant-profiles';

import { formatMonthYear } from '../_tenant-details-shell';
import type { ProfileDetailsSearchParams } from './_profile-details-search';
import type { ProfilePermissionGlance } from './_profile-overview-data';
import { buildProfilePermissionGlance } from './_profile-overview-data';

const meterPercent = (granted: number, total: number): number => {
	if (total <= 0) {
		return 0;
	}

	return Math.min(100, Math.round((granted / total) * 100));
};

const memberDisplayName = (member: StaffTenantProfileMemberRow): string =>
	member.displayName;

/** Honest members preview: distinct loading / error / empty / loaded branches,
 * mirroring the QueryDisplay contract used elsewhere in this slice. */
const MembersPreviewBody = ({
	members,
	isPending,
	isError,
	totalCount,
}: {
	members: StaffTenantProfileMemberRow[];
	isPending: boolean;
	isError: boolean;
	totalCount: number;
}) => {
	const { t } = useTranslation('staff-tenant-profiles');

	if (isPending) {
		return (
			<div className="flex items-center gap-2 px-4 pb-4 pt-3 text-sm text-muted-foreground">
				<LoadingSpinner />
				<span>{t('loading-members')}</span>
			</div>
		);
	}

	if (isError) {
		return (
			<p className="px-4 pb-4 pt-3 text-sm text-muted-foreground">
				{t('members-load-error')}
			</p>
		);
	}

	const previewMembers = members.slice(0, 4);

	if (totalCount === 0 || previewMembers.length === 0) {
		return (
			<p className="px-4 pb-4 pt-3 text-sm text-muted-foreground">
				{t('common:no-members-yet')}
			</p>
		);
	}

	return (
		<ul className="flex flex-col divide-y divide-border">
			{previewMembers.map((member) => (
				<li key={member.id} className="flex items-center gap-3 px-4 py-2.5">
					<InitialsAvatar name={memberDisplayName(member)} size="sm" />
					<div className="min-w-0">
						<p className="truncate text-sm font-medium text-foreground">
							{memberDisplayName(member)}
						</p>
						{/* When the display name fell back to the email, a secondary
						    email line would repeat the exact same text — omit it. */}
						{member.displayName !== member.email ? (
							<p className="truncate text-xs text-muted-foreground">
								{member.email}
							</p>
						) : null}
					</div>
				</li>
			))}
		</ul>
	);
};

/** Tab-switch link that preserves the rest of the URL search state, mirroring
 * `ProfileSectionNavLink`'s navigation contract (overview clears the param). */
const ProfileTabLink = ({
	tenantId,
	profileId,
	tab,
	className,
	children,
}: {
	tenantId: string;
	profileId: string;
	tab: 'permissions' | 'members';
	className?: string;
	children: ReactNode;
}) => (
	<Link
		to="/staff/tenants/$tenantId/profiles/$profileId"
		params={{ tenantId, profileId }}
		search={(previous: ProfileDetailsSearchParams) => ({
			...previous,
			tab,
		})}
		className={className}
	>
		{children}
	</Link>
);

const PermissionGlanceBody = ({
	glance,
	isCatalogPending,
	isCatalogError,
}: {
	glance: ProfilePermissionGlance;
	isCatalogPending: boolean;
	isCatalogError: boolean;
}) => {
	const { t } = useTranslation('staff-tenant-profiles');

	if (isCatalogPending) {
		return (
			<div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
				<LoadingSpinner />
				<span>{t('common:loading-available-permissions')}</span>
			</div>
		);
	}

	if (isCatalogError) {
		return (
			<p className="px-4 py-6 text-sm text-muted-foreground">
				{t('common:tenant-permission-catalog-load-failed')}
			</p>
		);
	}

	if (glance.modules.length === 0) {
		return (
			<p className="px-4 py-6 text-sm text-muted-foreground">
				{t('common:no-permissions-available')}
			</p>
		);
	}

	return (
		<div className="flex flex-col">
			<div className="flex flex-col divide-y divide-border">
				{glance.modules.map((module) => (
					<div key={module.moduleKey} className="px-4 py-3">
						<div className="mb-2 flex items-center justify-between gap-2">
							<p className="text-sm font-medium text-foreground">
								{module.moduleLabel}
							</p>
							<span className="publy-detail-chip publy-detail-chip--outline">
								{module.grantedCount}/{module.totalCount}
							</span>
						</div>
						<ul className="flex flex-col gap-1.5">
							{module.options.map((option) => (
								<li
									key={option.key}
									className="flex items-center gap-2 text-sm"
									data-granted={option.granted}
								>
									{option.granted ? (
										<IconCircleCheck
											aria-hidden="true"
											className="size-4 shrink-0 text-primary"
										/>
									) : (
										<IconCircle
											aria-hidden="true"
											className="size-4 shrink-0 text-muted-foreground/50"
										/>
									)}
									<span
										className={
											option.granted
												? 'text-foreground'
												: 'text-muted-foreground'
										}
									>
										{option.label}
									</span>
									{/* The icons are aria-hidden and the color split is
									    invisible to screen readers — announce the state. */}
									<span className="sr-only">
										{option.granted
											? t('permission-state-granted')
											: t('permission-state-not-granted')}
									</span>
								</li>
							))}
						</ul>
					</div>
				))}
			</div>

			{glance.zeroAccessModuleLabels.length > 0 ? (
				<div className="flex items-center gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground">
					<IconLock aria-hidden="true" className="size-3.5 shrink-0" />
					<span>
						{t('profile-glance-no-access', {
							modules: glance.zeroAccessModuleLabels.join(', '),
						})}
					</span>
				</div>
			) : null}
		</div>
	);
};

export const ProfileOverviewTab = ({
	tenantId,
	profile,
	permissionKeys,
	permissionGroups,
	isCatalogPending,
	isCatalogError,
	members,
	membersPending,
	membersError,
	locale,
	onDeleteRequest,
	isDeletePending,
}: {
	tenantId: string;
	profile: StaffTenantProfileDetails;
	permissionKeys: string[];
	permissionGroups: StaffTenantPermissionGroup[];
	isCatalogPending: boolean;
	isCatalogError: boolean;
	members: StaffTenantProfileMemberRow[];
	membersPending: boolean;
	membersError: boolean;
	locale: string;
	onDeleteRequest: () => void;
	isDeletePending: boolean;
}) => {
	const { t } = useTranslation('staff-tenant-profiles');
	const glance = buildProfilePermissionGlance(permissionGroups, permissionKeys);
	const catalogReady =
		!isCatalogPending && !isCatalogError && glance.catalogTotal > 0;
	// The stack shows up to 5 leading members; the overflow badge counts the rest
	// against the profile's true member total (the query only fetches the lead).
	const stackNames = members.slice(0, 5).map(memberDisplayName);
	const membersOverflow = Math.max(
		profile.userAccountCount - stackNames.length,
		0,
	);

	return (
		<div
			className="flex flex-col gap-5"
			data-testid="staff-tenant-profile-overview-content"
		>
			<div className="publy-stat-row">
				<StatCard
					testId="profile-stat-members"
					label={t('common:members')}
					icon={<IconUsers aria-hidden="true" className="size-[14px]" />}
					secondary={
						stackNames.length > 0 ? (
							<div
								className="flex items-center gap-2"
								data-testid="profile-stat-members-stack"
							>
								<AvatarStack names={stackNames} />
								{membersOverflow > 0 ? (
									<span className="publy-stat-card-link">
										{t('members-more-count', { count: membersOverflow })}
									</span>
								) : null}
							</div>
						) : (
							<ProfileTabLink
								tenantId={tenantId}
								profileId={profile.id}
								tab="members"
								className="publy-stat-card-link"
							>
								{t('view-members')}
							</ProfileTabLink>
						)
					}
				>
					{profile.userAccountCount}
				</StatCard>

				<StatCard
					testId="profile-stat-permissions"
					label={t('common:permissions')}
					icon={<IconKey aria-hidden="true" className="size-[14px]" />}
					secondary={
						catalogReady ? (
							<div className="publy-stat-meter">
								<div
									className="publy-stat-meter-fill"
									style={{
										width: `${meterPercent(glance.grantedTotal, glance.catalogTotal)}%`,
									}}
								/>
							</div>
						) : (
							<span>{t('granted')}</span>
						)
					}
				>
					{glance.grantedTotal}
					{catalogReady ? (
						<span className="publy-stat-card-value-suffix">
							{' '}
							/ {glance.catalogTotal}
						</span>
					) : null}
				</StatCard>

				<StatCard
					testId="profile-stat-modules"
					label={t('modules')}
					icon={<IconLayoutGrid aria-hidden="true" className="size-[14px]" />}
					secondary={<span>{t('with-access')}</span>}
				>
					{glance.modulesWithAccess}
					{catalogReady ? (
						<span className="publy-stat-card-value-suffix">
							{' '}
							/ {glance.totalModules}
						</span>
					) : null}
				</StatCard>

				<StatCard
					testId="profile-stat-type"
					label={t('type')}
					icon={<IconShieldCheck aria-hidden="true" className="size-[14px]" />}
					secondary={
						profile.createdAt ? (
							<span>
								{t('profile-created-month', {
									date: formatMonthYear(profile.createdAt, locale),
								})}
							</span>
						) : null
					}
				>
					<StatusPill tone={profile.isDefault ? 'primary' : 'neutral'}>
						{profile.isDefault ? t('system-profile') : t('custom-profile')}
					</StatusPill>
				</StatCard>
			</div>

			<DetailGrid>
				<DetailMain className="flex flex-col gap-4">
					{profile.description ? (
						<section className="rounded-[var(--publy-radius-card)] bg-card shadow-[var(--publy-shadow-ring)]">
							<div className="publy-card-header">
								<p className="publy-type-section-title">
									{t('about-this-profile')}
								</p>
							</div>
							<p className="px-4 pb-4 pt-3 text-sm text-muted-foreground">
								{profile.description}
							</p>
						</section>
					) : null}

					<section
						className="rounded-[var(--publy-radius-card)] bg-card shadow-[var(--publy-shadow-ring)]"
						data-testid="profile-permissions-glance"
					>
						<div className="publy-card-header">
							<div className="min-w-0">
								<p className="publy-type-section-title">
									{t('permissions-at-a-glance')}
								</p>
								{catalogReady ? (
									<p className="publy-type-helper mt-0.5">
										{t('profile-glance-summary', {
											granted: glance.grantedTotal,
											total: glance.catalogTotal,
											count: glance.modulesWithAccess,
										})}
									</p>
								) : null}
							</div>
							<ProfileTabLink
								tenantId={tenantId}
								profileId={profile.id}
								tab="permissions"
								className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
							>
								{t('manage')}
								<IconArrowRight aria-hidden="true" className="size-3.5" />
							</ProfileTabLink>
						</div>
						<PermissionGlanceBody
							glance={glance}
							isCatalogPending={isCatalogPending}
							isCatalogError={isCatalogError}
						/>
					</section>
				</DetailMain>

				<DetailAside className="flex flex-col gap-4">
					<section
						className="rounded-[var(--publy-radius-card)] bg-card shadow-[var(--publy-shadow-ring)]"
						data-testid="profile-members-preview"
					>
						<div className="publy-card-header">
							<p className="publy-type-section-title">
								{t('common:members')} · {profile.userAccountCount}
							</p>
							{profile.userAccountCount > 0 ? (
								<ProfileTabLink
									tenantId={tenantId}
									profileId={profile.id}
									tab="members"
									className="text-xs font-medium text-muted-foreground hover:text-foreground"
								>
									{t('view-all-count', { total: profile.userAccountCount })}
								</ProfileTabLink>
							) : null}
						</div>
						<MembersPreviewBody
							members={members}
							isPending={membersPending}
							isError={membersError}
							totalCount={profile.userAccountCount}
						/>
					</section>

					<DangerZoneCard title={t('common:danger-zone')}>
						<DangerZoneRow
							title={t('common:delete-profile')}
							description={
								profile.isDefault
									? t('common:default-profile-delete-disabled')
									: t('common:confirm-delete-tenant-profile-description')
							}
							action={
								profile.isDefault ? null : (
									<Button
										type="button"
										variant="destructive"
										size="sm"
										onClick={onDeleteRequest}
										disabled={isDeletePending}
									>
										{t('common:delete-profile')}
									</Button>
								)
							}
						/>
					</DangerZoneCard>
				</DetailAside>
			</DetailGrid>
		</div>
	);
};
