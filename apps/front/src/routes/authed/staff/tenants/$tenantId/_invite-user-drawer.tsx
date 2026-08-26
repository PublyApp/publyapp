import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import type { i18n as I18nInstance } from 'i18next';
import { useEffect, useRef, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
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
import { useLanguageKeyedZodResolver } from '~/lib/hooks/use-language-keyed-zod-resolver';
import {
	displayLocalMutationFailure,
	toastLocalMutationResult,
} from '~/lib/mutation-toast';
import {
	type StaffTenantInvitationBulkCreateFailedItem,
	type StaffTenantInvitationBulkCreateSummary,
	toStaffTenantInvitationBulkCreateSummary,
	useBulkInviteTenantUsersMutation,
} from '~/lib/query/staff-tenant-users';
import { invalidateAllStaffTenantScopes } from '~/lib/query/staff-tenants';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';
import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import { InviteProfileSelect } from './_invite-profile-select';
import { parseInviteeEmails } from './_invite-user-form-state';

const buildInviteUserSchema = (t: (key: string) => string) =>
	z.object({
		pasteEmails: z.string().optional(),
		sharedAccountLevel: z.enum(['Admin', 'User']),
		sharedProfileIds: z.array(z.string()),
		invitations: z
			.array(
				z.object({
					email: z
						.string({ error: t('email-required') })
						.trim()
						.pipe(z.email(t('invalid-email-address'))),
					accountLevel: z.enum(['Admin', 'User'] as const, {
						error: t('account-level-required'),
					}),
					profileIds: z.array(z.string()),
				}),
			)
			.min(1, t('invitee-required')),
	});

type InviteTenantUserFormValues = z.infer<
	ReturnType<typeof buildInviteUserSchema>
>;

const EMPTY_INVITEE: InviteTenantUserFormValues['invitations'][number] = {
	email: '',
	accountLevel: 'User',
	profileIds: [],
};

const DEFAULT_VALUES: InviteTenantUserFormValues = {
	pasteEmails: '',
	sharedAccountLevel: 'User',
	sharedProfileIds: [],
	invitations: [EMPTY_INVITEE],
};

const getFailedInviteeMessage = (
	failedItem: StaffTenantInvitationBulkCreateFailedItem,
	i18n: I18nInstance,
	t: (key: string, options?: Record<string, unknown>) => string,
): string => {
	const fallback = t('invite-tenant-user-failed');
	const translationKey = failedItem.translationKey;
	if (!translationKey) {
		return fallback;
	}

	return i18n.t(translationKey, {
		ns: 'response-message',
		defaultValue: fallback,
	});
};

const toFailedInvitations = (
	values: InviteTenantUserFormValues,
	summary: StaffTenantInvitationBulkCreateSummary,
): InviteTenantUserFormValues['invitations'] => {
	const failedInvitations: InviteTenantUserFormValues['invitations'] = [];
	const seenIndexes = new Set<number>();

	for (const failedItem of summary.failedItems) {
		const index = failedItem.index;
		if (index === null || seenIndexes.has(index)) {
			continue;
		}

		const invitation = values.invitations[index];
		if (!invitation) {
			continue;
		}

		failedInvitations.push(invitation);
		seenIndexes.add(index);
	}

	return failedInvitations;
};

type Translate = (key: string, options?: Record<string, unknown>) => string;

const PasteInviteesSection = ({
	tenantId,
	isFormLocked,
	onAddPastedEmails,
	onSessionExpired,
	t,
}: {
	tenantId: string;
	isFormLocked: boolean;
	onAddPastedEmails: () => void;
	onSessionExpired: () => void;
	t: Translate;
}) => (
	<section className="space-y-3 rounded-[var(--publy-radius-card)] p-3 shadow-[var(--publy-shadow-ring)]">
		<div className="space-y-1">
			<h3 className="text-sm font-semibold text-foreground">
				{t('paste-email-addresses')}
			</h3>
			<p className="text-xs text-muted-foreground">
				{t('paste-email-addresses-description')}
			</p>
		</div>
		<Field.Textarea
			name="pasteEmails"
			label={t('paste-emails')}
			placeholder={t('paste-emails-placeholder')}
			rows={3}
			isDisabled={isFormLocked}
		/>
		<div className="grid gap-3 sm:grid-cols-2">
			<Field.Select
				name="sharedAccountLevel"
				label={t('shared-account-level')}
				options={[
					{ value: 'Admin', label: t('admin') },
					{ value: 'User', label: t('user') },
				]}
				isDisabled={isFormLocked}
			/>
			<InviteProfileSelect
				tenantId={tenantId}
				name="sharedProfileIds"
				label={t('shared-profiles')}
				isDisabled={isFormLocked}
				onSessionExpired={onSessionExpired}
			/>
		</div>
		<Button
			type="button"
			variant="outline"
			disabled={isFormLocked}
			onClick={onAddPastedEmails}
		>
			<IconPlus aria-hidden="true" className="size-4" />
			{t('add-pasted-emails')}
		</Button>
	</section>
);

const InviteeRows = ({
	tenantId,
	fields,
	isFormLocked,
	onAddInvitee,
	onRemoveInvitee,
	onSessionExpired,
	t,
}: {
	tenantId: string;
	fields: Array<{ id: string }>;
	isFormLocked: boolean;
	onAddInvitee: () => void;
	onRemoveInvitee: (index: number) => void;
	onSessionExpired: () => void;
	t: Translate;
}) => (
	<>
		<div className="space-y-3">
			{fields.map((field, index) => (
				<section
					key={field.id}
					className="space-y-3 rounded-[var(--publy-radius-card)] p-3 shadow-[var(--publy-shadow-ring)]"
				>
					<div className="flex items-center justify-between gap-3">
						<h3 className="text-sm font-semibold text-foreground">
							{t('invitee-number', { number: index + 1 })}
						</h3>
						{fields.length > 1 ? (
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								disabled={isFormLocked}
								aria-label={t('remove-invitee', { number: index + 1 })}
								onClick={() => onRemoveInvitee(index)}
							>
								<IconTrash aria-hidden="true" className="size-4" />
							</Button>
						) : null}
					</div>
					<Field.Email
						name={`invitations.${index}.email`}
						label={t('email')}
						placeholder={t('email-placeholder')}
						isDisabled={isFormLocked}
						fullWidth
					/>
					<Field.Select
						name={`invitations.${index}.accountLevel`}
						label={t('account-level')}
						options={[
							{ value: 'Admin', label: t('admin') },
							{ value: 'User', label: t('user') },
						]}
						isDisabled={isFormLocked}
					/>
					<InviteProfileSelect
						tenantId={tenantId}
						name={`invitations.${index}.profileIds`}
						label={t('profiles')}
						isDisabled={isFormLocked}
						onSessionExpired={onSessionExpired}
					/>
				</section>
			))}
		</div>
		<Button
			type="button"
			variant="outline"
			disabled={isFormLocked}
			onClick={onAddInvitee}
		>
			<IconPlus aria-hidden="true" className="size-4" />
			{t('add-another-invitee')}
		</Button>
	</>
);

const InviteBatchSummary = ({
	batchSummary,
	i18n,
	t,
}: {
	batchSummary: StaffTenantInvitationBulkCreateSummary;
	i18n: I18nInstance;
	t: Translate;
}) => (
	<div
		className="space-y-2 rounded-[var(--publy-radius-control)] bg-muted p-3 text-sm"
		role="alert"
	>
		<p className="font-medium text-foreground">
			{t('tenant-invitations-batch-summary', {
				succeeded: batchSummary.succeededCount,
				failed: batchSummary.failedCount,
			})}
		</p>
		<ul className="space-y-1 text-destructive">
			{batchSummary.failedItems.map((failedItem) => (
				<li
					key={`${failedItem.index ?? 'unknown'}-${failedItem.email ?? ''}-${failedItem.translationKey ?? ''}`}
				>
					<span className="font-medium">
						{failedItem.email ?? t('unknown-invitee')}
					</span>
					{' — '}
					{getFailedInviteeMessage(failedItem, i18n, t)}
				</li>
			))}
		</ul>
	</div>
);

type InviteTenantUserDrawerProps = {
	tenantId: string;
	isOpen: boolean;
	onOpenChange: (isOpen: boolean) => void;
	onInvited: () => void;
	onSessionExpired: () => void;
	onDirtyChange?: (isDirty: boolean) => void;
};

const InviteTenantUserDrawerInner = ({
	tenantId,
	isOpen,
	onOpenChange,
	onInvited,
	onSessionExpired,
	onDirtyChange,
}: InviteTenantUserDrawerProps) => {
	const { t, i18n } = useTranslation('common');
	const queryClient = useQueryClient();
	const bulkInvite = useBulkInviteTenantUsersMutation();
	const [rootValidationError, setRootValidationError] = useState('');
	const [batchSummary, setBatchSummary] =
		useState<StaffTenantInvitationBulkCreateSummary | null>(null);
	// Language-keyed resolver: rebuilds when translations change so error
	// messages stay localized; see use-language-keyed-zod-resolver.
	const resolver = useLanguageKeyedZodResolver<InviteTenantUserFormValues>(
		buildInviteUserSchema,
		'common',
	);
	const methods = useForm<InviteTenantUserFormValues>({
		resolver,
		defaultValues: DEFAULT_VALUES,
	});
	const {
		control,
		reset,
		formState: { isDirty, isSubmitting },
	} = methods;
	const { fields, append, remove, replace } = useFieldArray({
		control,
		name: 'invitations',
	});
	const [isDiscardConfirmOpen, setIsDiscardConfirmOpen] = useState(false);

	// Dirty-flag uplink, event-driven: RHF's change stream fires synchronously
	// on the form mutation that owns each change (user input, setValue,
	// append/replace, reset) and always carries the full form snapshot.
	// Dirtiness derives from comparing that snapshot against the pristine
	// defaults captured once at mount — not from React's render-lagged
	// formState snapshot, and not from the isOpen prop, whose value at effect
	// time belongs to the session the wrapper has already rotated past.
	// Dirtiness itself comes from react-hook-form's own synchronous dirty
	// computation (control._getDirty compares the live values against the
	// pristine defaultValues this session mounted with); the dedup ref keeps
	// repeated same-value emissions from reaching the host.
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

	const isFormLocked = bulkInvite.isPending || isSubmitting;

	const requestClose = () => {
		if (isDirty) {
			setIsDiscardConfirmOpen(true);
			return;
		}

		onOpenChange(false);
	};

	const addPastedEmails = () => {
		setRootValidationError('');
		setBatchSummary(null);
		const emails = parseInviteeEmails(methods.getValues('pasteEmails') ?? '');
		if (emails.length === 0) {
			setRootValidationError(t('no-invitee-emails-to-add'));
			return;
		}

		const sharedAccountLevel = methods.getValues('sharedAccountLevel');
		const sharedProfileIds = methods.getValues('sharedProfileIds');
		const nextInvitations = emails.map((email) => ({
			email,
			accountLevel: sharedAccountLevel,
			profileIds: [...sharedProfileIds],
		}));
		const existingInvitations = methods.getValues('invitations');
		const hasOnlyBlankInitialRow =
			existingInvitations.length === 1 &&
			existingInvitations[0]?.email.trim().length === 0;

		if (hasOnlyBlankInitialRow) {
			replace(nextInvitations);
		} else {
			for (const invitation of nextInvitations) {
				append(invitation);
			}
		}
		methods.setValue('pasteEmails', '', { shouldDirty: true });
	};

	const onSubmit = methods.handleSubmit(async (values) => {
		setRootValidationError('');
		setBatchSummary(null);

		let result;
		try {
			result = await bulkInvite.mutateAsync({
				tenantId,
				invitations: values.invitations,
			});
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				onSessionExpired();
				return;
			}

			const failure = toApiFailure(error);
			if (failure.kind === 'validation') {
				let mappedEmailError = false;
				let hasUnmappedError = false;

				for (const [field, messages] of Object.entries(failure.fieldErrors)) {
					const match = /^invitations\[(\d+)\]\.email$/i.exec(field);
					const index = match ? Number(match[1]) : Number.NaN;
					if (Number.isInteger(index) && values.invitations[index]) {
						methods.setError(`invitations.${index}.email`, {
							type: 'server',
							message: getFailureMessage(failure, {
								fallback: t('invite-tenant-user-failed'),
							}),
						});
						mappedEmailError = true;
					} else {
						hasUnmappedError = messages.length > 0 || hasUnmappedError;
					}
				}

				if (!mappedEmailError || hasUnmappedError) {
					setRootValidationError(
						getFailureMessage(failure, {
							fallback: t('invite-tenant-user-failed'),
						}),
					);
				}
				return;
			}

			await displayLocalMutationFailure(error, t('invite-tenant-user-failed'));
			return;
		}

		if (!result) {
			setRootValidationError(t('invite-tenant-user-failed'));
			return;
		}

		const summary = toStaffTenantInvitationBulkCreateSummary(result);
		if (summary.succeededCount > 0) {
			await invalidateAllStaffTenantScopes(queryClient);
		}

		if (summary.failedCount > 0) {
			setBatchSummary(summary);
			const failedInvitations = toFailedInvitations(values, summary);
			if (failedInvitations.length > 0) {
				reset(
					{
						pasteEmails: '',
						sharedAccountLevel: values.sharedAccountLevel,
						sharedProfileIds: values.sharedProfileIds,
						invitations: failedInvitations,
					},
					{ keepDirty: true, keepDefaultValues: true },
				);
			}
			return;
		}

		toastLocalMutationResult.success(
			t('tenant-invitations-batch-success', {
				count: summary.succeededCount,
			}),
		);
		onDirtyChange?.(false);
		onInvited();
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
			<DrawerContent data-testid="invite-tenant-user-drawer">
				<DrawerHeader>
					<DrawerTitle>{t('invite-tenant-user')}</DrawerTitle>
					<DrawerDescription>
						{t('invite-tenant-users-description')}
					</DrawerDescription>
				</DrawerHeader>
				<DrawerForm methods={methods} onSubmit={onSubmit}>
					<DrawerBody className="space-y-5">
						<PasteInviteesSection
							tenantId={tenantId}
							isFormLocked={isFormLocked}
							onAddPastedEmails={addPastedEmails}
							onSessionExpired={onSessionExpired}
							t={t}
						/>
						<InviteeRows
							tenantId={tenantId}
							fields={fields}
							isFormLocked={isFormLocked}
							onAddInvitee={() => append({ ...EMPTY_INVITEE })}
							onRemoveInvitee={remove}
							onSessionExpired={onSessionExpired}
							t={t}
						/>
						{batchSummary ? (
							<InviteBatchSummary
								batchSummary={batchSummary}
								i18n={i18n}
								t={t}
							/>
						) : null}

						{rootValidationError ? (
							<p className="text-sm text-destructive" role="alert">
								{rootValidationError}
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
							{t('invite-people')}
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
 * remounts the drawer, which seeds itself from its defaultValues at mount.
 * The reset effect this replaced also cleared transient state through
 * prop-change effects; the fresh mount covers all of it exactly once per
 * session. The 200ms exit animation keeps the closing instance mounted
 * under its old key.
 */
export const InviteTenantUserDrawer = (
	drawerProps: InviteTenantUserDrawerProps,
) => {
	const [sessionKey, setSessionKey] = useState(0);
	const [wasOpen, setWasOpen] = useState(drawerProps.isOpen);
	if (wasOpen !== drawerProps.isOpen) {
		setWasOpen(drawerProps.isOpen);
		if (drawerProps.isOpen) {
			setSessionKey((key) => key + 1);
		}
	}

	return <InviteTenantUserDrawerInner {...drawerProps} key={sessionKey} />;
};
