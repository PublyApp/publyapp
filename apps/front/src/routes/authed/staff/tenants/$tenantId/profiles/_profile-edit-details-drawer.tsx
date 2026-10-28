import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
	ProfileEditDetailsDiscardDialog,
	ProfileEditDetailsFormContent,
} from '~/components/profiles/profile-edit-details-form-content';
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerForm,
	DrawerHeader,
	DrawerTitle,
} from '~/components/ui/drawer';
import {
	type ProfileEditDetailsDrawerProps as ProfileEditDetailsDrawerBaseProps,
	useProfileEditDetailsForm,
} from '~/lib/profiles/use-profile-edit-details-form';
import { useUpdateStaffTenantProfileMutation } from '~/lib/query/staff-tenant-profiles';
import { invalidateAllStaffTenantScopes } from '~/lib/query/staff-tenants';

type ProfileEditDetailsDrawerProps = ProfileEditDetailsDrawerBaseProps & {
	tenantId: string;
};

const ProfileEditDetailsDrawerInner = ({
	tenantId,
	isOpen,
	profile,
	onOpenChange,
	onSaved,
	onSessionExpired,
	onDirtyChange,
}: ProfileEditDetailsDrawerProps) => {
	const { t: tProfiles } = useTranslation('staff-tenant-profiles');
	const queryClient = useQueryClient();
	const updateProfile = useUpdateStaffTenantProfileMutation();
	// The scope difference against the staff drawer: this PATCH and this
	// invalidation. Everything else is the one shared form.
	const form = useProfileEditDetailsForm({
		profile,
		isSaving: updateProfile.isPending,
		save: async (values) =>
			updateProfile.mutateAsync({
				tenantId,
				profileId: profile.id,
				...values,
			}),
		invalidate: () => invalidateAllStaffTenantScopes(queryClient),
		onOpenChange,
		onSaved,
		onSessionExpired,
		onDirtyChange,
	});

	return (
		<Drawer open={isOpen} onOpenChange={form.handleOpenChange}>
			<DrawerContent width={736} data-testid="profile-edit-details-drawer">
				<DrawerHeader>
					<DrawerTitle>{tProfiles('edit-details')}</DrawerTitle>
					<DrawerDescription>
						{tProfiles('edit-details-subtitle', { name: profile.name })}
					</DrawerDescription>
				</DrawerHeader>
				<DrawerForm methods={form.methods} onSubmit={form.onSubmit}>
					<ProfileEditDetailsFormContent
						form={form}
						namePlaceholderKey="tenant-profile-name-placeholder"
					/>
				</DrawerForm>
			</DrawerContent>
			<ProfileEditDetailsDiscardDialog form={form} />
		</Drawer>
	);
};

/*
 * Session-keyed mount: each closed -> opened transition bumps a key and
 * remounts the drawer, which seeds itself from the profile at mount. The
 * reset effect this replaced ran per render on prop changes; a fresh mount
 * happens exactly once per session and never discards an in-progress draft
 * when a refetch replaces the profile object under the mounted instance
 * (same id, new object identity). Switching to a different profile id
 * remounts, matching the old per-profile reseed. The 200ms exit animation
 * keeps the closing instance under its old key.
 */
const ProfileEditDetailsDrawer = (
	drawerProps: ProfileEditDetailsDrawerProps,
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
		<ProfileEditDetailsDrawerInner
			{...drawerProps}
			key={`${sessionKey}:${drawerProps.profile.id}`}
		/>
	);
};

export { ProfileEditDetailsDrawer };
