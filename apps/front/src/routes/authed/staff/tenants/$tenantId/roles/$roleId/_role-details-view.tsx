import { IconArrowLeft } from '@tabler/icons-react';
import { Link, Outlet } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import type { StaffTenantRoleDetails } from '~/lib/query/staff-tenant-roles';
import type { StaffTenantDetails } from '~/lib/query/staff-tenants';

import { RoleEditDetailsDrawer } from '../_role-edit-details-drawer';
import { RoleIdentityHeader } from '../_role-identity-header';
import { RoleSectionNavLink } from '../_role-section-nav-link';
import { RoleTenantBand } from '../_role-tenant-band';
import {
	StaffTenantRoleDetailsContext,
	type StaffTenantRoleDetailsContextValue,
} from './_details-context';
import type { RoleSection } from './_sections';

type RoleDetailsViewProps = {
	tenantId: string;
	roleId: string;
	tenant: StaffTenantDetails;
	role: StaffTenantRoleDetails;
	permissionKeys: string[];
	activeSection: RoleSection;
	detailsContextValue: StaffTenantRoleDetailsContextValue;
	pendingDelete: boolean;
	isDeletePending: boolean;
	onDeleteConfirm: () => void;
	onPendingDeleteChange: (isOpen: boolean) => void;
	isEditDrawerOpen: boolean;
	onEditDrawerOpenChange: (isOpen: boolean) => void;
	onEditDirtyChange: (isDirty: boolean) => void;
	onSessionExpired: () => void;
	blockerStatus: string;
	onBlockerProceed: (() => void) | undefined;
	onBlockerReset: (() => void) | undefined;
};

/** The tenant-role detail layout's chrome: back link, tenant band, identity
 * header, section nav, the section `<Outlet />`, and the modal layer. Split out
 * of the route file for `react-doctor/no-giant-component`; markup is
 * unchanged. */
export const RoleDetailsView = ({
	tenantId,
	roleId,
	tenant,
	role,
	permissionKeys,
	activeSection,
	detailsContextValue,
	pendingDelete,
	isDeletePending,
	onDeleteConfirm,
	onPendingDeleteChange,
	isEditDrawerOpen,
	onEditDrawerOpenChange,
	onEditDirtyChange,
	onSessionExpired,
	blockerStatus,
	onBlockerProceed,
	onBlockerReset,
}: RoleDetailsViewProps) => {
	const { t } = useTranslation('staff-tenant-roles');

	return (
		<div
			className="publy-detail-page flex w-full flex-col gap-5"
			data-testid="staff-tenant-role-details-page"
		>
			<Link
				to="/staff/tenants/$tenantId/roles"
				params={{ tenantId }}
				className="publy-back-link"
			>
				<IconArrowLeft aria-hidden="true" className="size-3" />
				{t('back-to-tenant-roles', { name: tenant.name })}
			</Link>

			<RoleTenantBand tenant={tenant} tenantId={tenantId} />

			<RoleIdentityHeader
				role={role}
				permissionCount={permissionKeys.length}
				onEdit={() => onEditDrawerOpenChange(true)}
			/>

			<nav
				aria-label={t('role-sections')}
				className="flex flex-wrap gap-1 border-b border-border"
				data-testid="staff-tenant-role-tabs"
			>
				<RoleSectionNavLink
					activeSection={activeSection}
					label={t('common:overview')}
					section="overview"
					tenantId={tenantId}
					roleId={roleId}
				/>
				<RoleSectionNavLink
					activeSection={activeSection}
					count={permissionKeys.length}
					label={t('common:permissions')}
					section="permissions"
					tenantId={tenantId}
					roleId={roleId}
				/>
				<RoleSectionNavLink
					activeSection={activeSection}
					count={role.userAccountCount}
					label={t('common:members')}
					section="members"
					tenantId={tenantId}
					roleId={roleId}
				/>
			</nav>

			<ConfirmDialog
				isOpen={pendingDelete}
				title={t('common:delete-tenant-role-confirm-title')}
				description={t('common:confirm-delete-tenant-role-description')}
				confirmLabel={t('common:delete')}
				isPending={isDeletePending}
				onConfirm={onDeleteConfirm}
				onOpenChange={onPendingDeleteChange}
			/>

			<StaffTenantRoleDetailsContext.Provider value={detailsContextValue}>
				<Outlet />
			</StaffTenantRoleDetailsContext.Provider>

			<RoleEditDetailsDrawer
				tenantId={tenantId}
				isOpen={isEditDrawerOpen}
				role={role}
				onOpenChange={onEditDrawerOpenChange}
				onSessionExpired={onSessionExpired}
				onDirtyChange={onEditDirtyChange}
				onSaved={() => onEditDrawerOpenChange(false)}
			/>
			<ConfirmDialog
				isOpen={blockerStatus === 'blocked'}
				title={t('common:unsaved-changes-dialog-title')}
				description={t('common:unsaved-changes-dialog-description')}
				confirmLabel={t('common:leave-page')}
				cancelLabel={t('common:cancel')}
				tone="danger"
				onConfirm={() => onBlockerProceed?.()}
				onOpenChange={(isOpen) => {
					if (!isOpen) {
						onBlockerReset?.();
					}
				}}
			/>
		</div>
	);
};
