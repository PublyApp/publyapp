import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
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
	invalidateStaffTenantProfiles,
	type StaffTenantPermissionGroup,
	useAssignStaffTenantProfilePermissionMutation,
	useCreateStaffTenantProfileMutation,
	useStaffTenantPermissionCatalogQuery,
	useUnassignStaffTenantProfilePermissionMutation,
	useUpdateStaffTenantProfileMutation,
} from '~/lib/query/staff-tenant-profiles';
import { invalidateStaffTenantDetails } from '~/lib/query/staff-tenants';
import { shouldLogoutForFailure } from '~/routes/authed/layout';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';

const buildProfileFormSchema = (t: (key: string) => string) =>
	z.object({
		name: z
			.string()
			.trim()
			.min(1, { message: t('profile-name-required') })
			.max(100, { message: t('profile-name-too-long') }),
		description: z
			.string()
			.trim()
			.max(500, { message: t('profile-description-too-long') })
			.optional(),
		permissionKeys: z.array(z.string()),
	});

type ProfileFormValues = z.infer<ReturnType<typeof buildProfileFormSchema>>;

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
	const { t, i18n } = useTranslation('common');
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

	const resolver = useMemo(
		() => zodResolver(buildProfileFormSchema(t)),
		// eslint-disable-next-line react-hooks/exhaustive-deps -- rebuild on language change so messages stay localized
		[i18n.language],
	);

	const methods = useForm<ProfileFormValues>({
		resolver,
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
		// Re-seeds only when the drawer opens or the target profile changes —
		// `profile` is rebuilt every render by the parent, so depending on its
		// identity would reset unsaved edits on any background refetch.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isOpen, mode, profile?.id, reset]);

	const isSaving = createProfile.isPending || updateProfile.isPending;
	const isFormLocked = isSaving || methods.formState.isSubmitting;

	const invalidateProfileQueries = () =>
		Promise.all([
			invalidateStaffTenantProfiles(queryClient),
			invalidateStaffTenantDetails(queryClient),
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

			const permissionResults = await Promise.allSettled([
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

			const failedCount = permissionResults.filter(
				(result) => result.status === 'rejected',
			).length;
			if (failedCount > 0) {
				setServerError(
					t('tenant-profile-permission-update-partial-success', {
						succeeded: permissionResults.length - failedCount,
						failed: failedCount,
					}),
				);
				return;
			}

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
							placeholder={t('tenant-profile-name-placeholder')}
							isDisabled={isFormLocked}
							fullWidth
						/>
						<Field.Text
							name="description"
							label={t('description')}
							placeholder={t('profile-description-placeholder')}
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
