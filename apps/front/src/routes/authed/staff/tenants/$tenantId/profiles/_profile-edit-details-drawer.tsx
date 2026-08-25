import { IconInfoCircle } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
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
import { useLanguageKeyedZodResolver } from '~/lib/hooks/use-language-keyed-zod-resolver';
import {
	displayLocalMutationFailure,
	toastLocalMutationResult,
} from '~/lib/mutation-toast';
import { resolveProfileSaveFailure } from '~/lib/profile-edit-details-save-failure';
import { useUpdateStaffTenantProfileMutation } from '~/lib/query/staff-tenant-profiles';
import { invalidateAllStaffTenantScopes } from '~/lib/query/staff-tenants';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import { deriveTenantProfileCardStyle } from './_profile-card-style';

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

type ProfileEditDetailsDrawerProps = {
	tenantId: string;
	isOpen: boolean;
	profile: ProfileEditDetailsDrawerProfile;
	onOpenChange: (isOpen: boolean) => void;
	onSaved: (profileId: string) => void;
	onSessionExpired: () => void;
	onDirtyChange?: (isDirty: boolean) => void;
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
	const { t } = useTranslation('common');
	const { t: tProfiles } = useTranslation('staff-tenant-profiles');
	const queryClient = useQueryClient();
	const updateProfile = useUpdateStaffTenantProfileMutation();
	// Language-keyed resolver: rebuilds when translations change so error
	// messages stay localized; see use-language-keyed-zod-resolver.
	const resolver = useLanguageKeyedZodResolver<ProfileEditDetailsValues>(
		buildProfileEditDetailsSchema,
		'common',
	);
	const methods = useForm<ProfileEditDetailsValues>({
		resolver,
		defaultValues: getProfileEditDetailsValues(profile),
	});
	const {
		formState: { isDirty, isSubmitting },
	} = methods;
	const [isDiscardConfirmOpen, setIsDiscardConfirmOpen] = useState(false);
	const name = useWatch({ control: methods.control, name: 'name' });
	const icon = useWatch({ control: methods.control, name: 'icon' });
	const tone = useWatch({ control: methods.control, name: 'tone' });
	const displayedStyle = deriveTenantProfileCardStyle(
		name ?? profile.name,
		icon,
		tone,
	);
	const hasCustomStyle = icon !== null || tone !== null;

	// tenants-r6-F3 dirty-flag uplink, event-driven: RHF's change stream fires
	// synchronously on the form mutation that owns each change (user input,
	// setValue, reset) and always carries the full form snapshot. Dirtiness
	// derives from comparing that snapshot against the values captured once
	// at mount — not from React's render-lagged formState snapshot, and not
	// from the live profile prop, which would move the goalposts mid-draft
	// when a background refetch replaces the profile object. Each session
	// starts on a fresh mount seeded from the profile (see the keyed wrapper
	// below), so no baseline needs to be captured from props. Dirtiness
	// itself comes from react-hook-form's own synchronous dirty computation
	// (control._getDirty compares the live values against the pristine
	// defaultValues this session mounted with); the dedup ref keeps repeated
	// same-value emissions from reaching the host.
	const lastReportedDirtyRef = useRef<boolean | null>(null);
	useEffect(() => {
		const report = (nextDirty: boolean) => {
			if (lastReportedDirtyRef.current !== nextDirty) {
				lastReportedDirtyRef.current = nextDirty;
				onDirtyChange?.(nextDirty);
			}
		};
		const computeNextDirty = () => methods.control._getDirty();
		lastReportedDirtyRef.current = null;
		report(computeNextDirty());
		const subscription = methods.watch(() => {
			report(computeNextDirty());
		});
		return () => {
			subscription.unsubscribe();
		};
	}, [methods, onDirtyChange]);

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

		// Shared with the staff drawer (see `resolveProfileSaveFailure`): a 422
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
			<DrawerContent width={736} data-testid="profile-edit-details-drawer">
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
									placeholder={t('tenant-profile-name-placeholder')}
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
export type { ProfileEditDetailsDrawerProfile };
