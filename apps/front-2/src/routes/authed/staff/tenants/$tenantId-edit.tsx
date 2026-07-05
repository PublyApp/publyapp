import { Button, Card } from '@heroui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
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
	TenantDetailsPageShell,
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
	'/_authed-layout/staff/tenants/$tenantId/edit' as never,
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
		register,
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
				icon="!"
				code="500 — Server Error"
				title="Unable to load this tenant"
				description={getFailureDescription(
					detailsQuery.error,
					'Unable to load tenant details.',
				)}
				testId="staff-tenant-edit-error"
			/>
		);
	}

	if (!tenant) {
		return (
			<AppErrorView
				icon="🔎"
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
		<TenantDetailsPageShell
			tenant={tenant}
			activeSection="basics"
			summary="Update tenant name, logo URL, and max users."
			testId="staff-tenant-edit-page"
		>
			<div className="space-y-4">
				<div className="flex items-center justify-between gap-2">
					<Link
						to={'/staff/tenants/$tenantId' as never}
						params={{ tenantId } as never}
						className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
					>
						{t('back-to-tenant')}
					</Link>
					<h2 className="text-2xl font-semibold text-foreground">
						{t('edit-item', { item: t('tenant') })}
					</h2>
				</div>
				<p className="text-sm text-foreground-500">
					Update tenant basics and metadata supported by the staff tenant update
					API.
				</p>
			</div>

			<Card className="space-y-4 p-5">
				<form className="space-y-4" onSubmit={onSubmit} noValidate>
					<div className="space-y-1">
						<label htmlFor="tenant-name" className="text-sm">
							{t('tenant-name')}
						</label>
						<input
							id="tenant-name"
							type="text"
							className="w-full rounded-medium border border-divider bg-content1 p-2"
							disabled={isPending}
							{...register('name')}
						/>
					</div>

					<div className="space-y-1">
						<label htmlFor="tenant-max-users" className="text-sm">
							{t('max-users')}
						</label>
						<input
							id="tenant-max-users"
							type="number"
							className="w-full rounded-medium border border-divider bg-content1 p-2"
							disabled={isPending}
							{...register('maxUsers')}
						/>
					</div>

					<div className="space-y-1">
						<label htmlFor="tenant-logo-url" className="text-sm">
							{t('logo-url')}
						</label>
						<input
							id="tenant-logo-url"
							type="text"
							className="w-full rounded-medium border border-divider bg-content1 p-2"
							disabled={isPending}
							{...register('logoUrl')}
						/>
					</div>

					{serverError ? (
						<p className="text-sm text-danger-600">{serverError}</p>
					) : null}
					<div className="flex justify-end">
						<Button type="submit" variant="primary" isDisabled={isPending}>
							{t('save-changes')}
						</Button>
					</div>
				</form>
			</Card>
		</TenantDetailsPageShell>
	);
}
