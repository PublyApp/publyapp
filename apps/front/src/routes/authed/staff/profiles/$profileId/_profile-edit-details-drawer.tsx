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
	type ProfileEditDetailsDrawerProps,
	useProfileEditDetailsForm,
} from '~/lib/profiles/use-profile-edit-details-form';
import {
	invalidateStaffProfiles,
	useUpdateStaffProfileMutation,
} from '~/lib/query/staff-profiles';

const StaffProfileEditDetailsDrawerInner = ({
	isOpen,
	profile,
	onOpenChange,
	onSaved,
	onSessionExpired,
	onDirtyChange,
}: ProfileEditDetailsDrawerProps) => {
	const { t: tProfiles } = useTranslation('staff-tenant-profiles');
	const queryClient = useQueryClient();
	const updateProfile = useUpdateStaffProfileMutation();
	// The scope difference against the tenant drawer: this PATCH and this
	// invalidation. Everything else is the one shared form.
	const form = useProfileEditDetailsForm({
		profile,
		isSaving: updateProfile.isPending,
		save: async (values) =>
			updateProfile.mutateAsync({ profileId: profile.id, ...values }),
		invalidate: () => invalidateStaffProfiles(queryClient),
		onOpenChange,
		onSaved,
		onSessionExpired,
		onDirtyChange,
	});

	return (
		<Drawer open={isOpen} onOpenChange={form.handleOpenChange}>
			<DrawerContent
				width={736}
				data-testid="staff-profile-edit-details-drawer"
			>
				<DrawerHeader>
					<DrawerTitle>{tProfiles('edit-details')}</DrawerTitle>
					<DrawerDescription>
						{tProfiles('edit-details-subtitle', { name: profile.name })}
					</DrawerDescription>
				</DrawerHeader>
				<DrawerForm methods={form.methods} onSubmit={form.onSubmit}>
					<ProfileEditDetailsFormContent
						form={form}
						namePlaceholderKey="profile-name-placeholder"
					/>
				</DrawerForm>
			</DrawerContent>
			<ProfileEditDetailsDiscardDialog form={form} />
		</Drawer>
	);
};

/*
 * Session-keyed mount: each closed -> opened transition bumps a key and
 * remounts the drawer, which seeds itself from the profile at mount. A fresh
 * mount happens exactly once per session and never discards an in-progress
 * draft when a refetch replaces the profile object under the mounted instance
 * (same id, new object identity). Switching to a different profile id
 * remounts, matching a per-profile reseed. The 200ms exit animation keeps the
 * closing instance under its old key.
 */
const StaffProfileEditDetailsDrawer = (
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
		<StaffProfileEditDetailsDrawerInner
			{...drawerProps}
			key={`${sessionKey}:${drawerProps.profile.id}`}
		/>
	);
};

export { StaffProfileEditDetailsDrawer };
