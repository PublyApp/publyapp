import { zodResolver } from '@hookform/resolvers/zod';
import {
	IconAlertCircle,
	IconArrowLeft,
	IconSearchOff,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { Field, Form, FormActionBar, FormPageLayout } from '~/components/field';
import { Button } from '~/components/ui/button';
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
		handleSubmit,
		reset,
	} = methods;
	const isPending = isSubmitting || updateTenant.isPending;

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

	return (
		<FormPageLayout width={860} data-testid="staff-tenant-edit-page">
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
				<section className="flex flex-col gap-4">
					<p className="publy-type-eyebrow">{t('organization')}</p>
					<Field.Text
						name="name"
						label={t('tenant-name')}
						fullWidth
						isDisabled={isPending}
					/>
					<div className="grid grid-cols-[1fr_128px] items-start gap-3">
						<Field.Text
							name="logoUrl"
							label={t('logo-url')}
							isDisabled={isPending}
						/>
						<Field.Text
							name="maxUsers"
							type="number"
							min={1}
							label={t('seats')}
							isDisabled={isPending}
						/>
					</div>
				</section>

				{serverError ? (
					<p className="text-sm text-destructive">{serverError}</p>
				) : null}

				<FormActionBar>
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
