import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useWatch, type UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Field } from '~/components/field';
import QueryDisplay from '~/components/query-display';
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
} from '~/lib/mutation-feedback/mutation-toast';
import {
	buildStaffTenantPermissionCatalogGroups,
	useCreateStaffTenantRoleMutation,
	useStaffTenantPermissionCatalogQuery,
} from '~/lib/query/staff-tenant-roles';
import { invalidateAllStaffTenantScopes } from '~/lib/query/staff-tenants';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';
import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import { PermissionMatrix } from './_permission-matrix';
import { rolePermissionCatalogQuery } from './_queries';
import {
	isRoleFormField,
	toStringArray,
	type RoleFormValues,
} from './_role-form-schema';

export const RoleFormDrawer = ({
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
	onSaved: (roleId: string) => void;
	onSessionExpired: () => void;
	/**
	 * Form state owned by the host page. The page reads `formState.isDirty`
	 * during its own render and passes a fresh `key` when reopening so the
	 * directly during its own renders (no child effect relaying it upward)
	 * and guards the URL-driven open path (`?new=1`) against a browser Back
	 * or sibling-route navigation — those transitions unmount this drawer
	 * without ever calling its close guard (tenants-r1-F2). Remounting this
	 * drawer with a fresh `key` re-seeds the form from
	 * `getRoleFormValues()` without any reset effect.
	 */
	methods: UseFormReturn<RoleFormValues>;
}) => {
	const { t, i18n } = useTranslation('common');
	const { t: tRoles } = useTranslation('staff-tenant-roles');
	const queryClient = useQueryClient();

	const catalogQuery = useStaffTenantPermissionCatalogQuery(
		rolePermissionCatalogQuery(i18n.language).variables,
	);

	// Hoisted locals keep raw query flags out of render-flow conditionals.
	const createRole = useCreateStaffTenantRoleMutation();

	const {
		formState: { isDirty, isSubmitting },
	} = methods;
	const [isDiscardConfirmOpen, setIsDiscardConfirmOpen] = useState(false);
	const icon = useWatch({ control: methods.control, name: 'icon' });
	const tone = useWatch({ control: methods.control, name: 'tone' });

	const isSaving = createRole.isPending;
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

	const invalidateRoleQueries = () =>
		invalidateAllStaffTenantScopes(queryClient);
	const handleRoleSaveFailure = async (error: unknown): Promise<void> => {
		if (shouldLogoutForFailure(error)) {
			onSessionExpired();
			return;
		}

		const failure = toApiFailure(error);
		if (failure.kind === 'validation') {
			const rootMessages: string[] = [];

			for (const [field, messages] of Object.entries(failure.fieldErrors)) {
				if (isRoleFormField(field)) {
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
						fallback: t('role-save-failed'),
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

		await displayLocalMutationFailure(error, t('role-save-failed'));
	};

	const onSubmit = methods.handleSubmit(async (values) => {
		methods.clearErrors('root');

		let result;
		try {
			result = await createRole.mutateAsync({
				tenantId,
				name: values.name,
				description: values.description,
				icon: values.icon,
				tone: values.tone,
				permissionKeys: values.permissionKeys,
			});
		} catch (error) {
			await handleRoleSaveFailure(error);
			return;
		}

		await invalidateRoleQueries();
		toastLocalMutationResult.success(t('role-created-successfully'));

		const roleId = result?.role?.id?.toString().trim();
		onSaved(roleId ?? '');
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
			<DrawerContent width={736} data-testid="role-form-drawer">
				<DrawerHeader>
					<DrawerTitle>{t('new-role')}</DrawerTitle>
					<DrawerDescription>
						{t('role-form-drawer-description')}
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
									label={t('role-name')}
									placeholder={t('tenant-role-name-placeholder')}
									isDisabled={isFormLocked}
									fullWidth
								/>
							</div>
							<p className="text-xs text-muted-foreground sm:pl-[68px]">
								{tRoles('role-icon-picker-hint')}
							</p>
						</div>
						<Field.Textarea
							name="description"
							label={t('description')}
							placeholder={t('role-description-placeholder')}
							rows={4}
							isDisabled={isFormLocked}
						/>

						<QueryDisplay
							query={catalogQuery}
							LoadingSlot={
								<p className="text-sm text-muted-foreground">
									{t('loading-permissions')}
								</p>
							}
							ErrorSlot={
								<p className="text-sm text-destructive">
									{getFailureMessage(toApiFailure(catalogQuery.error), {
										fallback: t('tenant-permission-catalog-load-failed'),
									})}
								</p>
							}
							EmptySlot={
								<p className="text-sm text-muted-foreground">
									{t('no-permissions-available')}
								</p>
							}
						>
							{({ data }) => {
								const groups = buildStaffTenantPermissionCatalogGroups(
									data?.additionalData,
								);

								if (groups.length === 0) {
									return (
										<p className="text-sm text-muted-foreground">
											{t('no-permissions-available')}
										</p>
									);
								}

								return (
									<Controller
										name="permissionKeys"
										control={methods.control}
										render={({ field }) => (
											<div data-testid="role-permissions-checklist">
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
								);
							}}
						</QueryDisplay>

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
							{t('create-role')}
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
