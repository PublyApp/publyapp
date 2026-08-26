import { Link } from '@tanstack/react-router';
import { PersonAvatar } from '~/components/ui/person-avatar';
import { toStaffTenantUserRows } from '~/lib/query/staff-tenant-users';
import type { useStaffTenantUsersQuery } from '~/lib/query/staff-tenant-users';
import type { StaffTenantDetails } from '~/lib/query/staff-tenants';

export const OwnersCard = ({
	tenant,
	ownersQuery,
	t,
	levelFilter,
}: {
	tenant: StaffTenantDetails;
	ownersQuery: ReturnType<typeof useStaffTenantUsersQuery>;
	t: (key: string) => string;
	levelFilter: string;
}) => {
	const rows = toStaffTenantUserRows(ownersQuery.data?.data).slice(0, 5);

	let rowsContent: React.ReactNode;
	if (ownersQuery.isPending) {
		rowsContent = <p className="px-4 py-4 text-xs text-muted-foreground">…</p>;
	} else if (ownersQuery.isError) {
		rowsContent = (
			<p className="px-4 py-4 text-xs text-muted-foreground">
				{t('tenant-owners-preview-error')}
			</p>
		);
	} else if (rows.length === 0) {
		rowsContent = (
			<p className="px-4 py-4 text-xs text-muted-foreground">
				{t('no-tenant-owners')}
			</p>
		);
	} else {
		rowsContent = (
			<div className="divide-y divide-[color:var(--publy-row-border)]">
				{rows.map((row) => (
					<div
						key={row.id}
						className="flex items-center gap-3 px-[18px] py-[11px]"
					>
						<PersonAvatar name={row.displayName} avatarUrl={row.avatarUrl} />
						<div className="min-w-0 flex-1">
							<p className="truncate text-[13px] font-medium text-foreground">
								{row.displayName}
							</p>
							<p className="truncate text-xs text-muted-foreground">
								{row.email}
							</p>
						</div>
						<span className="publy-detail-chip publy-detail-chip--amber shrink-0">
							{t('owner-chip-label')}
						</span>
					</div>
				))}
			</div>
		);
	}

	return (
		<section className="rounded-[var(--publy-radius-card)] bg-card shadow-[var(--publy-shadow-ring)]">
			<div className="publy-card-header">
				<p className="publy-type-section-title">
					{t('owners')} · {tenant.ownersCount}
				</p>
				<Link
					to="/staff/tenants/$tenantId/users"
					params={{ tenantId: tenant.id }}
					search={{ level: levelFilter }}
					className="text-xs font-medium text-muted-foreground hover:text-foreground"
				>
					{t('see-all')}
				</Link>
			</div>
			<div data-testid="tenant-owners-rows">{rowsContent}</div>
		</section>
	);
};
