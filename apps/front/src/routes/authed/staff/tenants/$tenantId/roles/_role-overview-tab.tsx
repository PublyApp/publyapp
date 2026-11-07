import {
	IconArrowRight,
	IconKey,
	IconLayoutGrid,
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
import { AvatarStack } from '~/components/ui/initials-avatar';
import { LoadingSpinner } from '~/components/ui/loading-spinner';
import { PersonAvatar } from '~/components/ui/person-avatar';
import { StatusPill } from '~/components/ui/product-page';
import { StatCard } from '~/components/ui/stat-card';
import type {
	StaffTenantPermissionGroup,
	StaffTenantRoleDetails,
	StaffTenantRoleMemberRow,
} from '~/lib/query/staff-tenant-roles';

import { formatMonthYear } from '../_tenant-details-shell';
import { ROLE_SECTION_ROUTES } from './$roleId/_sections';
import type { RoleDetailsSearchParams } from './_role-details-search';
import type { RolePermissionGlance } from './_role-overview-data';
import { buildRolePermissionGlance } from './_role-overview-data';

const meterPercent = (granted: number, total: number): number => {
	if (total <= 0) {
		return 0;
	}

	return Math.min(100, Math.round((granted / total) * 100));
};

const memberDisplayName = (member: StaffTenantRoleMemberRow): string =>
	member.displayName;

/** Honest members preview: distinct loading / error / empty / loaded branches,
 * mirroring the QueryDisplay contract used elsewhere in this slice. */
const MembersPreviewBody = ({
	members,
	isPending,
	isError,
	totalCount,
}: {
	members: StaffTenantRoleMemberRow[];
	isPending: boolean;
	isError: boolean;
	totalCount: number;
}) => {
	const { t } = useTranslation('staff-tenant-roles');

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
					<PersonAvatar
						name={memberDisplayName(member)}
						avatarUrl={member.avatarUrl}
						size="sm"
					/>
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

/** Section link that preserves the rest of the URL search state, mirroring
 * `RoleSectionNavLink`'s navigation contract. Sections are path segments
 * since #977; only the edit drawer's flag still travels in the search. */
const RoleSectionLink = ({
	tenantId,
	roleId,
	section,
	className,
	children,
}: {
	tenantId: string;
	roleId: string;
	section: 'permissions' | 'members';
	className?: string;
	children: ReactNode;
}) => (
	<Link
		to={ROLE_SECTION_ROUTES[section]}
		params={{ tenantId, roleId }}
		search={(previous): RoleDetailsSearchParams => ({
			// Only the details layout owns `?edit=1`; anything else in the
			// merged search belongs to sibling routes, not to a section URL.
			edit: previous.edit === 1 ? 1 : undefined,
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
	glance: RolePermissionGlance;
	isCatalogPending: boolean;
	isCatalogError: boolean;
}) => {
	const { t } = useTranslation('staff-tenant-roles');

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
		<ul className="flex flex-col divide-y divide-border">
			{glance.modules.map((module) => (
				<li
					key={module.moduleKey}
					className="flex items-center justify-between gap-2 px-4 py-2.5"
				>
					<span className="text-sm font-medium text-foreground">
						{module.moduleLabel}
					</span>
					{/* The chip is a compact "granted/total" glyph — screen readers get
					    the equivalent sentence instead of relying on the visual chip. */}
					<span
						className="publy-detail-chip publy-detail-chip--outline"
						aria-hidden="true"
					>
						{module.grantedCount}/{module.totalCount}
					</span>
					<span className="sr-only">
						{/* `count` drives i18next's plural-form selection (singular
						    "permission" only when the MODULE'S total is 1) — it must
						    stay a separate option from the displayed `total`, since
						    French pluralises differently from English (French treats
						    both 0 and 1 as singular; English treats only 1 as singular). */}
						{t('role-glance-module-count', {
							module: module.moduleLabel,
							granted: module.grantedCount,
							total: module.totalCount,
							count: module.totalCount,
						})}
					</span>
				</li>
			))}
		</ul>
	);
};

export const RoleOverviewTab = ({
	tenantId,
	role,
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
	role: StaffTenantRoleDetails;
	permissionKeys: string[];
	permissionGroups: StaffTenantPermissionGroup[];
	isCatalogPending: boolean;
	isCatalogError: boolean;
	members: StaffTenantRoleMemberRow[];
	membersPending: boolean;
	membersError: boolean;
	locale: string;
	onDeleteRequest: () => void;
	isDeletePending: boolean;
}) => {
	const { t } = useTranslation('staff-tenant-roles');
	const glance = buildRolePermissionGlance(permissionGroups, permissionKeys);
	const catalogReady =
		!isCatalogPending && !isCatalogError && glance.catalogTotal > 0;
	// The stack shows up to 5 leading members; the overflow badge counts the rest
	// against the role's true member total (the query only fetches the lead).
	const stackPeople = members.slice(0, 5).map((member) => ({
		id: member.id,
		name: memberDisplayName(member),
		avatarUrl: member.avatarUrl,
	}));
	const membersOverflow = Math.max(
		role.userAccountCount - stackPeople.length,
		0,
	);

	return (
		<div
			className="flex flex-col gap-5"
			data-testid="staff-tenant-role-overview-content"
		>
			<div className="publy-stat-row">
				<StatCard
					testId="role-stat-members"
					label={t('common:members')}
					icon={<IconUsers aria-hidden="true" className="size-[14px]" />}
					secondary={
						stackPeople.length > 0 ? (
							<div
								className="flex items-center gap-2"
								data-testid="role-stat-members-stack"
							>
								<AvatarStack people={stackPeople} />
								{membersOverflow > 0 ? (
									<span className="publy-stat-card-link">
										{t('members-more-count', { count: membersOverflow })}
									</span>
								) : null}
							</div>
						) : (
							<RoleSectionLink
								tenantId={tenantId}
								roleId={role.id}
								section="members"
								className="publy-stat-card-link"
							>
								{t('view-members')}
							</RoleSectionLink>
						)
					}
				>
					{role.userAccountCount}
				</StatCard>

				<StatCard
					testId="role-stat-permissions"
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
					testId="role-stat-modules"
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
					testId="role-stat-type"
					label={t('type')}
					icon={<IconShieldCheck aria-hidden="true" className="size-[14px]" />}
					secondary={
						role.createdAt ? (
							<span>
								{t('role-created-month', {
									date: formatMonthYear(role.createdAt, locale),
								})}
							</span>
						) : null
					}
				>
					<StatusPill tone={role.isDefault ? 'primary' : 'neutral'}>
						{role.isDefault ? t('system-role') : t('custom-role')}
					</StatusPill>
				</StatCard>
			</div>

			<DetailGrid>
				<DetailMain className="flex flex-col gap-4">
					{role.description ? (
						<section className="rounded-[var(--publy-radius-card)] bg-card shadow-[var(--publy-shadow-ring)]">
							<div className="publy-card-header">
								<p className="publy-type-section-title">
									{t('about-this-role')}
								</p>
							</div>
							<p className="px-4 pb-4 pt-3 text-sm text-muted-foreground">
								{role.description}
							</p>
						</section>
					) : null}

					<section
						className="rounded-[var(--publy-radius-card)] bg-card shadow-[var(--publy-shadow-ring)]"
						data-testid="role-permissions-glance"
					>
						<div className="publy-card-header">
							<div className="min-w-0">
								<p className="publy-type-section-title">
									{t('permissions-at-a-glance')}
								</p>
								{catalogReady ? (
									<p className="publy-type-helper mt-0.5">
										{t('role-glance-summary', {
											granted: glance.grantedTotal,
											total: glance.catalogTotal,
											count: glance.modulesWithAccess,
										})}
									</p>
								) : null}
							</div>
							<RoleSectionLink
								tenantId={tenantId}
								roleId={role.id}
								section="permissions"
								className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
							>
								{t('manage')}
								<IconArrowRight aria-hidden="true" className="size-3.5" />
							</RoleSectionLink>
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
						data-testid="role-members-preview"
					>
						<div className="publy-card-header">
							<p className="publy-type-section-title">
								{t('common:members')} · {role.userAccountCount}
							</p>
							{role.userAccountCount > 0 ? (
								<RoleSectionLink
									tenantId={tenantId}
									roleId={role.id}
									section="members"
									className="text-xs font-medium text-muted-foreground hover:text-foreground"
								>
									{t('view-all-count', { total: role.userAccountCount })}
								</RoleSectionLink>
							) : null}
						</div>
						<MembersPreviewBody
							members={members}
							isPending={membersPending}
							isError={membersError}
							totalCount={role.userAccountCount}
						/>
					</section>

					<DangerZoneCard title={t('common:danger-zone')}>
						<DangerZoneRow
							title={t('common:delete-role')}
							description={
								role.isDefault
									? t('common:default-role-delete-disabled')
									: t('common:confirm-delete-tenant-role-description')
							}
							action={
								role.isDefault ? null : (
									<Button
										type="button"
										variant="destructive"
										size="sm"
										onClick={onDeleteRequest}
										disabled={isDeletePending}
									>
										{t('common:delete-role')}
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
