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
import { deriveTenantProfileCardStyle } from './_profile-card-style';

const buildProfileFormSchema = (t: (key: string) => string) =>
	z.object({
		name: z
			.string()
			.trim()
			.min(1, { message: t('profile-name-required') })
			.min(2, { message: t('profile-name-too-short') })
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

const toStringArray = (value: unknown): string[] =>
	Array.isArray(value)
		? value.filter((item): item is string => typeof item === 'string')
		: [];

const getProfileFormValues = (): ProfileFormValues => {
	const style = deriveTenantProfileCardStyle('');

	return {
		name: '',
		description: '',
		icon: style.icon,
		tone: style.tone,
		permissionKeys: [],
	};
};

export const ProfileFormDrawer = ({
	tenantId,
	isOpen,
	onOpenChange,
	onSaved,
	onSessionExpired,
	onDirtyChange,
}: {
	tenantId: string;
	isOpen: boolean;
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

	const catalogQuery = useStaffTenantPermissionCatalogQuery({
		language: i18n.language,
	});
	const createProfile = useCreateStaffTenantProfileMutation();

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

	useEffect(() => {
		if (!isOpen) {
			return;
		}

		setIsDiscardConfirmOpen(false);
		reset(getProfileFormValues());
	}, [isOpen, reset]);

	useEffect(() => {
		onDirtyChange?.(isDirty);
	}, [isDirty, onDirtyChange]);

	const isSaving = createProfile.isPending;
	const isFormLocked = isSaving || isSubmitting;

	// tenants-r6-F3: every close path (Escape, backdrop click, Cancel, and
	// browser back — all funneled through Base UI's `onOpenChange`) must
	// confirm before discarding a dirty create form.
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
	});

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
					<DrawerTitle>{t('new-profile')}</DrawerTitle>
					<DrawerDescription>
						{t('profile-form-drawer-description')}
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
											baselineValue={[]}
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
						<Button
							type="button"
							variant="ghost"
							disabled={isFormLocked}
							onClick={requestClose}
						>
							{t('cancel')}
						</Button>
						<Button type="submit" disabled={isFormLocked}>
							{t('create-profile')}
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
