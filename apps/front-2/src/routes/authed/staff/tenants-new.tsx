import { zodResolver } from '@hookform/resolvers/zod';
import {
	IconArrowLeft,
	IconCircle,
	IconCircleCheckFilled,
	IconPlus,
	IconX,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { Field, Form, FormActionBar, FormPageLayout } from '~/components/field';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { BrandTile } from '~/components/ui/initials-avatar';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from '~/components/ui/select';
import {
	STAFF_TENANTS_QUERY_KEY,
	useCreateStaffTenantMutation,
} from '~/lib/query/staff-tenants';
import { cn } from '~/lib/utils';
import { shouldLogoutForFailure } from '~/routes/authed/layout';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';
import {
	ACCOUNT_LEVEL_ENUM,
	DEFAULT_MAX_USER_PER_TENANT,
} from '@org/shared-ts/lib/constants';

type NewTenantAccountLevel =
	(typeof ACCOUNT_LEVEL_ENUM)[keyof typeof ACCOUNT_LEVEL_ENUM];

type TenantCreateFormValues = {
	name: string;
	maxUsers: number;
	initialUsers: Array<{
		email: string;
		accountLevel: NewTenantAccountLevel;
	}>;
};

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

/**
 * Name length mirrors the backend rule (`MustBeRequiredStringWithLength`,
 * min 5) so the client never accepts a name the server will reject.
 */
const buildCreateTenantSchema = (t: (key: string) => string) =>
	z
		.object({
			name: z.string().trim().min(5),
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
					message: t('max-users-reached'),
				});
			}

			const emails = values.initialUsers.map((user) => user.email);
			if (new Set(emails).size !== emails.length) {
				context.addIssue({
					code: 'custom',
					path: ['initialUsers'],
					message: t('each-user-must-have-a-unique-email'),
				});
			}

			const hasAdmin = values.initialUsers.some(
				(user) => user.accountLevel === ACCOUNT_LEVEL_ENUM.ADMIN,
			);
			if (!hasAdmin) {
				context.addIssue({
					code: 'custom',
					path: ['initialUsers'],
					message: t('tenant-should-have-at-least-one-admin'),
				});
			}
		});

const getUserLevel = (value: string | undefined): NewTenantAccountLevel =>
	value === ACCOUNT_LEVEL_ENUM.USER
		? ACCOUNT_LEVEL_ENUM.USER
		: ACCOUNT_LEVEL_ENUM.ADMIN;

/** Compact select styled as the honesty-override "Admin → amber, User →
 * neutral" chip (reuses the same tone classes as the Users-tab role chip). */
const MemberLevelSelect = ({
	name,
	value,
	onChange,
	onBlur,
	disabled,
	ariaLabel,
	t,
}: {
	name: string;
	value: NewTenantAccountLevel;
	onChange: (value: NewTenantAccountLevel) => void;
	onBlur: () => void;
	disabled?: boolean;
	ariaLabel: string;
	t: (key: string) => string;
}) => (
	<Select
		id={name}
		aria-label={ariaLabel}
		value={value}
		onValueChange={(nextValue) => {
			if (typeof nextValue === 'string') {
				onChange(getUserLevel(nextValue));
			}
		}}
		disabled={disabled}
	>
		<SelectTrigger
			onBlur={onBlur}
			size="sm"
			className={cn(
				'w-full justify-center gap-1 border px-2 text-[11px] font-medium shadow-none',
				value === ACCOUNT_LEVEL_ENUM.ADMIN
					? 'border-(--publy-chip-pending-border) bg-(--publy-chip-pending-bg) text-(--publy-chip-pending-text)'
					: 'border-border bg-background text-foreground',
			)}
		>
			<span data-slot="select-value">
				{value === ACCOUNT_LEVEL_ENUM.ADMIN ? t('admin') : t('user')}
			</span>
		</SelectTrigger>
		<SelectContent>
			{USER_ROLE_OPTIONS.map((option) => (
				<SelectItem key={option} value={option}>
					{option === ACCOUNT_LEVEL_ENUM.ADMIN ? t('admin') : t('user')}
				</SelectItem>
			))}
		</SelectContent>
	</Select>
);

