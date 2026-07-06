import { Button, Card } from '@heroui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { Field, Form } from '~/components/field';
import {
	STAFF_TENANTS_QUERY_KEY,
	useCreateStaffTenantMutation,
} from '~/lib/query/staff-tenants';
import { shouldLogoutForFailure } from '~/routes/authed/layout';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';
import {
	ACCOUNT_LEVEL_ENUM,
	DEFAULT_MAX_USER_PER_TENANT,
} from '@org/shared-ts/lib/constants';

type TenantCreateFormValues = {
	name: string;
	maxUsers: number;
	initialUsers: Array<{
		email: string;
		accountLevel: NewTenantAccountLevel;
	}>;
};

type NewTenantAccountLevel =
	(typeof ACCOUNT_LEVEL_ENUM)[keyof typeof ACCOUNT_LEVEL_ENUM];

const DEFAULT_VALUES: TenantCreateFormValues = {
	name: '',
	maxUsers: DEFAULT_MAX_USER_PER_TENANT,
	initialUsers: [
		{
			email: '',
			accountLevel: ACCOUNT_LEVEL_ENUM.ADMIN,
		},
	],
};

const USER_ROLE_OPTIONS = [
	ACCOUNT_LEVEL_ENUM.ADMIN,
	ACCOUNT_LEVEL_ENUM.USER,
] as const;

const createTenantSchema = z
	.object({
		name: z.string().trim().min(1),
		maxUsers: z.coerce.number().int().min(1),
		initialUsers: z
			.array(
				z.object({
					email: z.string().trim().email(),
					accountLevel: z.enum(USER_ROLE_OPTIONS),
				}),
			)
			.min(1),
	})
	.superRefine((values, context) => {
		if (values.initialUsers.length > values.maxUsers) {
			context.addIssue({
				code: 'custom',
				path: ['initialUsers'],
				message: 'Initial user count cannot exceed max users.',
			});
		}

		const emails = values.initialUsers.map((user) => user.email);
		if (new Set(emails).size !== emails.length) {
			context.addIssue({
				code: 'custom',
				path: ['initialUsers'],
				message: 'Each user email must be unique.',
			});
		}

		const hasAdmin = values.initialUsers.some(
			(user) => user.accountLevel === ACCOUNT_LEVEL_ENUM.ADMIN,
		);
		if (!hasAdmin) {
			context.addIssue({
				code: 'custom',
				path: ['initialUsers'],
				message: 'At least one admin user is required.',
			});
		}
	});

const getUserLevel = (value: string | undefined): NewTenantAccountLevel =>
	value === ACCOUNT_LEVEL_ENUM.USER
		? ACCOUNT_LEVEL_ENUM.USER
		: ACCOUNT_LEVEL_ENUM.ADMIN;

export const Route = createFileRoute('/_authed-layout/staff/tenants/new')({
	component: StaffTenantCreateRoute,
});

