import type { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import type { StaffTenantProfileRow } from '~/lib/query/staff-tenant-profiles';

import { ProfileEditDetailsDrawer } from './_profile-edit-details-drawer';
import { ProfileFormDrawer } from './_profile-form-drawer';
import type { ProfileFormValues } from './_profile-form-schema';

type ProfilesPageDialogsProps = {
	tenantId: string;
	deleteTarget: StaffTenantProfileRow | null;
	isDeletePending: boolean;
	onDeleteConfirm: () => void;
	onDeleteDialogClose: () => void;
	isCreateDrawerOpen: boolean;
	onCreateDrawerOpenChange: (isOpen: boolean) => void;
	onCreateSaved: (profileId: string) => void;
	/** Page-owned RHF store for the create drawer (develop #1306 contract):
	 * passed straight through instead of relaying dirtiness via callbacks. */
	createMethods: UseFormReturn<ProfileFormValues>;
	editDrawerProfile: StaffTenantProfileRow | null;
	isEditDrawerOpen: boolean;
	onEditDrawerClose: () => void;
	onEditDirtyChange: (isDirty: boolean) => void;
	onSessionExpired: () => void;
	blockerStatus: string;
	onBlockerProceed: (() => void) | undefined;
	onBlockerReset: (() => void) | undefined;
};

/** The tenant-profiles list page's modal layer: the single-row delete confirm,
 * both drawers, and the shared unsaved-changes prompt. Split out of the route
 * file for `react-doctor/no-giant-component`; markup is unchanged. */
export const ProfilesPageDialogs = ({
	tenantId,
	deleteTarget,
	isDeletePending,
	onDeleteConfirm,
	onDeleteDialogClose,
	isCreateDrawerOpen,
	onCreateDrawerOpenChange,
	onCreateSaved,
	createMethods,
	editDrawerProfile,
	isEditDrawerOpen,
	onEditDrawerClose,
	onEditDirtyChange,
	onSessionExpired,
	blockerStatus,
	onBlockerProceed,
	onBlockerReset,
}: ProfilesPageDialogsProps) => {
	const { t } = useTranslation('common');

	return (
		<>
			<ConfirmDialog
				isOpen={deleteTarget !== null}
				title={t('delete')}
				description={t('confirm-delete-tenant-profile-description')}
				confirmLabel={t('delete')}
				isPending={isDeletePending}
				onConfirm={onDeleteConfirm}
				onOpenChange={(isOpen) => {
					if (!isOpen) {
						onDeleteDialogClose();
					}
				}}
			/>

			{/* Remounting under a fresh key re-seeds the page-owned form from
			 * `getProfileFormValues()` without any reset effect. */}
			<ProfileFormDrawer
				key={`create-${tenantId}:${isCreateDrawerOpen}`}
				tenantId={tenantId}
				isOpen={isCreateDrawerOpen}
				methods={createMethods}
				onOpenChange={onCreateDrawerOpenChange}
				onSessionExpired={onSessionExpired}
				onSaved={onCreateSaved}
			/>

			{/* #972: the same drawer the detail page mounts, hosted here so the
			 * quick edit stays quick — the list underneath never unmounts, so its
			 * filters, cursor page, selection and scroll are exactly where the
			 * user left them when the drawer closes. */}
			{editDrawerProfile ? (
				<ProfileEditDetailsDrawer
					tenantId={tenantId}
					isOpen={isEditDrawerOpen}
					profile={editDrawerProfile}
					onOpenChange={(isOpen) => {
						if (!isOpen) {
							onEditDrawerClose();
						}
					}}
					onSessionExpired={onSessionExpired}
					onDirtyChange={onEditDirtyChange}
					onSaved={() => onEditDrawerClose()}
				/>
			) : null}

			<ConfirmDialog
				isOpen={blockerStatus === 'blocked'}
				title={t('unsaved-changes-dialog-title')}
				description={t('unsaved-changes-dialog-description')}
				confirmLabel={t('leave-page')}
				cancelLabel={t('cancel')}
				tone="danger"
				onConfirm={() => onBlockerProceed?.()}
				onOpenChange={(isOpen) => {
					if (!isOpen) {
						onBlockerReset?.();
					}
				}}
			/>
		</>
	);
};
