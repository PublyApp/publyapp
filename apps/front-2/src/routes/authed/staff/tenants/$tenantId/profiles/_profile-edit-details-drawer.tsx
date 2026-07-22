import { zodResolver } from '@hookform/resolvers/zod';
import { IconInfoCircle } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
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
import { useUpdateStaffTenantProfileMutation } from '~/lib/query/staff-tenant-profiles';
import { invalidateAllStaffTenantScopes } from '~/lib/query/staff-tenants';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';

import { deriveTenantProfileCardStyle } from './_profile-card-style';

const buildProfileEditDetailsSchema = (t: (key: string) => string) =>
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
	});

type ProfileEditDetailsValues = z.infer<
	ReturnType<typeof buildProfileEditDetailsSchema>
>;

const PROFILE_EDIT_DETAILS_FIELDS = [
	'name',
	'description',
	'icon',
	'tone',
] as const satisfies readonly (keyof ProfileEditDetailsValues)[];

const isProfileEditDetailsField = (
	field: string,
): field is (typeof PROFILE_EDIT_DETAILS_FIELDS)[number] =>
	PROFILE_EDIT_DETAILS_FIELDS.some((candidate) => candidate === field);

type ProfileEditDetailsDrawerProfile = {
	id: string;
	name: string;
	description: string | null;
	icon?: string | null;
	tone?: string | null;
};

const getProfileEditDetailsValues = (
	profile: ProfileEditDetailsDrawerProfile,
): ProfileEditDetailsValues => {
	const style = deriveTenantProfileCardStyle(
		profile.name,
		profile.icon,
		profile.tone,
	);

	return {
		name: profile.name,
		description: profile.description ?? '',
		icon: style.icon,
		tone: style.tone,
	};
};

const ProfileEditDetailsDrawer = ({
	tenantId,
	isOpen,
	profile,
	onOpenChange,
	onSaved,
	onSessionExpired,
	onDirtyChange,
}: {
	tenantId: string;
	isOpen: boolean;
	profile: ProfileEditDetailsDrawerProfile;
	onOpenChange: (isOpen: boolean) => void;
	onSaved: (profileId: string) => void;
	onSessionExpired: () => void;
	onDirtyChange?: (isDirty: boolean) => void;
}) => {
	const { t, i18n } = useTranslation('common');
	const { t: tProfiles } = useTranslation('staff-tenant-profiles');
	const queryClient = useQueryClient();
	const updateProfile = useUpdateStaffTenantProfileMutation();
	const resolver = useMemo(
		() => zodResolver(buildProfileEditDetailsSchema(t)),
		// eslint-disable-next-line react-hooks/exhaustive-deps -- rebuild on language change so messages stay localized
		[i18n.language],
	);
	const methods = useForm<ProfileEditDetailsValues>({
		resolver,
		defaultValues: getProfileEditDetailsValues(profile),
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
		reset(getProfileEditDetailsValues(profile));
		// Re-seed only for a newly opened/changed profile. A refetch may replace
		// the profile object and must not discard an in-progress draft.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isOpen, profile.id, reset]);

	useEffect(() => {
		onDirtyChange?.(isDirty);
	}, [isDirty, onDirtyChange]);

	const isFormLocked = updateProfile.isPending || isSubmitting;
	const requestClose = (): void => {
		if (isDirty) {
			setIsDiscardConfirmOpen(true);
			return;
		}

		onOpenChange(false);
	};
	const handleSaveFailure = async (error: unknown): Promise<void> => {
		if (shouldLogoutForFailure(error)) {
			onSessionExpired();
			return;
		}

		const failure = toApiFailure(error);
		if (failure.kind === 'validation') {
			const rootMessages: string[] = [];
			for (const [field, messages] of Object.entries(failure.fieldErrors)) {
				if (isProfileEditDetailsField(field)) {
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
			await handleSaveFailure(error);
			return;
		}

		await invalidateAllStaffTenantScopes(queryClient);
		toastLocalMutationResult.success(t('profile-updated-successfully'));
		onDirtyChange?.(false);
		onSaved(profile.id);
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
			<DrawerContent data-testid="profile-edit-details-drawer">
				<DrawerHeader>
					<DrawerTitle>{tProfiles('edit-details')}</DrawerTitle>
					<DrawerDescription>
						{tProfiles('edit-details-subtitle', { name: profile.name })}
					</DrawerDescription>
				</DrawerHeader>
				<Form methods={methods} onSubmit={onSubmit}>
					<DrawerBody className="space-y-5">
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
							rows={5}
							isDisabled={isFormLocked}
						/>
						<div className="flex items-start gap-2.5 rounded-[var(--publy-radius-card)] bg-muted/40 p-3 text-sm text-muted-foreground shadow-[var(--publy-shadow-ring)]">
							<IconInfoCircle
								aria-hidden="true"
								className="mt-0.5 size-4 shrink-0"
							/>
							<p>{tProfiles('profile-details-management-note')}</p>
						</div>
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
							{t('save-changes')}
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
					onDirtyChange?.(false);
					onOpenChange(false);
				}}
			/>
		</Drawer>
	);
};

export { ProfileEditDetailsDrawer };
export type { ProfileEditDetailsDrawerProfile };
