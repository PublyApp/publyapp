import { zodResolver } from '@hookform/resolvers/zod';
import { IconInfoCircle } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
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
import { deriveProfileCardStyle } from '~/lib/profiles/profile-card-style';
import { resolveProfileSaveFailure } from '~/lib/profiles/profile-edit-details-save-failure';
import {
	invalidateStaffProfiles,
	useUpdateStaffProfileMutation,
} from '~/lib/query/staff-profiles';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

// The scope-neutral picker labels live in the `staff-tenant-profiles`
// catalogue (#980); the rest of the strings come from `common`.
const buildProfileEditDetailsSchema = (t: (key: string) => string) =>
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
		icon: z.string().min(1).nullable(),
		tone: z.string().min(1).nullable(),
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
): ProfileEditDetailsValues => ({
	name: profile.name,
	description: profile.description ?? '',
	icon: profile.icon ?? null,
	tone: profile.tone ?? null,
});

// #819 — mirrors the tenant `_profile-edit-details-drawer` on the staff
// (non-tenant) profile detail page. Same omit/set/clear PATCH semantics: a
// null icon/tone means "restore automatic style", not "send an empty string".
const StaffProfileEditDetailsDrawer = ({
	isOpen,
	profile,
	onOpenChange,
	onSaved,
	onSessionExpired,
	onDirtyChange,
}: {
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
	const updateProfile = useUpdateStaffProfileMutation();
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
	const name = useWatch({ control: methods.control, name: 'name' });
	const icon = useWatch({ control: methods.control, name: 'icon' });
	const tone = useWatch({ control: methods.control, name: 'tone' });
	// The tile previews the style that will be persisted; the helper falls back
	// to the deterministic derivation when nothing is stored (#980).
	const displayedStyle = deriveProfileCardStyle(
		name ?? profile.name,
		icon,
		tone,
	);
	const hasCustomStyle = icon !== null || tone !== null;

	// Re-seed the draft when the drawer opens for a given profile. The profile
	// object is deliberately read inside (not listed as a dependency): a
	// background refetch may replace the object, and that must never clobber an
	// in-progress draft. Keying a split-out body on `profile.id` would also
	// re-seed, but it would unmount mid-close-animation and break the drawer's
	// Escape/outside-click close contract, so this effect is the honest shape.
	// react-doctor-disable-next-line react-doctor/no-reset-all-state-on-prop-change -- deliberate open-triggered re-seed; see above
	useEffect(() => {
		if (!isOpen) {
			return;
		}

		// react-doctor-disable-next-line react-doctor/no-adjust-state-on-prop-change -- deliberate open-triggered re-seed; see above
		setIsDiscardConfirmOpen(false);
		reset(getProfileEditDetailsValues(profile));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isOpen, profile.id, reset]);

	// Bridge RHF's dirty flag to the page's nav guard. This is an external-
	// store subscription (react.dev/learn/you-might-not-need-an-effect), not
	// derived state: reporting during render would call setState on the parent
	// mid-render, and moving the form up would put route state in the page.
	useEffect(() => {
		// react-doctor-disable-next-line react-doctor/no-pass-data-to-parent react-doctor/no-pass-live-state-to-parent react-doctor/no-prop-callback-in-effect -- external-store bridge; see above
		onDirtyChange?.(isDirty);
	}, [isDirty, onDirtyChange]);

	const isFormLocked = updateProfile.isPending || isSubmitting;
	// #1342 — "no change → no request / disabled Save": a pristine form must
	// not be savable, at either layer (disabled button AND submit-handler
	// guard, so a programmatic submit cannot send a no-op PATCH either).
	const canSave = !isFormLocked && isDirty;
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

		// Shared with the tenant drawer (see `resolveProfileSaveFailure`): a 422
		// belongs to this form whether or not its `errors` map carried entries;
		// everything else keeps going to the local failure toast.
		const outcome = resolveProfileSaveFailure({
			error,
			isKnownField: isProfileEditDetailsField,
			fallbackMessage: t('profile-save-failed'),
		});
		if (outcome.kind === 'field-errors') {
			for (const [field, message] of outcome.fieldErrors) {
				methods.setError(field, {
					type: 'server',
					message,
				});
			}
			if (outcome.rootMessages.length > 0) {
				methods.setError('root.server', {
					type: 'server',
					message: outcome.rootMessages.join(' '),
				});
			}
			return;
		}
		if (outcome.kind === 'root-message') {
			methods.setError('root.server', {
				type: 'server',
				message: outcome.message,
			});
			return;
		}

		await displayLocalMutationFailure(error, t('profile-save-failed'));
	};
	const onSubmit = methods.handleSubmit(async (values) => {
		if (!canSave) {
			return;
		}
		methods.clearErrors('root');
		try {
			await updateProfile.mutateAsync({
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

		await invalidateStaffProfiles(queryClient);
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
				<DrawerForm methods={methods} onSubmit={onSubmit}>
					<DrawerBody className="space-y-5">
						<div className="space-y-1.5">
							<div className="grid items-end gap-3 sm:grid-cols-[auto_minmax(0,1fr)]">
								<IconColorPicker
									value={{
										icon: displayedStyle.icon,
										tone: displayedStyle.tone,
									}}
									disabled={isFormLocked}
									onChange={(next) => {
										methods.setValue('icon', next.icon ?? displayedStyle.icon, {
											shouldDirty: true,
										});
										methods.setValue('tone', next.tone ?? displayedStyle.tone, {
											shouldDirty: true,
										});
									}}
								/>
								<Field.Text
									name="name"
									label={t('profile-name')}
									placeholder={t('profile-name-placeholder')}
									isDisabled={isFormLocked}
									fullWidth
								/>
							</div>
							<div className="flex min-h-6 items-center justify-between gap-3 text-xs sm:pl-[68px]">
								<p className="text-muted-foreground">
									{tProfiles('profile-icon-picker-hint')}
								</p>
								{hasCustomStyle ? (
									<Button
										type="button"
										variant="link"
										size="xs"
										disabled={isFormLocked}
										className="h-auto px-0 text-xs"
										onClick={() => {
											methods.setValue('icon', null, {
												shouldDirty: true,
												shouldValidate: true,
											});
											methods.setValue('tone', null, {
												shouldDirty: true,
												shouldValidate: true,
											});
										}}
									>
										{tProfiles('restore-automatic-profile-style')}
									</Button>
								) : null}
							</div>
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
						<Button type="submit" disabled={!canSave}>
							{t('save-changes')}
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
					onDirtyChange?.(false);
					onOpenChange(false);
				}}
			/>
		</Drawer>
	);
};

export { StaffProfileEditDetailsDrawer };
export type { ProfileEditDetailsDrawerProfile };
