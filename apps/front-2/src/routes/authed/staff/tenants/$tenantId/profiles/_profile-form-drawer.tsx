import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Controller, useForm, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Field, Form } from '~/components/field';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import {
	Drawer,
	DrawerBody,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from '~/components/ui/drawer';
import {
	buildStaffTenantPermissionCatalogGroups,
	STAFF_TENANT_PROFILE_DETAILS_QUERY_KEY,
	STAFF_TENANT_PROFILE_PERMISSION_KEYS_QUERY_KEY,
	STAFF_TENANT_PROFILES_QUERY_KEY,
	type StaffTenantPermissionGroup,
	useAssignStaffTenantProfilePermissionMutation,
	useCreateStaffTenantProfileMutation,
	useStaffTenantPermissionCatalogQuery,
	useUnassignStaffTenantProfilePermissionMutation,
	useUpdateStaffTenantProfileMutation,
} from '~/lib/query/staff-tenant-profiles';
import { shouldLogoutForFailure } from '~/routes/authed/layout';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';

const profileFormSchema = z.object({
	name: z.string().trim().min(1).max(100),
	description: z.string().trim().max(500).optional(),
	permissionKeys: z.array(z.string()),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

const EMPTY_VALUES: ProfileFormValues = {
	name: '',
	description: '',
	permissionKeys: [],
};

const toStringArray = (value: unknown): string[] =>
	Array.isArray(value)
		? value.filter((item): item is string => typeof item === 'string')
		: [];

const PermissionGroupChecklist = ({
	groups,
	isDisabled,
}: {
	groups: StaffTenantPermissionGroup[];
	isDisabled?: boolean;
}) => {
	const { control } = useFormContext();

	return (
		<Controller
			name="permissionKeys"
			control={control}
			render={({ field }) => {
				const value = toStringArray(field.value);

				const toggle = (key: string, checked: boolean) => {
					field.onChange(
						checked
							? [...new Set([...value, key])]
							: value.filter((item) => item !== key),
					);
				};

				return (
					<div
						className="space-y-4"
						data-testid="profile-permissions-checklist"
					>
						{groups.map((group) => (
							<div key={group.moduleKey} className="space-y-2">
								<p className="publy-type-eyebrow">{group.moduleLabel}</p>
								<div className="space-y-1.5">
									{group.options.map((option) => (
										<label
											key={option.key}
											className="flex items-start gap-2 text-[13px]"
											title={option.description ?? undefined}
										>
											<Checkbox
												checked={value.includes(option.key)}
												disabled={isDisabled}
												onCheckedChange={(checked) =>
													toggle(option.key, Boolean(checked))
												}
											/>
											<span>{option.label}</span>
										</label>
									))}
								</div>
							</div>
						))}
					</div>
				);
			}}
		/>
	);
};

export type ProfileFormDrawerProfile = {
	id: string;
	name: string;
	description: string | null;
	permissionKeys: string[];
};

export const ProfileFormDrawer = ({
	tenantId,
	mode,
	isOpen,
	profile,
	onOpenChange,
	onSaved,
	onSessionExpired,
}: {
	tenantId: string;
	mode: 'create' | 'edit';
	isOpen: boolean;
	profile?: ProfileFormDrawerProfile;
	onOpenChange: (isOpen: boolean) => void;
	onSaved: (profileId: string) => void;
	onSessionExpired: () => void;
}) => {
	const { t } = useTranslation('common');
	const queryClient = useQueryClient();
	const [serverError, setServerError] = useState('');

	const catalogQuery = useStaffTenantPermissionCatalogQuery({});
	const createProfile = useCreateStaffTenantProfileMutation();
	const updateProfile = useUpdateStaffTenantProfileMutation();
	const assignPermission = useAssignStaffTenantProfilePermissionMutation();
	const unassignPermission = useUnassignStaffTenantProfilePermissionMutation();

	const groups = buildStaffTenantPermissionCatalogGroups(
		catalogQuery.data?.additionalData,
	);

	const methods = useForm<ProfileFormValues>({
		resolver: zodResolver(profileFormSchema),
		defaultValues: EMPTY_VALUES,
	});
	const { reset } = methods;

	useEffect(() => {
		if (!isOpen) {
			return;
		}

		setServerError('');
		reset(
			mode === 'edit' && profile
				? {
						name: profile.name,
						description: profile.description ?? '',
						permissionKeys: profile.permissionKeys,
					}
				: EMPTY_VALUES,
		);
	}, [isOpen, mode, profile, reset]);

	const isSaving = createProfile.isPending || updateProfile.isPending;
	const isFormLocked = isSaving || methods.formState.isSubmitting;

	const invalidateProfileQueries = () =>
		Promise.all([
			queryClient.invalidateQueries({
				queryKey: STAFF_TENANT_PROFILES_QUERY_KEY,
			}),
			queryClient.invalidateQueries({
				queryKey: STAFF_TENANT_PROFILE_DETAILS_QUERY_KEY,
			}),
			queryClient.invalidateQueries({
				queryKey: STAFF_TENANT_PROFILE_PERMISSION_KEYS_QUERY_KEY,
			}),
		]);

	const onSubmit = methods.handleSubmit(async (values) => {
		setServerError('');

		try {
			if (mode === 'create') {
				const result = await createProfile.mutateAsync({
					tenantId,
					name: values.name,
					description: values.description,
					permissionKeys: values.permissionKeys,
				});
				await invalidateProfileQueries();

				const profileId = result?.profile?.id?.toString().trim();
				onSaved(profileId ?? '');
				return;
			}

			if (!profile) {
				return;
			}

			await updateProfile.mutateAsync({
				tenantId,
				profileId: profile.id,
				name: values.name,
				description: values.description,
			});

			const initialKeys = new Set(profile.permissionKeys);
			const nextKeys = new Set(values.permissionKeys);
			const keysToAssign = values.permissionKeys.filter(
				(key) => !initialKeys.has(key),
			);
			const keysToUnassign = profile.permissionKeys.filter(
				(key) => !nextKeys.has(key),
			);

			await Promise.all([
				...keysToAssign.map((permissionKey) =>
					assignPermission.mutateAsync({
						tenantId,
						profileId: profile.id,
						permissionKey,
					}),
				),
				...keysToUnassign.map((permissionKey) =>
					unassignPermission.mutateAsync({
						tenantId,
						profileId: profile.id,
						permissionKey,
					}),
				),
			]);

			await invalidateProfileQueries();
			onSaved(profile.id);
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				onSessionExpired();
				return;
			}

			setServerError(
				getFailureMessage(toApiFailure(error), {
					fallback: t('profile-save-failed'),
				}),
			);
		}
	});

	const title = mode === 'create' ? t('new-profile') : t('edit-profile');

	return (
		<Drawer
			open={isOpen}
			onOpenChange={(open) => {
				if (!isFormLocked) {
					onOpenChange(open);
				}
			}}
		>
			<DrawerContent data-testid="profile-form-drawer">
				<DrawerHeader>
					<DrawerTitle>{title}</DrawerTitle>
					<DrawerDescription>
						{t('profile-form-drawer-description')}
					</DrawerDescription>
				</DrawerHeader>
				<Form methods={methods} onSubmit={onSubmit}>
					<DrawerBody className="space-y-4">
						<Field.Text
							name="name"
							label={t('profile-name')}
							placeholder="Approvers"
							isDisabled={isFormLocked}
							fullWidth
						/>
						<Field.Text
							name="description"
							label={t('description')}
							placeholder="Describe the responsibilities for this profile"
							isDisabled={isFormLocked}
							fullWidth
						/>

						{catalogQuery.isPending ? (
							<p className="text-sm text-muted-foreground">
								{t('loading-permissions')}
							</p>
						) : null}

						{catalogQuery.isError ? (
							<p className="text-sm text-destructive">
								{getFailureMessage(toApiFailure(catalogQuery.error), {
									fallback: t('tenant-permission-catalog-load-failed'),
								})}
							</p>
						) : null}

						{!catalogQuery.isPending &&
						!catalogQuery.isError &&
						groups.length > 0 ? (
							<PermissionGroupChecklist
								groups={groups}
								isDisabled={isFormLocked}
							/>
						) : null}

						{!catalogQuery.isPending &&
						!catalogQuery.isError &&
						groups.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								{t('no-permissions-available')}
							</p>
						) : null}

						{serverError ? (
							<p className="text-sm text-destructive">{serverError}</p>
						) : null}
					</DrawerBody>
					<DrawerFooter>
						<Button
							type="button"
							variant="ghost"
							disabled={isFormLocked}
							onClick={() => onOpenChange(false)}
						>
							{t('cancel')}
						</Button>
						<Button type="submit" disabled={isFormLocked}>
							{mode === 'create' ? t('create-profile') : t('save-changes')}
						</Button>
					</DrawerFooter>
				</Form>
			</DrawerContent>
		</Drawer>
	);
};