const ChecklistRow = ({
	checked,
	tone = 'default',
	children,
	testId,
}: {
	checked: boolean;
	tone?: 'default' | 'warning';
	children: ReactNode;
	testId: string;
}) => (
	<li
		className="flex items-start gap-2 text-xs"
		data-testid={testId}
		data-checked={checked}
	>
		{checked ? (
			<IconCircleCheckFilled
				aria-hidden="true"
				className="mt-px size-3.5 shrink-0 text-(--publy-success)"
			/>
		) : (
			<IconCircle
				aria-hidden="true"
				className={cn(
					'mt-px size-3.5 shrink-0',
					tone === 'warning'
						? 'text-(--publy-danger)'
						: 'text-muted-foreground',
				)}
			/>
		)}
		<span
			className={tone === 'warning' && !checked ? 'text-(--publy-danger)' : ''}
		>
			{children}
		</span>
	</li>
);

export const Route = createFileRoute('/_authed-layout/staff/tenants/new')({
	component: StaffTenantCreateRoute,
});

function StaffTenantCreateRoute() {
	const navigate = Route.useNavigate();
	const { t, i18n } = useTranslation('common');
	const queryClient = useQueryClient();
	const [shouldLogout, setShouldLogout] = useState(false);
	const [serverError, setServerError] = useState('');
	const createTenant = useCreateStaffTenantMutation();

	const resolver = useMemo(
		() => zodResolver(buildCreateTenantSchema(t)),
		// eslint-disable-next-line react-hooks/exhaustive-deps -- rebuild on language change so messages stay localized
		[i18n.language],
	);

	const methods = useForm<TenantCreateFormValues>({
		resolver,
		defaultValues: DEFAULT_VALUES,
	});
	const {
		control,
		formState: { isSubmitting, errors },
	} = methods;
	const name = useWatch({ control, name: 'name' }) ?? '';
	const maxUsers = useWatch({ control, name: 'maxUsers' }) ?? 0;
	const initialUsers =
		useWatch({ control, name: 'initialUsers' }) ?? DEFAULT_VALUES.initialUsers;
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
	const addMemberRow = useMemo(() => {
		return () => {
			append({
				email: '',
				accountLevel: ACCOUNT_LEVEL_ENUM.USER,
			});
		};
	}, [append]);

	const filledMembers = initialUsers.filter(
		(user) => user.email.trim().length > 0,
	);
	const adminsCount = filledMembers.filter(
		(user) => user.accountLevel === ACCOUNT_LEVEL_ENUM.ADMIN,
	).length;
	const membersCount = filledMembers.length - adminsCount;
	const hasAdmin = adminsCount >= 1;

	const initialUsersError = errors.initialUsers as
		| { message?: string; root?: { message?: string } }
		| undefined;
	const arrayLevelError =
		initialUsersError?.root?.message ?? initialUsersError?.message;

	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	return (
		<FormPageLayout width={960} data-testid="staff-tenant-create-page">
			<div className="space-y-2">
				<Link to="/staff/tenants" className="publy-back-link">
					<IconArrowLeft aria-hidden="true" className="size-3" />
					{t('back-to-staff-tenants')}
				</Link>
				<h1 className="text-xl font-semibold tracking-[-0.01em]">
					{t('create-tenant')}
				</h1>
				<p className="text-sm text-muted-foreground">
					{t('create-tenant-description')}
				</p>
			</div>

			<Form methods={methods} onSubmit={onSubmit}>
				<div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px] lg:gap-9">
					<div className="order-2 flex min-w-0 flex-col gap-8 lg:order-1">
						<section className="flex flex-col gap-4">
							<p className="publy-type-eyebrow">{t('organization')}</p>
							<Field.Text
								name="name"
								label={t('organization-name')}
								placeholder="Acme Corporation"
								fullWidth
								isDisabled={isPending}
							/>
							<div className="max-w-[160px]">
								<Field.Text
									name="maxUsers"
									type="number"
									min={1}
									label={t('seats')}
									isDisabled={isPending}
								/>
							</div>
						</section>

						<section className="flex flex-col gap-4">
							<div className="flex flex-wrap items-center justify-between gap-2">
								<p className="publy-type-eyebrow">{t('members')}</p>
								<p className="publy-type-helper">{t('members-hint')}</p>
							</div>

							<div className="flex flex-col gap-3">
								{fields.map((field, index) => (
									<div
										key={field.id}
										className="grid grid-cols-[1fr_96px_32px] items-center gap-2"
									>
										<Field.Email
											name={`initialUsers.${index}.email`}
											label={t('email')}
											placeholder="user@example.com"
											isDisabled={isPending}
										/>
										<Controller
											control={control}
											name={`initialUsers.${index}.accountLevel`}
											render={({ field: levelField }) => (
												<MemberLevelSelect
													name={`initialUsers.${index}.accountLevel`}
													value={getUserLevel(levelField.value)}
													onChange={levelField.onChange}
													onBlur={levelField.onBlur}
													disabled={isPending}
													ariaLabel={t('account-level')}
													t={t}
												/>
											)}
										/>
										<Button
											type="button"
											variant="ghost"
											size="icon-sm"
											disabled={isPending || fields.length <= 1}
											onClick={() => {
												remove(index);
											}}
											aria-label={t('remove-member')}
										>
											<IconX aria-hidden="true" className="size-4" />
										</Button>
									</div>
								))}
							</div>

							{arrayLevelError ? (
								<p className="publy-field-error">{arrayLevelError}</p>
							) : null}

							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={isPending || !canAddRow}
								onClick={addMemberRow}
								className="w-fit border-dashed border-(--publy-border-strong) bg-transparent"
							>
								<IconPlus aria-hidden="true" className="size-3.5" />
								{t('add-member')}
							</Button>
						</section>
					</div>

					<aside className="order-1 lg:order-2">
						<Card
							className="gap-0 py-0 lg:sticky lg:top-5"
							data-testid="staff-tenant-create-preview"
						>
							<div className="publy-card-header">
								<span className="publy-type-eyebrow">{t('preview')}</span>
							</div>

							<div className="flex items-center gap-3 px-[18px] py-4">
								<BrandTile
									name={name || t('untitled-organization')}
									className="size-11 rounded-[12px] text-base"
								/>
								<div className="min-w-0">
									<p className="truncate text-[15px] font-semibold text-foreground">
										{name.trim().length > 0 ? name : t('untitled-organization')}
									</p>
									<p className="publy-tenant-identity-meta">
										<span className="publy-tenant-identity-meta-prefix">
											publyapp.com/
										</span>
										<span className="italic">
											{t('assigned-after-creation')}
										</span>
									</p>
								</div>
							</div>

							<div className="mx-[18px] h-px bg-(--publy-row-border)" />

							<div className="flex flex-col divide-y divide-(--publy-row-border) px-[18px]">
								<div className="flex items-center justify-between py-2.5 text-[13px]">
									<span className="text-muted-foreground">{t('seats')}</span>
									<span
										className="font-medium text-foreground"
										data-testid="preview-seats"
									>
										{filledMembers.length} / {maxUsers}
									</span>
								</div>
								<div className="flex items-center justify-between py-2.5 text-[13px]">
									<span className="text-muted-foreground">{t('admins')}</span>
									<span
										className="font-medium text-foreground"
										data-testid="preview-admins"
									>
										{adminsCount}
									</span>
								</div>
								<div className="flex items-center justify-between py-2.5 text-[13px]">
									<span className="text-muted-foreground">{t('members')}</span>
									<span
										className="font-medium text-foreground"
										data-testid="preview-members"
									>
										{membersCount}
									</span>
								</div>
							</div>

							<div className="mx-[18px] h-px bg-(--publy-row-border)" />

							<ul className="flex flex-col gap-2 px-[18px] py-4">
								<ChecklistRow
									checked={hasAdmin}
									testId="preview-checklist-admins"
								>
									{t('preview-admins-checklist', { count: adminsCount })}
								</ChecklistRow>
								<ChecklistRow
									checked={filledMembers.length > 0}
									testId="preview-checklist-members"
								>
									{t('preview-members-checklist', { count: membersCount })}
								</ChecklistRow>
								{!hasAdmin ? (
									<ChecklistRow
										checked={false}
										tone="warning"
										testId="preview-checklist-warning"
									>
										{t('tenant-should-have-at-least-one-admin')}
									</ChecklistRow>
								) : null}
							</ul>
						</Card>
					</aside>
				</div>

				{serverError ? (
					<p className="text-sm text-destructive">{serverError}</p>
				) : null}

				<FormActionBar
					status={
						<span data-testid="create-tenant-summary">
							{t('create-tenant-summary', {
								admins: adminsCount,
								members: membersCount,
							})}
						</span>
					}
				>
					<Button
						type="button"
						variant="ghost"
						disabled={isPending}
						onClick={() => {
							void navigate({ to: '/staff/tenants' });
						}}
					>
						{t('cancel')}
					</Button>
					<Button type="submit" disabled={isPending}>
						{t('create-tenant')}
					</Button>
				</FormActionBar>
			</Form>
		</FormPageLayout>
	);
}
