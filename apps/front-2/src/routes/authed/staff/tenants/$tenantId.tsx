import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import {
	toStaffTenantDetails,
	useStaffTenantDetailsQuery,
} from '~/lib/query/staff-tenants';
import { shouldLogoutForFailure } from '~/routes/authed/layout';

import {
	DetailItem,
	formatDateTime,
	TenantDetailsError,
	TenantDetailsLoading,
	TenantDetailsPageShell,
} from './$tenantId/_tenant-details-shell';

export const Route = createFileRoute('/_authed-layout/staff/tenants/$tenantId')(
	{
		component: StaffTenantDetailsPage,
	},
);

function StaffTenantDetailsPage() {
	const { tenantId } = Route.useParams();
	const { i18n } = useTranslation('common');
	const query = useStaffTenantDetailsQuery(
		{ tenantId },
		{ enabled: tenantId.length > 0 },
	);

	if (query.isPending) {
		return <TenantDetailsLoading />;
	}

	if (query.isError) {
		if (shouldLogoutForFailure(query.error)) {
			return <LogoutRedirect />;
		}

		return <TenantDetailsError error={query.error} />;
	}

	const tenant = toStaffTenantDetails(query.data);
	if (!tenant) {
		return (
			<AppErrorView
				icon="!"
				code="500 — Server Error"
				title="Unable to load this tenant"
				description="The tenant response was incomplete."
				testId="staff-tenant-details-error"
			/>
		);
	}

	return (
		<TenantDetailsPageShell
			tenant={tenant}
			activeSection="basics"
			summary="Read-only basics for this tenant in the front-2 migration shell."
			testId="staff-tenant-details-page"
		>
			<div className="space-y-2">
				<h2 className="text-lg font-semibold text-foreground">Basics</h2>
				<p className="text-sm text-foreground-500">
					Core tenant metadata carried forward from the current staff details
					shell.
				</p>
			</div>

			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
				<DetailItem label="Code" value={tenant.code ?? '—'} />
				<DetailItem label="Status" value={tenant.status ?? '—'} />
				<DetailItem label="Users count" value={String(tenant.usersCount)} />
				<DetailItem label="Max users" value={String(tenant.maxUsers)} />
				<DetailItem
					label="Created at"
					value={formatDateTime(tenant.createdAt, i18n.language)}
				/>
				<DetailItem
					label="Updated at"
					value={formatDateTime(tenant.updatedAt, i18n.language)}
				/>
				{tenant.logoUrl ? (
					<DetailItem label="Logo URL" value={tenant.logoUrl} />
				) : null}
			</div>
		</TenantDetailsPageShell>
	);
}
