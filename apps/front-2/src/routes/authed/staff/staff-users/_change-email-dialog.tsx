import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
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
import {
	invalidateStaffUsers,
	useUpdateStaffUserEmailMutation,
} from '~/lib/query/staff-users';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';

const buildChangeEmailSchema = (t: (key: string) => string) =>
	z.object({
		email: z
			.string({ required_error: t('email-required') })
			.trim()
			.email(t('invalid-email-address')),
	});

type ChangeEmailFormValues = z.infer<ReturnType<typeof buildChangeEmailSchema>>;

/**
 * users-auth-r6-F4: the update-email mutation (`useUpdateStaffUserEmailMutation`)
 * already existed with no consumer anywhere in front-2 — the edit page's
 * email field is permanently disabled with no route to the endpoint behind
 * it. This dialog is that route.
 */
export const ChangeStaffUserEmailDialog = ({
	userId,
	currentEmail,
	isOpen,
	onOpenChange,
	onUpdated,
	onSessionExpired,
}: {
	userId: string;
	currentEmail: string;
	isOpen: boolean;
	onOpenChange: (isOpen: boolean) => void;
	onUpdated: (email: string) => void;
	onSessionExpired: () => void;
}) => {
	const { t, i18n } = useTranslation('common');
	const queryClient = useQueryClient();
	const { mutateAsync, isPending } = useUpdateStaffUserEmailMutation();
	const [serverErrors, setServerErrors] = useState<string[]>([]);
	const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
	const resolver = useMemo(
		() => zodResolver(buildChangeEmailSchema(t)),
		// eslint-disable-next-line react-hooks/exhaustive-deps -- rebuild on language change so messages stay localized
		[i18n.language],
	);
	const methods = useForm<ChangeEmailFormValues>({
		resolver,
		defaultValues: { email: currentEmail },
	});
	const {
		reset,
		formState: { isDirty, isSubmitting },
	} = methods;
	const isFormLocked = isPending || isSubmitting;

	useEffect(() => {
		if (isOpen) {
			setServerErrors([]);
			setShowDiscardConfirm(false);
			reset({ email: currentEmail });
		}
	}, [isOpen, currentEmail, reset]);

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
		setServerErrors([]);

		try {
			await mutateAsync({ userId, email: values.email });
			await invalidateStaffUsers(queryClient);
			onUpdated(values.email);
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				onSessionExpired();
				return;
			}

			const failure = toApiFailure(error);
			if (
				failure.kind === 'validation' &&
				(failure.fieldErrors.email?.length ?? 0) > 0
			) {
				methods.setError('email', {
					type: 'server',
					message: getFailureMessage(failure, {
						fallback: t('update-staff-user-email-failed'),
					}),
				});
				return;
			}

			setServerErrors([
				getFailureMessage(failure, {
					fallback: t('update-staff-user-email-failed'),
				}),
			]);
		}
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
					<Form methods={methods} onSubmit={onSubmit}>
						<DrawerBody className="space-y-4">
							<Field.Email
								name="email"
								label={t('email')}
								isDisabled={isFormLocked}
								fullWidth
							/>
							{serverErrors.length > 0 ? (
								<div
									className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
									role="alert"
								>
									<ul className="list-disc space-y-1 pl-4">
										{serverErrors.map((error) => (
											<li key={error}>{error}</li>
										))}
									</ul>
								</div>
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
			</Drawer>
			<ConfirmDialog
				isOpen={showDiscardConfirm}
				title={t('unsaved-changes-dialog-title')}
				description={t('unsaved-changes-dialog-description')}
				confirmLabel={t('leave-page')}
				cancelLabel={t('cancel')}
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

export default ChangeStaffUserEmailDialog;
