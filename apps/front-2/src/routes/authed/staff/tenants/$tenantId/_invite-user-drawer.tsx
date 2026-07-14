import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Field, Form } from '~/components/field';
import { Button } from '~/components/ui/button';
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
import { shouldLogoutForFailure } from '~/routes/authed/layout';

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
}: {
	tenantId: string;
	isOpen: boolean;
	onOpenChange: (isOpen: boolean) => void;
	onInvited: () => void;
	onSessionExpired: () => void;
}) => {
	const { t } = useTranslation('common');
	const queryClient = useQueryClient();
	const { mutateAsync, isPending } = useInviteTenantUserMutation();
	const [serverErrors, setServerErrors] = useState<string[]>([]);
	const methods = useForm<InviteTenantUserFormValues>({
		resolver: zodResolver(buildInviteUserSchema(t)),
		defaultValues: DEFAULT_VALUES,
	});
	const { reset, formState } = methods;

	useEffect(() => {
		if (isOpen) {
			setServerErrors([]);
			reset(DEFAULT_VALUES);
		}
	}, [isOpen, reset]);

	const invalidateTenantData = () =>
		invalidateAllStaffTenantScopes(queryClient);

	const onSubmit = methods.handleSubmit(async (values) => {
		setServerErrors([]);

		try {
			await mutateAsync({
				tenantId,
				email: values.email,
				accountLevel: values.accountLevel,
			});
			await invalidateTenantData();
			onInvited();
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				onSessionExpired();
				return;
			}

			const failure = toApiFailure(error);
			if (failure.kind === 'validation') {
				const messages = Object.values(failure.fieldErrors).flat();
				setServerErrors(
					messages.length > 0
						? messages
						: [
								getFailureMessage(failure, {
									fallback: t('invite-tenant-user-failed'),
								}),
							],
				);
				return;
			}

			setServerErrors([
				getFailureMessage(failure, {
					fallback: t('invite-tenant-user-failed'),
				}),
			]);
		}
	});

	const isFormLocked = isPending || formState.isSubmitting;

	return (
		<Drawer
			open={isOpen}
			onOpenChange={(open) => {
				if (!isFormLocked) {
					onOpenChange(open);
				}
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
							placeholder="name@company.com"
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
							onClick={() => onOpenChange(false)}
						>
							{t('cancel')}
						</Button>
						<Button type="submit" disabled={isFormLocked}>
							{t('invite-people')}
						</Button>
					</DrawerFooter>
				</Form>
			</DrawerContent>
		</Drawer>
	);
};
