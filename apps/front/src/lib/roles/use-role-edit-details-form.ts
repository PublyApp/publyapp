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

import { deriveRoleCardStyle } from './role-card-style';
import { resolveRoleSaveFailure } from './role-edit-details-save-failure';

/** The role fields the drawer edits — the same shape for the staff
 * (non-tenant) and tenant-scoped role surfaces. */
type RoleEditDetailsDrawerRole = {
	id: string;
	name: string;
	description: string | null;
	icon?: string | null;
	tone?: string | null;
};

/** Every prop the two drawers (`staff/roles/$roleId` and
 * `staff/tenants/$tenantId/roles`) share; the tenant scope adds `tenantId`
 * and otherwise renders the identical drawer. */
export type RoleEditDetailsDrawerProps = {
	isOpen: boolean;
	role: RoleEditDetailsDrawerRole;
	onOpenChange: (isOpen: boolean) => void;
	onSaved: (roleId: string) => void;
	onSessionExpired: () => void;
	onDirtyChange?: (isDirty: boolean) => void;
};

const buildRoleEditDetailsSchema = (t: (key: string) => string) =>
	z.object({
		name: z
			.string()
			.trim()
			.min(1, { message: t('role-name-required') })
			.min(2, { message: t('role-name-too-short') })
			.max(100, { message: t('role-name-too-long') }),
		description: z
			.string()
			.trim()
			.max(500, { message: t('role-description-too-long') })
			.optional(),
		icon: z.string().min(1).nullable(),
		tone: z.string().min(1).nullable(),
	});

type RoleEditDetailsValues = z.infer<
	ReturnType<typeof buildRoleEditDetailsSchema>
>;

const ROLE_EDIT_DETAILS_FIELDS = [
	'name',
	'description',
	'icon',
	'tone',
] as const satisfies readonly (keyof RoleEditDetailsValues)[];

const isRoleEditDetailsField = (
	field: string,
): field is (typeof ROLE_EDIT_DETAILS_FIELDS)[number] =>
	ROLE_EDIT_DETAILS_FIELDS.some((candidate) => candidate === field);

const getRoleEditDetailsValues = (
	role: RoleEditDetailsDrawerRole,
): RoleEditDetailsValues => ({
	name: role.name,
	description: role.description ?? '',
	icon: role.icon ?? null,
	tone: role.tone ?? null,
});

/** Mirrors `IconColorPicker`'s own value shape: a member left absent keeps the
 * style that is currently displayed. */
type RoleEditDetailsStyle = { icon?: string; tone?: string };

type UseRoleEditDetailsFormArgs = {
	role: RoleEditDetailsDrawerRole;
	/** `isPending` of the scope's update mutation (#1342 locking contract). */
	isSaving: boolean;
	/** The scope's own PATCH — staff-level or tenant-scoped. */
	save: (values: RoleEditDetailsValues) => Promise<void>;
	/** The scope's own cache invalidation, awaiting before reporting success. */
	invalidate: () => Promise<void>;
	onOpenChange: (isOpen: boolean) => void;
	onSaved: (roleId: string) => void;
	onSessionExpired: () => void;
	onDirtyChange?: (isDirty: boolean) => void;
};

export type RoleEditDetailsFormState = {
	methods: ReturnType<typeof useForm<RoleEditDetailsValues>>;
	onSubmit: ReturnType<
		ReturnType<typeof useForm<RoleEditDetailsValues>>['handleSubmit']
	>;
	isFormLocked: boolean;
	canSave: boolean;
	handleOpenChange: (open: boolean) => void;
	requestClose: () => void;
	isDiscardConfirmOpen: boolean;
	setDiscardConfirmOpen: (isOpen: boolean) => void;
	confirmLeave: () => void;
	displayedStyle: ReturnType<typeof deriveRoleCardStyle>;
	hasCustomStyle: boolean;
	handleStyleChange: (next: RoleEditDetailsStyle) => void;
	restoreAutomaticStyle: () => void;
};

/**
 * One implementation of the role "edit details" form, shared verbatim by
 * the staff (`staff/roles/$roleId`) and tenant
 * (`staff/tenants/$tenantId/roles`) drawers: schema, seed values, style
 * derivation, save-failure routing, the #1342 pristine-save contract and the
 * dirty-flag uplink. The scopes differ only in the PATCH they send and the
 * cache they invalidate, which arrive as callbacks — everything a user sees
 * is rendered by the one shared body (`RoleEditDetailsFormContent`).
 *
 * Mount it once per drawer session: the values are seeded from `role` at
 * mount, so a host that must re-seed for each open remounts the component
 * that calls this hook under a session key (see both `RoleEditDetailsDrawerProps`
 * consumers).
 */
export const useRoleEditDetailsForm = ({
	role,
	isSaving,
	save,
	invalidate,
	onOpenChange,
	onSaved,
	onSessionExpired,
	onDirtyChange,
}: UseRoleEditDetailsFormArgs): RoleEditDetailsFormState => {
	const { t } = useTranslation('common');
	// Language-keyed resolver: rebuilds when translations change so error
	// messages stay localized; see use-language-keyed-zod-resolver.
	const resolver = useLanguageKeyedZodResolver<RoleEditDetailsValues>(
		buildRoleEditDetailsSchema,
		'common',
	);
	const methods = useForm<RoleEditDetailsValues>({
		resolver,
		defaultValues: getRoleEditDetailsValues(role),
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
	const displayedStyle = deriveRoleCardStyle(name ?? role.name, icon, tone);
	const hasCustomStyle = icon !== null || tone !== null;

	// tenants-r6-F3 dirty-flag uplink, event-driven: RHF's change stream fires
	// synchronously on the form mutation that owns each change (user input,
	// setValue, reset) and always carries the full form snapshot. Dirtiness
	// derives from comparing that snapshot against the values captured once
	// at mount — not from React's render-lagged formState snapshot, and not
	// from the live role prop, which would move the goalposts mid-draft
	// when a background refetch replaces the role object. Each session
	// starts on a fresh mount seeded from the role, so no baseline needs
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

		// Shared with both scope drawers (see `resolveRoleSaveFailure`): a
		// 422 belongs to this form whether or not its `errors` map carried
		// entries; everything else keeps going to the local failure toast.
		const outcome = resolveRoleSaveFailure({
			error,
			isKnownField: isRoleEditDetailsField,
			fallbackMessage: t('role-save-failed'),
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

		await displayLocalMutationFailure(error, t('role-save-failed'));
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
		toastLocalMutationResult.success(t('role-updated-successfully'));
		onDirtyChange?.(false);
		onSaved(role.id);
	});
	const handleStyleChange = (next: RoleEditDetailsStyle): void => {
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
