import { zodResolver } from '@hookform/resolvers/zod';
import {
	IconAlertCircle,
	IconArrowLeft,
	IconSearchOff,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { Field, Form, FormActionBar, FormPageLayout } from '~/components/field';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { BrandTile } from '~/components/ui/initials-avatar';
import { StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
import {
	STAFF_TENANT_DETAILS_QUERY_KEY,
	STAFF_TENANTS_QUERY_KEY,
	toStaffTenantDetails,
	useStaffTenantDetailsQuery,
	useUpdateStaffTenantMutation,
} from '~/lib/query/staff-tenants';
import { shouldLogoutForFailure } from '~/routes/authed/layout';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';

import {
	TenantDetailsLoading,
	TenantRetryActions,
} from './$tenantId/_tenant-details-shell';

const editTenantSchema = z.object({
	name: z.string().trim().min(1).max(128).optional(),
	maxUsers: z.coerce.number().int().positive(),
	logoUrl: z.string().trim().max(2048).optional(),
});

type EditTenantFormValues = z.infer<typeof editTenantSchema>;

type EditTenantPayload = {
	tenantId: string;
	name?: string;
	maxUsers?: number;
	logoUrl?: string | null;
};

const normalizeOptionalUpdateString = (
	value: string | undefined,
): string | null | undefined => {
	const trimmed = value?.trim();
	if (trimmed === undefined) {
		return undefined;
	}

	return trimmed.length > 0 ? trimmed : null;
};

const getFailureDescription = (error: unknown, fallback: string): string => {
	const failure = toApiFailure(error);

	if (failure.kind === 'problem' && failure.detail) {
		return failure.detail;
	}

	return fallback;
};

/** Read-only twin of the create form's SlugField: same bordered container and
 * `publyapp.com/` prefix, but the slug is server-assigned and immutable. */
const ReadOnlySlugField = ({
	code,
	label,
	hint,
}: {
	code: string;
	label: string;
	hint: string;
}) => (
	<div className="space-y-1.5">
		<span className="flex items-center gap-2 text-[13px] leading-none font-medium">
			{label}
		</span>
		<div className="flex h-9 items-center gap-0 rounded-[var(--publy-radius-input)] border border-border bg-input/35 px-3.5 opacity-70 shadow-[var(--publy-shadow-input)]">
			<span className="shrink-0 font-mono text-[13px] text-muted-foreground">
				publyapp.com/
			</span>
			<span
				className="min-w-0 flex-1 truncate font-mono text-[13px]"
				data-testid="edit-tenant-slug"
			>
				{code}
			</span>
		</div>
		<p data-slot="field-helper" className="publy-field-helper">
			{hint}
		</p>
	</div>
);

export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/edit',
)({
	component: StaffTenantEditRoute,
});

function StaffTenantEditRoute() {
	const { tenantId } = Route.useParams() as { tenantId: string };
	const { t } = useTranslation('common');
	const navigate = Route.useNavigate();
	const queryClient = useQueryClient();
	const [shouldLogout, setShouldLogout] = useState(false);
	const [serverError, setServerError] = useState('');
	const detailsQuery = useStaffTenantDetailsQuery(
		{ tenantId },
		{ enabled: tenantId.length > 0 },
	);
	const updateTenant = useUpdateStaffTenantMutation();
	const tenant = toStaffTenantDetails(detailsQuery.data);
	const tenantFormValues = useMemo(
		() =>
			tenant === null
				? null
				: {
						name: tenant.name,
						maxUsers: tenant.maxUsers,
						logoUrl: tenant.logoUrl ?? '',
					},
		[tenant?.id, tenant?.name, tenant?.maxUsers, tenant?.logoUrl],
	);

	const methods = useForm<EditTenantFormValues>({
		resolver: zodResolver(editTenantSchema),
		defaultValues: {
			name: '',
			maxUsers: 1,
			logoUrl: '',
		},
	});
	const {
		formState: { dirtyFields, isDirty, isSubmitting },
		control,
		handleSubmit,
		reset,
	} = methods;
	const isPending = isSubmitting || updateTenant.isPending;
	const watchedName = useWatch({ control, name: 'name' }) ?? '';
	const watchedMaxUsers = useWatch({ control, name: 'maxUsers' });
	const watchedLogoUrl = useWatch({ control, name: 'logoUrl' }) ?? '';

	useEffect(() => {
		if (tenantFormValues === null) {
			return;
		}

		reset(tenantFormValues);
	}, [reset, tenantFormValues]);

	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	if (detailsQuery.isPending) {
		return <TenantDetailsLoading />;
	}

	if (detailsQuery.isError) {
		if (shouldLogoutForFailure(detailsQuery.error)) {
			return <LogoutRedirect />;
		}

		return (
			<AppErrorView
				icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
				code="500 — Server Error"
				title="Unable to load this tenant"
				description={getFailureDescription(
					detailsQuery.error,
					'Unable to load tenant details.',
				)}
				testId="staff-tenant-edit-error"
				actions={
					<TenantRetryActions onRetry={() => void detailsQuery.refetch()} />
				}
			/>
		);
	}

	if (!tenant) {
		return (
			<AppErrorView
				icon={<IconSearchOff aria-hidden="true" className="size-7" />}
				code="404 — Not Found"
				title="Tenant not found"
				description="The tenant payload was empty."
				testId="staff-tenant-edit-not-found"
			/>
		);
	}

	const onSubmit = handleSubmit(async (values) => {
		if (!isDirty) {
			return;
		}

		setServerError('');
		const payload: EditTenantPayload = { tenantId };

		if (dirtyFields.name && values.name !== undefined) {
			const name = values.name.trim();
			if (name.length > 0) {
				payload.name = name;
			}
		}

		if (dirtyFields.maxUsers) {
			payload.maxUsers = values.maxUsers;
		}

		if (dirtyFields.logoUrl) {
			payload.logoUrl = normalizeOptionalUpdateString(values.logoUrl);
		}

		try {
			await updateTenant.mutateAsync(payload);
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: ['staff', ...STAFF_TENANTS_QUERY_KEY],
				}),
				queryClient.invalidateQueries({
					queryKey: ['staff', ...STAFF_TENANT_DETAILS_QUERY_KEY],
				}),
			]);
			void navigate({
				to: '/staff/tenants/$tenantId' as never,
				params: { tenantId },
			} as never);
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				setShouldLogout(true);
				return;
			}

			setServerError(
				getFailureMessage(toApiFailure(error), {
					fallback: t('tenant-update-failed'),
				}),
			);
		}
	});

	const previewName = watchedName.trim().length > 0 ? watchedName : tenant.name;
	const previewMaxUsers =
		typeof watchedMaxUsers === 'number' && Number.isFinite(watchedMaxUsers)
			? watchedMaxUsers
			: tenant.maxUsers;
	const previewLogoUrl =
		watchedLogoUrl.trim().length > 0 ? watchedLogoUrl.trim() : null;

	return (
		<FormPageLayout width={960} data-testid="staff-tenant-edit-page">
			<div className="space-y-2">
				<Link
					to={'/staff/tenants/$tenantId' as never}
					params={{ tenantId } as never}
					className="publy-back-link"
				>
					<IconArrowLeft aria-hidden="true" className="size-3" />
					{t('back-to-tenant')}
				</Link>
				<h1 className="text-xl font-semibold tracking-[-0.01em]">
					{t('edit-item', { item: t('tenant') })}
				</h1>
				<p className="text-sm text-muted-foreground">
					{t('edit-tenant-description')}
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
								fullWidth
								isDisabled={isPending}
							/>
							<div className="grid grid-cols-[1fr_128px] items-start gap-3">
								<ReadOnlySlugField
									code={tenant.code ?? '—'}
									label={t('workspace-slug')}
									hint={t('workspace-slug-immutable-hint')}
								/>
								<Field.Text
									name="maxUsers"
									type="number"
									min={1}
									label={t('seats')}
									isDisabled={isPending}
								/>
							</div>
							<Field.Text
								name="logoUrl"
								label={t('logo-url')}
								fullWidth
								isDisabled={isPending}
							/>
						</section>
					</div>

					<aside className="order-1 lg:order-2">
						<Card
							className="gap-0 py-0 lg:sticky lg:top-5"
							data-testid="staff-tenant-edit-preview"
						>
							<div className="publy-card-header">
								<span className="publy-type-eyebrow">{t('preview')}</span>
							</div>

							<div className="flex items-center gap-3 px-[18px] py-4">
								<BrandTile
									name={previewName}
									logoUrl={previewLogoUrl}
									className="size-11 rounded-[12px] text-base"
								/>
								<div className="min-w-0">
									<p className="truncate text-[15px] font-semibold text-foreground">
										{previewName}
									</p>
									<p className="publy-tenant-identity-meta">
										<span className="publy-tenant-identity-meta-prefix">
											publyapp.com/
										</span>
										<span>{tenant.code ?? '—'}</span>
									</p>
								</div>
							</div>

							<div className="mx-[18px] h-px bg-(--publy-row-border)" />

							<div className="flex flex-col divide-y divide-(--publy-row-border) px-[18px]">
								<div className="flex items-center justify-between py-2.5 text-[13px]">
									<span className="text-muted-foreground">{t('status')}</span>
									<StatusPill tone={statusPillTone(tenant.status)}>
										{tenant.status ?? t('unknown')}
									</StatusPill>
								</div>
								<div className="flex items-center justify-between py-2.5 text-[13px]">
									<span className="text-muted-foreground">{t('seats')}</span>
									<span
										className="font-medium text-foreground"
										data-testid="edit-preview-seats"
									>
										{tenant.usersCount} / {previewMaxUsers}
									</span>
								</div>
								<div className="flex items-center justify-between py-2.5 text-[13px]">
									<span className="text-muted-foreground">{t('owners')}</span>
									<span
										className="font-medium text-foreground"
										data-testid="edit-preview-owners"
									>
										{tenant.ownersCount}
									</span>
								</div>
								<div className="flex items-center justify-between py-2.5 text-[13px]">
									<span className="text-muted-foreground">{t('members')}</span>
									<span
										className="font-medium text-foreground"
										data-testid="edit-preview-members"
									>
										{tenant.usersCount}
									</span>
								</div>
							</div>
						</Card>
					</aside>
				</div>

				{serverError ? (
					<p className="text-sm text-destructive">{serverError}</p>
				) : null}

				<FormActionBar
					status={
						isDirty ? (
							<span data-testid="edit-tenant-dirty-hint">
								{t('unsaved-changes')}
							</span>
						) : undefined
					}
				>
					<Button
						type="button"
						variant="ghost"
						disabled={isPending}
						onClick={() => {
							void navigate({
								to: '/staff/tenants/$tenantId' as never,
								params: { tenantId } as never,
							} as never);
						}}
					>
						{t('cancel')}
					</Button>
					<Button type="submit" disabled={isPending}>
						{t('save-changes')}
					</Button>
				</FormActionBar>
			</Form>
		</FormPageLayout>
	);
}