function StaffTenantCreateRoute() {
	const navigate = Route.useNavigate();
	const { t } = useTranslation('common');
	const queryClient = useQueryClient();
	const [shouldLogout, setShouldLogout] = useState(false);
	const [serverError, setServerError] = useState('');
	const createTenant = useCreateStaffTenantMutation();

	const methods = useForm<TenantCreateFormValues>({
		resolver: zodResolver(createTenantSchema),
		defaultValues: DEFAULT_VALUES,
	});
	const maxUsers =
		useWatch({ control: methods.control, name: 'maxUsers' }) ?? 0;
	const {
		control,
		formState: { isSubmitting },
	} = methods;
	const { fields, append, remove } = useFieldArray({
		control,
		name: 'initialUsers',
	});

	const onSubmit = methods.handleSubmit(async (values) => {
		setServerError('');

		try {
			const trimmedInitialUsers = values.initialUsers
				.map((user) => ({
					email: user.email.trim(),
					accountLevel: getUserLevel(user.accountLevel),
				}))
				.filter((user) => user.email.length > 0);
			const result = await createTenant.mutateAsync({
				name: values.name.trim(),
				maxUsers: values.maxUsers,
				initialUsers: trimmedInitialUsers,
			});

			const tenantId = result?.id?.toString().trim();
			await queryClient.invalidateQueries({
				queryKey: ['staff', ...STAFF_TENANTS_QUERY_KEY],
			});

			if (tenantId) {
				void navigate({
					to: '/staff/tenants/$tenantId',
					params: {
						tenantId,
					},
				});

				return;
			}

			void navigate({
				to: '/staff/tenants',
			});
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				setShouldLogout(true);
				return;
			}

			setServerError(
				getFailureMessage(toApiFailure(error), {
					fallback: t('tenant-create-failed'),
				}),
			);
		}
	});

	const isPending = isSubmitting || createTenant.isPending;
	const canAddRow = fields.length < Math.max(1, maxUsers);
	const addUserRow = useMemo(() => {
		return () => {
			append({
				email: '',
				accountLevel: USER_ROLE_OPTIONS.includes(ACCOUNT_LEVEL_ENUM.USER)
					? ACCOUNT_LEVEL_ENUM.USER
					: ACCOUNT_LEVEL_ENUM.ADMIN,
			});
		};
	}, [append]);

	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	return (
		<div
			className="mx-auto w-full max-w-4xl space-y-4 p-4"
			data-testid="staff-tenant-create-page"
		>
			<div className="space-y-2">
				<Link
					to="/staff/tenants"
					className="text-sm underline-offset-4 hover:underline"
				>
					{t('back-to-staff-tenants')}
				</Link>
				<h1 className="text-xl font-semibold">
					{t('new-item', { item: t('tenant') })}
				</h1>
				<p className="text-sm text-foreground-500">
					{t('add-an-initial-tenant-user-set')}
				</p>
			</div>

			<Card className="space-y-4 p-4">
				<Form methods={methods} onSubmit={onSubmit}>
					<div className="space-y-2">
						<Field.Text
							name="name"
							label={t('tenant-name')}
							placeholder="Acme Corporation"
							disabled={isPending}
						/>
						<Field.Text
							name="maxUsers"
							type="number"
							label={t('max-users')}
							placeholder={DEFAULT_MAX_USER_PER_TENANT.toString()}
							disabled={isPending}
						/>
					</div>

					<div className="space-y-3">
						<div className="text-sm font-medium">Initial users</div>
						{fields.map((field, index) => (
							<div
								key={field.id}
								className="space-y-2 rounded-medium border border-divider p-3"
							>
								<Field.Text
									name={`initialUsers.${index}.email`}
									label={t('email')}
									placeholder="user@example.com"
									disabled={isPending}
								/>
								<div className="space-y-1">
									<label
										htmlFor={`initialUsers.${index}.accountLevel`}
										className="text-sm text-foreground"
									>
										{t('account-level')}
									</label>
									<select
										id={`initialUsers.${index}.accountLevel`}
										disabled={isPending}
										className="w-full rounded-md border border-divider p-2"
										{...methods.register(`initialUsers.${index}.accountLevel`)}
									>
										{USER_ROLE_OPTIONS.map((option) => (
											<option key={option} value={option}>
												{option}
											</option>
										))}
									</select>
								</div>
								<Button
									type="button"
									variant="outline"
									isDisabled={isPending || fields.length <= 1}
									onPress={() => {
										remove(index);
									}}
								>
									{t('remove')}
								</Button>
							</div>
						))}

						<Button
							type="button"
							variant="outline"
							isDisabled={isPending || !canAddRow}
							onPress={addUserRow}
						>
							{t('add-user')}
						</Button>
					</div>

					{serverError ? (
						<p className="text-sm text-danger-600">{serverError}</p>
					) : null}

					<div className="flex justify-end">
						<Button type="submit" variant="primary" isDisabled={isPending}>
							{t('create-tenant')}
						</Button>
					</div>
				</Form>
			</Card>
		</div>
	);
}
