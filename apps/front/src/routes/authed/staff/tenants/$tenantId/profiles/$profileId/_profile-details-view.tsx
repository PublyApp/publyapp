import { IconArrowLeft } from '@tabler/icons-react';
import { Link, Outlet } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import type { StaffTenantProfileDetails } from '~/lib/query/staff-tenant-profiles';
import type { StaffTenantDetails } from '~/lib/query/staff-tenants';

import { ProfileEditDetailsDrawer } from '../_profile-edit-details-drawer';
import { ProfileIdentityHeader } from '../_profile-identity-header';
import { ProfileSectionNavLink } from '../_profile-section-nav-link';
import { ProfileTenantBand } from '../_profile-tenant-band';
import {
	StaffTenantProfileDetailsContext,
	type StaffTenantProfileDetailsContextValue,
} from './_details-context';
import type { ProfileSection } from './_sections';

type ProfileDetailsViewProps = {
	tenantId: string;
	profileId: string;
	tenant: StaffTenantDetails;
	profile: StaffTenantProfileDetails;
	permissionKeys: string[];
	activeSection: ProfileSection;
	detailsContextValue: StaffTenantProfileDetailsContextValue;
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

/** The tenant-profile detail layout's chrome: back link, tenant band, identity
 * header, section nav, the section `<Outlet />`, and the modal layer. Split out
 * of the route file for `react-doctor/no-giant-component`; markup is
 * unchanged. */
export const ProfileDetailsView = ({
	tenantId,
	profileId,
	tenant,
	profile,
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
}: ProfileDetailsViewProps) => {
	const { t } = useTranslation('staff-tenant-profiles');

	return (
		<div
			className="publy-detail-page flex w-full flex-col gap-5"
			data-testid="staff-tenant-profile-details-page"
		>
			<Link
				to="/staff/tenants/$tenantId/profiles"
				params={{ tenantId }}
				className="publy-back-link"
			>
				<IconArrowLeft aria-hidden="true" className="size-3" />
				{t('back-to-tenant-profiles', { name: tenant.name })}
			</Link>

			<ProfileTenantBand tenant={tenant} tenantId={tenantId} />

			<ProfileIdentityHeader
				profile={profile}
				permissionCount={permissionKeys.length}
				onEdit={() => onEditDrawerOpenChange(true)}
			/>

			<nav
				aria-label={t('profile-sections')}
				className="flex flex-wrap gap-1 border-b border-border"
				data-testid="staff-tenant-profile-tabs"
			>
				<ProfileSectionNavLink
					activeSection={activeSection}
					label={t('common:overview')}
					section="overview"
					tenantId={tenantId}
					profileId={profileId}
				/>
				<ProfileSectionNavLink
					activeSection={activeSection}
					count={permissionKeys.length}
					label={t('common:permissions')}
					section="permissions"
					tenantId={tenantId}
					profileId={profileId}
				/>
				<ProfileSectionNavLink
					activeSection={activeSection}
					count={profile.userAccountCount}
					label={t('common:members')}
					section="members"
					tenantId={tenantId}
					profileId={profileId}
				/>
			</nav>

			<ConfirmDialog
				isOpen={pendingDelete}
				title={t('common:delete-tenant-profile-confirm-title')}
				description={t('common:confirm-delete-tenant-profile-description')}
				confirmLabel={t('common:delete')}
				isPending={isDeletePending}
				onConfirm={onDeleteConfirm}
				onOpenChange={onPendingDeleteChange}
			/>

			<StaffTenantProfileDetailsContext.Provider value={detailsContextValue}>
				<Outlet />
			</StaffTenantProfileDetailsContext.Provider>

			<ProfileEditDetailsDrawer
				tenantId={tenantId}
				isOpen={isEditDrawerOpen}
				profile={profile}
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
