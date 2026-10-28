import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useLanguageKeyedZodResolver } from '~/lib/hooks/use-language-keyed-zod-resolver';
import {
	displayLocalMutationFailure,
	toastLocalMutationResult,
} from '~/lib/mutation-feedback/mutation-toast';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import { deriveProfileCardStyle } from './profile-card-style';
import { resolveProfileSaveFailure } from './profile-edit-details-save-failure';

/** The profile fields the drawer edits — the same shape for the staff
 * (non-tenant) and tenant-scoped profile surfaces. */
export type ProfileEditDetailsDrawerProfile = {
	id: string;
	name: string;
	description: string | null;
	icon?: string | null;
	tone?: string | null;
};

/** Every prop the two drawers (`staff/profiles/$profileId` and
 * `staff/tenants/$tenantId/profiles`) share; the tenant scope adds `tenantId`
 * and otherwise renders the identical drawer. */
export type ProfileEditDetailsDrawerProps = {
	isOpen: boolean;
	profile: ProfileEditDetailsDrawerProfile;
	onOpenChange: (isOpen: boolean) => void;
	onSaved: (profileId: string) => void;
	onSessionExpired: () => void;
	onDirtyChange?: (isDirty: boolean) => void;
};

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

export type ProfileEditDetailsValues = z.infer<
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

const getProfileEditDetailsValues = (
	profile: ProfileEditDetailsDrawerProfile,
): ProfileEditDetailsValues => ({
	name: profile.name,
	description: profile.description ?? '',
	icon: profile.icon ?? null,
	tone: profile.tone ?? null,
});

/** Mirrors `IconColorPicker`'s own value shape: a member left absent keeps the
 * style that is currently displayed. */
type ProfileEditDetailsStyle = { icon?: string; tone?: string };

type UseProfileEditDetailsFormArgs = {
	profile: ProfileEditDetailsDrawerProfile;
	/** `isPending` of the scope's update mutation (#1342 locking contract). */
	isSaving: boolean;
	/** The scope's own PATCH — staff-level or tenant-scoped. */
	save: (values: ProfileEditDetailsValues) => Promise<void>;
	/** The scope's own cache invalidation, awaiting before reporting success. */
	invalidate: () => Promise<void>;
	onOpenChange: (isOpen: boolean) => void;
	onSaved: (profileId: string) => void;
	onSessionExpired: () => void;
	onDirtyChange?: (isDirty: boolean) => void;
};

export type ProfileEditDetailsFormState = {
	methods: ReturnType<typeof useForm<ProfileEditDetailsValues>>;
	onSubmit: ReturnType<
		ReturnType<typeof useForm<ProfileEditDetailsValues>>['handleSubmit']
	>;
	isFormLocked: boolean;
	canSave: boolean;
	handleOpenChange: (open: boolean) => void;
	requestClose: () => void;
	isDiscardConfirmOpen: boolean;
	setDiscardConfirmOpen: (isOpen: boolean) => void;
	confirmLeave: () => void;
	displayedStyle: ReturnType<typeof deriveProfileCardStyle>;
	hasCustomStyle: boolean;
	handleStyleChange: (next: ProfileEditDetailsStyle) => void;
	restoreAutomaticStyle: () => void;
};

/**
 * One implementation of the profile "edit details" form, shared verbatim by
 * the staff (`staff/profiles/$profileId`) and tenant
 * (`staff/tenants/$tenantId/profiles`) drawers: schema, seed values, style
 * derivation, save-failure routing, the #1342 pristine-save contract and the
 * dirty-flag uplink. The scopes differ only in the PATCH they send and the
 * cache they invalidate, which arrive as callbacks — everything a user sees
 * is rendered by the one shared body (`ProfileEditDetailsFormContent`).
 *
 * Mount it once per drawer session: the values are seeded from `profile` at
 * mount, so a host that must re-seed for each open remounts the component
 * that calls this hook under a session key (see both `ProfileEditDetailsDrawerProps`
 * consumers).
 */
export const useProfileEditDetailsForm = ({
	profile,
	isSaving,
	save,
	invalidate,
	onOpenChange,
	onSaved,
	onSessionExpired,
	onDirtyChange,
}: UseProfileEditDetailsFormArgs): ProfileEditDetailsFormState => {
	const { t } = useTranslation('common');
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
	// The tile previews the style that will be persisted; the helper falls back
	// to the deterministic derivation when nothing is stored (#980).
	const displayedStyle = deriveProfileCardStyle(
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
	// starts on a fresh mount seeded from the profile, so no baseline needs
	// to be captured from props. Dirtiness itself comes from
	// react-hook-form's own synchronous dirty computation (`control._getDirty`
	// compares the live values against the pristine defaultValues this
	// session mounted with); the dedup ref keeps repeated same-value
	// emissions from reaching the host.
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

	const isFormLocked = isSaving || isSubmitting;
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
	const handleOpenChange = (open: boolean): void => {
		if (isFormLocked) {
			return;
		}
		if (!open) {
			requestClose();
			return;
		}
		onOpenChange(open);
	};
	const confirmLeave = (): void => {
		setIsDiscardConfirmOpen(false);
		onDirtyChange?.(false);
		onOpenChange(false);
	};
	const handleSaveFailure = async (error: unknown): Promise<void> => {
		if (shouldLogoutForFailure(error)) {
			onSessionExpired();
			return;
		}

		// Shared with both scope drawers (see `resolveProfileSaveFailure`): a
		// 422 belongs to this form whether or not its `errors` map carried
		// entries; everything else keeps going to the local failure toast.
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
			await save(values);
		} catch (error) {
			await handleSaveFailure(error);
			return;
		}

		await invalidate();
		toastLocalMutationResult.success(t('profile-updated-successfully'));
		onDirtyChange?.(false);
		onSaved(profile.id);
	});
	const handleStyleChange = (next: ProfileEditDetailsStyle): void => {
		methods.setValue('icon', next.icon ?? displayedStyle.icon, {
			shouldDirty: true,
		});
		methods.setValue('tone', next.tone ?? displayedStyle.tone, {
			shouldDirty: true,
		});
	};
	const restoreAutomaticStyle = (): void => {
		methods.setValue('icon', null, { shouldDirty: true, shouldValidate: true });
		methods.setValue('tone', null, { shouldDirty: true, shouldValidate: true });
	};

	return {
		methods,
		onSubmit,
		isFormLocked,
		canSave,
		handleOpenChange,
		requestClose,
		isDiscardConfirmOpen,
		setDiscardConfirmOpen: setIsDiscardConfirmOpen,
		confirmLeave,
		displayedStyle,
		hasCustomStyle,
		handleStyleChange,
		restoreAutomaticStyle,
	};
};
