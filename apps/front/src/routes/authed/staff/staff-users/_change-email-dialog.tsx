import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
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
	invalidateStaffUsers,
	useUpdateStaffUserEmailMutation,
} from '~/lib/query/staff-users';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';
import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

const buildChangeEmailSchema = (t: (key: string) => string) =>
	z.object({
		email: z
			.string({ required_error: t('common:email-required') })
			.trim()
			.email(t('common:invalid-email-address')),
	});

type ChangeEmailFormValues = z.infer<ReturnType<typeof buildChangeEmailSchema>>;

type ChangeStaffUserEmailDialogProps = {
	userId: string;
	currentEmail: string;
	isOpen: boolean;
	onOpenChange: (isOpen: boolean) => void;
	onUpdated: (email: string) => void;
	onSessionExpired: () => void;
};

/**
 * users-auth-r6-F4: the update-email mutation (`useUpdateStaffUserEmailMutation`)
 * already existed with no consumer anywhere in front — the edit page's
 * email field is permanently disabled with no route to the endpoint behind
 * it. This dialog is that route.
 */
const ChangeStaffUserEmailDialogInner = ({
	userId,
	currentEmail,
	isOpen,
	onOpenChange,
	onUpdated,
	onSessionExpired,
}: ChangeStaffUserEmailDialogProps) => {
	const { t } = useTranslation(['staff-users', 'common']);
	const queryClient = useQueryClient();
	const { mutateAsync, isPending } = useUpdateStaffUserEmailMutation();
	const [rootValidationError, setRootValidationError] = useState('');
	const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
	// Language-keyed resolver: rebuilds when translations change so error
	// messages stay localized; see use-language-keyed-zod-resolver.
	const resolver = useLanguageKeyedZodResolver<ChangeEmailFormValues>(
		buildChangeEmailSchema,
		['staff-users', 'common'],
	);
	const methods = useForm<ChangeEmailFormValues>({
		resolver,
		defaultValues: { email: currentEmail },
	});
	const {
		formState: { isDirty, isSubmitting },
	} = methods;
	const isFormLocked = isPending || isSubmitting;

	// Every close request (Cancel, Escape, backdrop click) must go through
	// this — a dirty, unsaved email edit is discarded without warning
	// otherwise (users-auth-r1-F4).
	const requestClose = () => {
		if (isFormLocked) {
			return;
		}

		if (isDirty) {
			setShowDiscardConfirm(true);
			return;
		}

		onOpenChange(false);
	};

	const onSubmit = methods.handleSubmit(async (values) => {
		setRootValidationError('');

		try {
			await mutateAsync({ userId, email: values.email });
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				onSessionExpired();
				return;
			}

			const failure = toApiFailure(error);
			if (failure.kind === 'validation') {
				const hasEmailError = (failure.fieldErrors.email?.length ?? 0) > 0;
				if (hasEmailError) {
					methods.setError('email', {
						type: 'server',
						message: getFailureMessage(failure, {
							fallback: t('update-staff-user-email-failed'),
						}),
					});
				}

				const hasUnmappedError = Object.keys(failure.fieldErrors).some(
					(field) => field !== 'email',
				);
				if (!hasEmailError || hasUnmappedError) {
					setRootValidationError(
						getFailureMessage(failure, {
							fallback: t('update-staff-user-email-failed'),
						}),
					);
				}
			}
			return;
		}

		await invalidateStaffUsers(queryClient);
		onUpdated(values.email);
	});

	return (
		<>
			<Drawer
				open={isOpen}
				onOpenChange={(open) => {
					if (open) {
						onOpenChange(open);
						return;
					}

					requestClose();
				}}
			>
				<DrawerContent data-testid="change-staff-user-email-dialog">
					<DrawerHeader>
						<DrawerTitle>{t('change-email')}</DrawerTitle>
						<DrawerDescription>
							{t('change-staff-user-email-description')}
						</DrawerDescription>
					</DrawerHeader>
					<DrawerForm methods={methods} onSubmit={onSubmit}>
						<DrawerBody className="space-y-4">
							<Field.Email
								name="email"
								label={t('common:email')}
								isDisabled={isFormLocked}
								fullWidth
							/>
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
								{t('common:cancel')}
							</Button>
							<Button type="submit" disabled={isFormLocked}>
								{t('common:save-changes')}
							</Button>
						</DrawerFooter>
					</DrawerForm>
				</DrawerContent>
			</Drawer>
			<ConfirmDialog
				isOpen={showDiscardConfirm}
				title={t('common:unsaved-changes-dialog-title')}
				description={t('common:unsaved-changes-dialog-description')}
				confirmLabel={t('common:leave-page')}
				cancelLabel={t('common:cancel')}
				tone="danger"
				onConfirm={() => {
					setShowDiscardConfirm(false);
					onOpenChange(false);
				}}
				onOpenChange={(nextOpen) => {
					if (!nextOpen) {
						setShowDiscardConfirm(false);
					}
				}}
			/>
		</>
	);
};

/*
 * Session-keyed mount: each closed -> opened transition bumps a key and
 * remounts the dialog, which seeds itself from its defaultValues at mount.
 * The reset effect this replaces ran on every currentEmail change (a
 * background refetch) and wiped in-progress drafts; a fresh mount only
 * happens for a genuinely new session. The 200ms drawer exit animation
 * keeps the closed instance mounted under its old key.
 */
export const ChangeStaffUserEmailDialog = (
	dialogProps: ChangeStaffUserEmailDialogProps,
) => {
	const [sessionKey, setSessionKey] = useState(0);
	const [wasOpen, setWasOpen] = useState(dialogProps.isOpen);
	if (wasOpen !== dialogProps.isOpen) {
		setWasOpen(dialogProps.isOpen);
		if (dialogProps.isOpen) {
			setSessionKey((key) => key + 1);
		}
	}

	return <ChangeStaffUserEmailDialogInner {...dialogProps} key={sessionKey} />;
};

export default ChangeStaffUserEmailDialog;
