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
import { LoadingSpinner } from '~/components/ui/loading-spinner';
import { StatusPill } from '~/components/ui/product-page';
import { StatCard } from '~/components/ui/stat-card';
import type {
	StaffTenantPermissionGroup,
	StaffTenantProfileDetails,
} from '~/lib/query/staff-tenant-profiles';

import { formatMonthYear } from '../_tenant-details-shell';
import type { ProfileDetailsSearchParams } from './_profile-details-search';
import { buildProfilePermissionGlance } from './_profile-overview-data';

const meterPercent = (granted: number, total: number): number => {
	if (total <= 0) {
		return 0;
	}

	return Math.min(100, Math.round((granted / total) * 100));
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
	permissionGroups,
	permissionKeys,
	isCatalogPending,
	isCatalogError,
}: {
	permissionGroups: StaffTenantPermissionGroup[];
	permissionKeys: string[];
	isCatalogPending: boolean;
	isCatalogError: boolean;
}) => {
	const { t } = useTranslation('common');

	if (isCatalogPending) {
		return (
			<div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
				<LoadingSpinner />
				<span>{t('loading-available-permissions')}</span>
			</div>
		);
	}

	if (isCatalogError) {
		return (
			<p className="px-4 py-6 text-sm text-muted-foreground">
				{t('tenant-permission-catalog-load-failed')}
			</p>
		);
	}

	const glance = buildProfilePermissionGlance(permissionGroups, permissionKeys);

	if (glance.modules.length === 0) {
		return (
			<p className="px-4 py-6 text-sm text-muted-foreground">
				{t('no-permissions-available')}
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
	locale: string;
	onDeleteRequest: () => void;
	isDeletePending: boolean;
}) => {
	const { t } = useTranslation('common');
	const glance = buildProfilePermissionGlance(permissionGroups, permissionKeys);
	const catalogReady =
		!isCatalogPending && !isCatalogError && glance.catalogTotal > 0;

	return (
		<div
			className="flex flex-col gap-5"
			data-testid="staff-tenant-profile-overview-content"
		>
			<div className="publy-stat-row">
				<StatCard
					testId="profile-stat-members"
					label={t('members')}
					icon={<IconUsers aria-hidden="true" className="size-[14px]" />}
					secondary={
						<ProfileTabLink
							tenantId={tenantId}
							profileId={profile.id}
							tab="members"
							className="publy-stat-card-link"
						>
							{t('view-members')}
						</ProfileTabLink>
					}
				>
					{profile.userAccountCount}
				</StatCard>

				<StatCard
					testId="profile-stat-permissions"
					label={t('permissions')}
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
											modules: glance.modulesWithAccess,
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
							permissionGroups={permissionGroups}
							permissionKeys={permissionKeys}
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
								{t('members')} · {profile.userAccountCount}
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
						<p className="px-4 pb-4 pt-3 text-sm text-muted-foreground">
							{profile.userAccountCount > 0
								? t('profile-members-preview-coming-soon')
								: t('no-members-yet')}
						</p>
					</section>

					<DangerZoneCard title={t('danger-zone')}>
						<DangerZoneRow
							title={t('delete-profile')}
							description={
								profile.isDefault
									? t('default-profile-delete-disabled')
									: t('confirm-delete-tenant-profile-description')
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
										{t('delete-profile')}
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
