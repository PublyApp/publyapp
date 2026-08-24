import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useWatch, type UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Field } from '~/components/field';
import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import {
	Drawer,
	DrawerBody,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerForm,
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
	useCreateStaffTenantProfileMutation,
	useStaffTenantPermissionCatalogQuery,
} from '~/lib/query/staff-tenant-profiles';
import { invalidateAllStaffTenantScopes } from '~/lib/query/staff-tenants';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';

import { PermissionMatrix } from './_permission-matrix';
import {
	isProfileFormField,
	toStringArray,
	type ProfileFormValues,
} from './_profile-form-schema';

export const ProfileFormDrawer = ({
	tenantId,
	isOpen,
	onOpenChange,
	onSaved,
	onSessionExpired,
	methods,
}: {
	tenantId: string;
	isOpen: boolean;
	onOpenChange: (isOpen: boolean) => void;
	onSaved: (profileId: string) => void;
	onSessionExpired: () => void;
	/**
	 * Form state owned by the host page. The page reads `formState.isDirty`
	 * during its own render and passes a fresh `key` when reopening so the
	 * directly during its own renders (no child effect relaying it upward)
	 * and guards the URL-driven open path (`?new=1`) against a browser Back
	 * or sibling-route navigation — those transitions unmount this drawer
	 * without ever calling its close guard (tenants-r1-F2). Remounting this
	 * drawer with a fresh `key` re-seeds the form from
	 * `getProfileFormValues()` without any reset effect.
	 */
	methods: UseFormReturn<ProfileFormValues>;
}) => {
	const { t, i18n } = useTranslation('common');
	const { t: tProfiles } = useTranslation('staff-tenant-profiles');
	const queryClient = useQueryClient();

	const catalogQuery = useStaffTenantPermissionCatalogQuery({
		language: i18n.language,
	});

	// Hoisted locals keep raw query flags out of render-flow conditionals.
	const catalogIsPending = catalogQuery.isPending;
	const catalogIsError = catalogQuery.isError;
	const catalogError = catalogQuery.error;
	const createProfile = useCreateStaffTenantProfileMutation();

	const groups = buildStaffTenantPermissionCatalogGroups(
		catalogQuery.data?.additionalData,
	);

	const {
		formState: { isDirty, isSubmitting },
	} = methods;
	const [isDiscardConfirmOpen, setIsDiscardConfirmOpen] = useState(false);
	const icon = useWatch({ control: methods.control, name: 'icon' });
	const tone = useWatch({ control: methods.control, name: 'tone' });

	const isSaving = createProfile.isPending;
	const isFormLocked = isSaving || isSubmitting;

	// tenants-r6-F3: every close path (Escape, backdrop click, Cancel, and
	// browser back — all funneled through Base UI's `onOpenChange`) must
	// confirm before discarding a dirty create form. Dirtiness is read at
	// call time, not captured in an effect, so every caller sees the current
	// form state.
	const requestClose = (isDirtyAtClose: boolean): void => {
		if (!isDirtyAtClose) {
			onOpenChange(false);
			return;
		}

		setIsDiscardConfirmOpen(true);
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
		onSaved(profileId ?? '');
	});

	return (
		<Drawer
			open={isOpen}
			onOpenChange={(open) => {
				if (isFormLocked) {
					return;
				}

				if (!open) {
					requestClose(isDirty);
					return;
				}

				onOpenChange(open);
			}}
		>
			<DrawerContent width={736} data-testid="profile-form-drawer">
				<DrawerHeader>
					<DrawerTitle>{t('new-profile')}</DrawerTitle>
					<DrawerDescription>
						{t('profile-form-drawer-description')}
					</DrawerDescription>
				</DrawerHeader>
				<DrawerForm methods={methods} onSubmit={onSubmit}>
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

						{catalogIsPending ? (
							<p className="text-sm text-muted-foreground">
								{t('loading-permissions')}
							</p>
						) : null}

						{catalogIsError ? (
							<p className="text-sm text-destructive">
								{getFailureMessage(toApiFailure(catalogError), {
									fallback: t('tenant-permission-catalog-load-failed'),
								})}
							</p>
						) : null}

						{!catalogIsPending && !catalogIsError && groups.length > 0 ? (
							<Controller
								name="permissionKeys"
								control={methods.control}
								render={({ field }) => (
									<div data-testid="profile-permissions-checklist">
										<PermissionMatrix
											groups={groups}
											value={toStringArray(field.value)}
											onChange={field.onChange}
											baselineValue={[]}
											disabled={isFormLocked}
										/>
									</div>
								)}
							/>
						) : null}

						{!catalogIsPending && !catalogIsError && groups.length === 0 ? (
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
						<Button
							type="button"
							variant="ghost"
							disabled={isFormLocked}
							onClick={() => requestClose(isDirty)}
						>
							{t('cancel')}
						</Button>
						<Button type="submit" disabled={isFormLocked}>
							{t('create-profile')}
						</Button>
					</DrawerFooter>
				</DrawerForm>
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
					onOpenChange(false);
				}}
			/>
		</Drawer>
	);
};
