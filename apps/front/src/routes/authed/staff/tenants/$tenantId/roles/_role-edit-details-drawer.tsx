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
import { useUpdateStaffTenantRoleMutation } from '~/lib/query/staff-tenant-roles';
import { invalidateAllStaffTenantScopes } from '~/lib/query/staff-tenants';
import {
	type RoleEditDetailsDrawerProps as RoleEditDetailsDrawerBaseProps,
	useRoleEditDetailsForm,
} from '~/lib/roles/use-role-edit-details-form';

type RoleEditDetailsDrawerProps = RoleEditDetailsDrawerBaseProps & {
	tenantId: string;
};

const RoleEditDetailsDrawerInner = ({
	tenantId,
	isOpen,
	role,
	onOpenChange,
	onSaved,
	onSessionExpired,
	onDirtyChange,
}: RoleEditDetailsDrawerProps) => {
	const { t: tRoles } = useTranslation('staff-tenant-roles');
	const queryClient = useQueryClient();
	const updateRole = useUpdateStaffTenantRoleMutation();
	// The scope difference against the staff drawer: this PATCH and this
	// invalidation. Everything else is the one shared form.
	const form = useRoleEditDetailsForm({
		role,
		isSaving: updateRole.isPending,
		save: async (values) => {
			await updateRole.mutateAsync({
				tenantId,
				roleId: role.id,
				...values,
			});
		},
		invalidate: () => invalidateAllStaffTenantScopes(queryClient),
		onOpenChange,
		onSaved,
		onSessionExpired,
		onDirtyChange,
	});

	return (
		<Drawer open={isOpen} onOpenChange={form.handleOpenChange}>
			<DrawerContent width={736} data-testid="role-edit-details-drawer">
				<DrawerHeader>
					<DrawerTitle>{tRoles('edit-details')}</DrawerTitle>
					<DrawerDescription>
						{tRoles('edit-details-subtitle', { name: role.name })}
					</DrawerDescription>
				</DrawerHeader>
				<DrawerForm methods={form.methods} onSubmit={form.onSubmit}>
					<RoleEditDetailsFormContent
						form={form}
						namePlaceholderKey="tenant-role-name-placeholder"
					/>
				</DrawerForm>
			</DrawerContent>
			<RoleEditDetailsDiscardDialog form={form} />
		</Drawer>
	);
};

/*
 * Session-keyed mount: each closed -> opened transition bumps a key and
 * remounts the drawer, which seeds itself from the role at mount. The
 * reset effect this replaced ran per render on prop changes; a fresh mount
 * happens exactly once per session and never discards an in-progress draft
 * when a refetch replaces the role object under the mounted instance
 * (same id, new object identity). Switching to a different role id
 * remounts, matching the old per-role reseed. The 200ms exit animation
 * keeps the closing instance under its old key.
 */
const RoleEditDetailsDrawer = (drawerProps: RoleEditDetailsDrawerProps) => {
	const [sessionKey, setSessionKey] = useState(0);
	const [wasOpen, setWasOpen] = useState(drawerProps.isOpen);
	if (wasOpen !== drawerProps.isOpen) {
		setWasOpen(drawerProps.isOpen);
		if (drawerProps.isOpen) {
			setSessionKey((key) => key + 1);
		}
	}

	return (
		<RoleEditDetailsDrawerInner
			{...drawerProps}
			key={`${sessionKey}:${drawerProps.role.id}`}
		/>
	);
};

export { RoleEditDetailsDrawer };
