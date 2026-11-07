import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
	RoleEditDetailsDiscardDialog,
	RoleEditDetailsFormContent,
} from '~/components/roles/role-edit-details-form-content';
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerForm,
	DrawerHeader,
	DrawerTitle,
} from '~/components/ui/drawer';
import {
	invalidateStaffRoles,
	useUpdateStaffRoleMutation,
} from '~/lib/query/staff-roles';
import {
	type RoleEditDetailsDrawerProps,
	useRoleEditDetailsForm,
} from '~/lib/roles/use-role-edit-details-form';

const StaffRoleEditDetailsDrawerInner = ({
	isOpen,
	role,
	onOpenChange,
	onSaved,
	onSessionExpired,
	onDirtyChange,
}: RoleEditDetailsDrawerProps) => {
	const { t: tRoles } = useTranslation('staff-tenant-roles');
	const queryClient = useQueryClient();
	const updateRole = useUpdateStaffRoleMutation();
	// The scope difference against the tenant drawer: this PATCH and this
	// invalidation. Everything else is the one shared form.
	const form = useRoleEditDetailsForm({
		role,
		isSaving: updateRole.isPending,
		save: async (values) => {
			await updateRole.mutateAsync({ roleId: role.id, ...values });
		},
		invalidate: () => invalidateStaffRoles(queryClient),
		onOpenChange,
		onSaved,
		onSessionExpired,
		onDirtyChange,
	});

	return (
		<Drawer open={isOpen} onOpenChange={form.handleOpenChange}>
			<DrawerContent width={736} data-testid="staff-role-edit-details-drawer">
				<DrawerHeader>
					<DrawerTitle>{tRoles('edit-details')}</DrawerTitle>
					<DrawerDescription>
						{tRoles('edit-details-subtitle', { name: role.name })}
					</DrawerDescription>
				</DrawerHeader>
				<DrawerForm methods={form.methods} onSubmit={form.onSubmit}>
					<RoleEditDetailsFormContent
						form={form}
						namePlaceholderKey="role-name-placeholder"
					/>
				</DrawerForm>
			</DrawerContent>
			<RoleEditDetailsDiscardDialog form={form} />
		</Drawer>
	);
};

/*
 * Session-keyed mount: each closed -> opened transition bumps a key and
 * remounts the drawer, which seeds itself from the role at mount. A fresh
 * mount happens exactly once per session and never discards an in-progress
 * draft when a refetch replaces the role object under the mounted instance
 * (same id, new object identity). Switching to a different role id
 * remounts, matching a per-role reseed. The 200ms exit animation keeps the
 * closing instance under its old key.
 */
const StaffRoleEditDetailsDrawer = (
	drawerProps: RoleEditDetailsDrawerProps,
) => {
	const [sessionKey, setSessionKey] = useState(0);
	const [wasOpen, setWasOpen] = useState(drawerProps.isOpen);
	if (wasOpen !== drawerProps.isOpen) {
		setWasOpen(drawerProps.isOpen);
		if (drawerProps.isOpen) {
			setSessionKey((key) => key + 1);
		}
	}

	return (
		<StaffRoleEditDetailsDrawerInner
			{...drawerProps}
			key={`${sessionKey}:${drawerProps.role.id}`}
		/>
	);
};

export { StaffRoleEditDetailsDrawer };
