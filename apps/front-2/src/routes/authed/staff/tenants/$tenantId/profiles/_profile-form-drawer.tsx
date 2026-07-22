import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Field, Form } from '~/components/field';
import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import {
	Drawer,
	DrawerBody,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from '~/components/ui/drawer';
import { IconColorPicker } from '~/components/ui/icon-color-picker';
import {
	displayLocalMutationFailure,
	toastLocalMutationResult,
} from '~/lib/mutation-toast';
import {
	buildStaffTenantPermissionCatalogGroups,
	useAssignStaffTenantProfilePermissionMutation,
	useCreateStaffTenantProfileMutation,
	useStaffTenantPermissionCatalogQuery,
	useUnassignStaffTenantProfilePermissionMutation,
	useUpdateStaffTenantProfileMutation,
} from '~/lib/query/staff-tenant-profiles';
import { invalidateAllStaffTenantScopes } from '~/lib/query/staff-tenants';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';

import { PermissionMatrix } from './_permission-matrix';
import { deriveTenantProfileCardStyle } from './_profile-card-style';

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
		icon: z.string().min(1),
		tone: z.string().min(1),
		permissionKeys: z.array(z.string()),
	});

type ProfileFormValues = z.infer<ReturnType<typeof buildProfileFormSchema>>;

const PROFILE_FORM_FIELDS = [
	'name',
	'description',
	'icon',
	'tone',
	'permissionKeys',
] as const satisfies readonly (keyof ProfileFormValues)[];

const isProfileFormField = (
	field: string,
): field is (typeof PROFILE_FORM_FIELDS)[number] =>
	PROFILE_FORM_FIELDS.some((candidate) => candidate === field);

const LOCAL_PERMISSION_META = {
	silentSuccess: true,
	skipGlobalErrorHandler: true,
} as const;

const toStringArray = (value: unknown): string[] =>
	Array.isArray(value)
		? value.filter((item): item is string => typeof item === 'string')
		: [];

const getProfileFormValues = (
	profile?: ProfileFormDrawerProfile,
): ProfileFormValues => {
	const style = deriveTenantProfileCardStyle(
		profile?.name ?? '',
		profile?.icon,
		profile?.tone,
	);

	return {
		name: profile?.name ?? '',
		description: profile?.description ?? '',
		icon: style.icon,
		tone: style.tone,
		permissionKeys: profile?.permissionKeys ?? [],
	};
};

const countPermissionChanges = (
	baselineValue: string[],
	value: string[],
): number => {
	const baseline = new Set(baselineValue);
	const selected = new Set(value);

	return (
		baselineValue.filter((key) => !selected.has(key)).length +
		value.filter((key) => !baseline.has(key)).length
	);
};

