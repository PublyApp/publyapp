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
import { useInviteTenantUserMutation } from '~/lib/query/staff-tenant-users';
import { invalidateAllStaffTenantScopes } from '~/lib/query/staff-tenants';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';

const buildInviteUserSchema = (t: (key: string) => string) =>
	z.object({
		email: z
			.string({ required_error: t('email-required') })
			.trim()
			.email(t('invalid-email-address')),
		accountLevel: z.enum(['Admin', 'User'], {
			required_error: t('account-level-required'),
		}),
	});

type InviteTenantUserFormValues = z.infer<
	ReturnType<typeof buildInviteUserSchema>
>;

const DEFAULT_VALUES: InviteTenantUserFormValues = {
	email: '',
	accountLevel: 'User',
};

export const InviteTenantUserDrawer = ({
	tenantId,
	isOpen,
	onOpenChange,
	onInvited,
	onSessionExpired,
	onDirtyChange,
}: {
	tenantId: string;
	isOpen: boolean;
	onOpenChange: (isOpen: boolean) => void;
	onInvited: () => void;
	onSessionExpired: () => void;
	/**
	 * Reports form dirtiness to the parent so it can guard the URL-driven
	 * open path (`?invite=1`) against a browser Back or sibling-route
	 * navigation — those transitions update/unmount this drawer without ever
	 * calling `onOpenChange` (tenants-r1-F2).
	 */
	onDirtyChange?: (isDirty: boolean) => void;
}) => {
	const { t, i18n } = useTranslation('common');
	const queryClient = useQueryClient();
	const { mutateAsync, isPending } = useInviteTenantUserMutation();
	const [rootValidationError, setRootValidationError] = useState('');
	const resolver = useMemo(
		() => zodResolver(buildInviteUserSchema(t)),
		// eslint-disable-next-line react-hooks/exhaustive-deps -- rebuild on language change so messages stay localized
		[i18n.language],
	);
	const methods = useForm<InviteTenantUserFormValues>({
		resolver,
		defaultValues: DEFAULT_VALUES,
	});
	const {
		reset,
		formState: { isDirty, isSubmitting },
	} = methods;
	const [isDiscardConfirmOpen, setIsDiscardConfirmOpen] = useState(false);

	useEffect(() => {
		if (isOpen) {
			setRootValidationError('');
			setIsDiscardConfirmOpen(false);
			reset(DEFAULT_VALUES);
		}
	}, [isOpen, reset]);

	useEffect(() => {
		onDirtyChange?.(isDirty);
	}, [isDirty, onDirtyChange]);

	// tenants-r6-F3: every close path (Escape, backdrop click, Cancel, and
	// browser back — all funneled through Base UI's `onOpenChange`) must
	// confirm before discarding a dirty form, not just the page-level forms.
	const requestClose = () => {
		if (isDirty) {
			setIsDiscardConfirmOpen(true);
			return;
		}

		onOpenChange(false);
	};

	const invalidateTenantData = () =>
		invalidateAllStaffTenantScopes(queryClient);

	const onSubmit = methods.handleSubmit(async (values) => {
		setRootValidationError('');

		try {
			await mutateAsync({
				tenantId,
				email: values.email,
				accountLevel: values.accountLevel,
			});
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
							fallback: t('invite-tenant-user-failed'),
						}),
					});
				}

				const hasUnmappedError = Object.keys(failure.fieldErrors).some(
					(field) => field !== 'email',
				);
				if (!hasEmailError || hasUnmappedError) {
					setRootValidationError(
						getFailureMessage(failure, {
							fallback: t('invite-tenant-user-failed'),
						}),
					);
				}
			}
			return;
		}

		await invalidateTenantData();
		// A successful submit must never trip the parent's nav guard on the
		// navigation `onInvited` performs next.
		onDirtyChange?.(false);
		onInvited();
	});

	const isFormLocked = isPending || isSubmitting;

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
						{t('invite-tenant-user-description')}
					</DrawerDescription>
				</DrawerHeader>
				<Form methods={methods} onSubmit={onSubmit}>
					<DrawerBody className="space-y-4">
						<Field.Email
							name="email"
							label={t('email')}
							placeholder={t('email-placeholder')}
							isDisabled={isFormLocked}
							fullWidth
						/>
						<Field.Select
							name="accountLevel"
							label={t('account-level')}
							options={[
								{ value: 'Admin', label: t('admin') },
								{ value: 'User', label: t('user') },
							]}
							isDisabled={isFormLocked}
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
							{t('cancel')}
						</Button>
						<Button type="submit" disabled={isFormLocked}>
							{t('invite-people')}
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
