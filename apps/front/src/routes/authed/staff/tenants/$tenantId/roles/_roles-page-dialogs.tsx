import type { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import type { StaffTenantRoleRow } from '~/lib/query/staff-tenant-roles';

import { RoleEditDetailsDrawer } from './_role-edit-details-drawer';
import { RoleFormDrawer } from './_role-form-drawer';
import type { RoleFormValues } from './_role-form-schema';

type RolesPageDialogsProps = {
	tenantId: string;
	deleteTarget: StaffTenantRoleRow | null;
	isDeletePending: boolean;
	onDeleteConfirm: () => void;
	onDeleteDialogClose: () => void;
	isCreateDrawerOpen: boolean;
	onCreateDrawerOpenChange: (isOpen: boolean) => void;
	onCreateSaved: (roleId: string) => void;
	/** Page-owned RHF store for the create drawer (develop #1306 contract):
	 * passed straight through instead of relaying dirtiness via callbacks. */
	createMethods: UseFormReturn<RoleFormValues>;
	editDrawerRole: StaffTenantRoleRow | null;
	isEditDrawerOpen: boolean;
	onEditDrawerClose: () => void;
	onEditDirtyChange: (isDirty: boolean) => void;
	onSessionExpired: () => void;
	blockerStatus: string;
	onBlockerProceed: (() => void) | undefined;
	onBlockerReset: (() => void) | undefined;
};

/** The tenant-roles list page's modal layer: the single-row delete confirm,
 * both drawers, and the shared unsaved-changes prompt. Split out of the route
 * file for `react-doctor/no-giant-component`; markup is unchanged. */
export const RolesPageDialogs = ({
	tenantId,
	deleteTarget,
	isDeletePending,
	onDeleteConfirm,
	onDeleteDialogClose,
	isCreateDrawerOpen,
	onCreateDrawerOpenChange,
	onCreateSaved,
	createMethods,
	editDrawerRole,
	isEditDrawerOpen,
	onEditDrawerClose,
	onEditDirtyChange,
	onSessionExpired,
	blockerStatus,
	onBlockerProceed,
	onBlockerReset,
}: RolesPageDialogsProps) => {
	const { t } = useTranslation('common');

	return (
		<>
			<ConfirmDialog
				isOpen={deleteTarget !== null}
				title={t('delete')}
				description={t('confirm-delete-tenant-role-description')}
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
			 * `getRoleFormValues()` without any reset effect. */}
			<RoleFormDrawer
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
			{editDrawerRole ? (
				<RoleEditDetailsDrawer
					tenantId={tenantId}
					isOpen={isEditDrawerOpen}
					role={editDrawerRole}
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