export type ProfileFormDrawerProfile = {
	id: string;
	name: string;
	description: string | null;
	icon?: string | null;
	tone?: string | null;
	memberCount: number;
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
	onDirtyChange,
}: {
	tenantId: string;
	mode: 'create' | 'edit';
	isOpen: boolean;
	profile?: ProfileFormDrawerProfile;
	onOpenChange: (isOpen: boolean) => void;
	onSaved: (profileId: string) => void;
	onSessionExpired: () => void;
	/**
	 * Reports form dirtiness to the parent so it can guard the URL-driven
	 * open path (`?new=1`/`?edit=1`) against a browser Back or sibling-route
	 * navigation — those transitions update/unmount this drawer without ever
	 * calling its own `onOpenChange` close guard (tenants-r1-F2).
	 */
	onDirtyChange?: (isDirty: boolean) => void;
}) => {
	const { t, i18n } = useTranslation('common');
	const { t: tProfiles } = useTranslation('staff-tenant-profiles');
	const queryClient = useQueryClient();

	const catalogQuery = useStaffTenantPermissionCatalogQuery({});
	const createProfile = useCreateStaffTenantProfileMutation();
	const updateProfile = useUpdateStaffTenantProfileMutation();
	const assignPermission = useAssignStaffTenantProfilePermissionMutation(
		LOCAL_PERMISSION_META,
	);
	const unassignPermission = useUnassignStaffTenantProfilePermissionMutation(
		LOCAL_PERMISSION_META,
	);

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
		defaultValues: getProfileFormValues(),
	});
	const {
		reset,
		formState: { isDirty, isSubmitting },
	} = methods;
	const [isDiscardConfirmOpen, setIsDiscardConfirmOpen] = useState(false);
	const icon = useWatch({ control: methods.control, name: 'icon' });
	const tone = useWatch({ control: methods.control, name: 'tone' });
	const permissionKeys = toStringArray(
		useWatch({ control: methods.control, name: 'permissionKeys' }),
	);

	useEffect(() => {
		if (!isOpen) {
			return;
		}

		setIsDiscardConfirmOpen(false);
		reset(getProfileFormValues(mode === 'edit' ? profile : undefined));
		// Re-seeds only when the drawer opens or the target profile changes —
		// `profile` is rebuilt every render by the parent, so depending on its
		// identity would reset unsaved edits on any background refetch.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isOpen, mode, profile?.id, reset]);

	useEffect(() => {
		onDirtyChange?.(isDirty);
	}, [isDirty, onDirtyChange]);

	const isSaving = createProfile.isPending || updateProfile.isPending;
	const isFormLocked = isSaving || isSubmitting;
	const permissionChangeCount =
		mode === 'edit' && profile
			? countPermissionChanges(profile.permissionKeys, permissionKeys)
			: 0;

	// tenants-r6-F3: every close path (Escape, backdrop click, Cancel, and
	// browser back — all funneled through Base UI's `onOpenChange`) must
	// confirm before discarding a dirty create/edit form.
	const requestClose = () => {
		if (isDirty) {
			setIsDiscardConfirmOpen(true);
			return;
		}

		onOpenChange(false);
	};

	const invalidateProfileQueries = () =>
		invalidateAllStaffTenantScopes(queryClient);
	const handleProfileSaveFailure = async (error: unknown): Promise<void> => {
		if (shouldLogoutForFailure(error)) {
			onSessionExpired();
			return;
		}

		const failure = toApiFailure(error);
		if (failure.kind === 'validation') {
			const rootMessages: string[] = [];

			for (const [field, messages] of Object.entries(failure.fieldErrors)) {
				if (isProfileFormField(field)) {
					methods.setError(field, {
						type: 'server',
						message: messages.join(' '),
					});
				} else {
					rootMessages.push(...messages);
				}
			}

			if (Object.keys(failure.fieldErrors).length === 0) {
				rootMessages.push(
					getFailureMessage(failure, {
						fallback: t('profile-save-failed'),
					}),
				);
			}

			if (rootMessages.length > 0) {
				methods.setError('root.server', {
					type: 'server',
					message: Array.from(new Set(rootMessages)).join(' '),
				});
			}
			return;
		}

		await displayLocalMutationFailure(error, t('profile-save-failed'));
	};

	const onSubmit = methods.handleSubmit(async (values) => {
		methods.clearErrors('root');

		if (mode === 'create') {
			let result;
			try {
				result = await createProfile.mutateAsync({
					tenantId,
					name: values.name,
					description: values.description,
					icon: values.icon,
					tone: values.tone,
					permissionKeys: values.permissionKeys,
				});
			} catch (error) {
				await handleProfileSaveFailure(error);
				return;
			}

			await invalidateProfileQueries();
			toastLocalMutationResult.success(t('profile-created-successfully'));

			const profileId = result?.profile?.id?.toString().trim();
			// A successful submit must never trip the parent's nav guard on
			// the navigation `onSaved` performs next.
			onDirtyChange?.(false);
			onSaved(profileId ?? '');
			return;
		}

		if (!profile) {
			return;
		}

		try {
			await updateProfile.mutateAsync({
				tenantId,
				profileId: profile.id,
				name: values.name,
				description: values.description,
				icon: values.icon,
				tone: values.tone,
			});
		} catch (error) {
			await handleProfileSaveFailure(error);
			return;
		}

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
		const rejectedResults = permissionResults.filter(
			(result): result is PromiseRejectedResult => result.status === 'rejected',
		);

		if (
			rejectedResults.some((result) => shouldLogoutForFailure(result.reason))
		) {
			onSessionExpired();
			return;
		}

		const visibleFailures = rejectedResults.filter(
			(result) => toApiFailure(result.reason).kind !== 'abort',
		);
		await invalidateProfileQueries();

		if (visibleFailures.length > 0) {
			methods.setError('root.server', {
				type: 'server',
				message: t('tenant-profile-permission-update-partial-success', {
					succeeded: permissionResults.filter(
						(result) => result.status === 'fulfilled',
					).length,
					failed: visibleFailures.length,
				}),
			});
			return;
		}

		if (rejectedResults.length > 0) {
			return;
		}

		toastLocalMutationResult.success(t('profile-updated-successfully'));
		onDirtyChange?.(false);
		onSaved(profile.id);
	});

	const title = mode === 'create' ? t('new-profile') : t('edit-profile');

	return (
		<Drawer
			open={isOpen}
			onOpenChange={(open) => {
				if (isFormLocked) {
					return;
				}

				if (!open) {
					requestClose();
					return;
				}

				onOpenChange(open);
			}}
		>
			<DrawerContent data-testid="profile-form-drawer">
				<DrawerHeader>
					<DrawerTitle>{title}</DrawerTitle>
					<DrawerDescription>
						{mode === 'edit' && profile
							? tProfiles('profile-edit-subtitle', {
									name: profile.name,
									count: profile.memberCount,
								})
							: t('profile-form-drawer-description')}
					</DrawerDescription>
				</DrawerHeader>
				<Form methods={methods} onSubmit={onSubmit}>
					<DrawerBody className="space-y-4">
						<div className="space-y-1.5">
							<div className="grid items-end gap-3 sm:grid-cols-[auto_minmax(0,1fr)]">
								<IconColorPicker
									value={{ icon, tone }}
									disabled={isFormLocked}
									onChange={(next) => {
										methods.setValue('icon', next.icon ?? icon, {
											shouldDirty: true,
										});
										methods.setValue('tone', next.tone ?? tone, {
											shouldDirty: true,
										});
									}}
								/>
								<Field.Text
									name="name"
									label={t('profile-name')}
									placeholder={t('tenant-profile-name-placeholder')}
									isDisabled={isFormLocked}
									fullWidth
								/>
							</div>
							<p className="text-xs text-muted-foreground sm:pl-[68px]">
								{tProfiles('profile-icon-picker-hint')}
							</p>
						</div>
						<Field.Textarea
							name="description"
							label={t('description')}
							placeholder={t('profile-description-placeholder')}
							rows={4}
							isDisabled={isFormLocked}
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
							<Controller
								name="permissionKeys"
								control={methods.control}
								render={({ field }) => (
									<div data-testid="profile-permissions-checklist">
										<PermissionMatrix
											groups={groups}
											value={toStringArray(field.value)}
											onChange={field.onChange}
											baselineValue={
												mode === 'edit' ? profile?.permissionKeys : []
											}
											disabled={isFormLocked}
										/>
									</div>
								)}
							/>
						) : null}

						{!catalogQuery.isPending &&
						!catalogQuery.isError &&
						groups.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								{t('no-permissions-available')}
							</p>
						) : null}

						{methods.formState.errors.root?.server?.message ? (
							<p className="text-sm text-destructive" role="alert">
								{methods.formState.errors.root.server.message}
							</p>
						) : null}
					</DrawerBody>
					<DrawerFooter>
						{mode === 'edit' ? (
							<p
								className="mr-auto text-sm text-muted-foreground"
								aria-live="polite"
							>
								{tProfiles('profile-permissions-changed', {
									count: permissionChangeCount,
								})}
							</p>
						) : null}
						<Button
							type="button"
							variant="ghost"
							disabled={isFormLocked}
							onClick={requestClose}
						>
							{t('cancel')}
						</Button>
						<Button type="submit" disabled={isFormLocked}>
							{mode === 'create' ? t('create-profile') : t('save-changes')}
						</Button>
					</DrawerFooter>
				</Form>
			</DrawerContent>
			<ConfirmDialog
				isOpen={isDiscardConfirmOpen}
				title={t('unsaved-changes-dialog-title')}
				description={t('unsaved-changes-dialog-description')}
				confirmLabel={t('leave-page')}
				tone="danger"
				onOpenChange={setIsDiscardConfirmOpen}
				onConfirm={() => {
					setIsDiscardConfirmOpen(false);
					// The user already confirmed the discard here — clear dirtiness
					// first so the parent's URL nav guard doesn't immediately block
					// the close navigation this triggers with a second prompt.
					onDirtyChange?.(false);
					onOpenChange(false);
				}}
			/>
		</Drawer>
	);
};
