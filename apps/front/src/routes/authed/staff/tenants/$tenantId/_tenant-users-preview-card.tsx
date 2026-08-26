import { Link } from '@tanstack/react-router';
import { PersonAvatar } from '~/components/ui/person-avatar';
import { StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
import {
	toStaffTenantUserRows,
	useStaffTenantUsersQuery,
} from '~/lib/query/staff-tenant-users';
import type { StaffTenantDetails } from '~/lib/query/staff-tenants';
import {
	formatTenantUserLevelLabel,
	formatTenantUserStatusLabel,
} from '~/routes/authed/staff/tenants/$tenantId/_tenant-details-shell';

export const UsersPreviewCard = ({
	tenant,
	t,
}: {
	tenant: StaffTenantDetails;
	t: (key: string) => string;
}) => {
	const usersQuery = useStaffTenantUsersQuery({
		tenantId: tenant.id,
		size: 5,
		sortId: 'created_at',
		sortOrder: 'desc',
	});
	const rows = toStaffTenantUserRows(usersQuery.data?.data);

	const renderBody = () => {
		if (usersQuery.isPending) {
			return <p className="px-4 py-4 text-xs text-muted-foreground">…</p>;
		}

		if (usersQuery.isError) {
			return (
				<p className="px-4 py-4 text-xs text-muted-foreground">
					{t('tenant-users-preview-error')}
				</p>
			);
		}

		if (rows.length === 0) {
			return (
				<p className="px-4 py-4 text-xs text-muted-foreground">
					{t('no-tenant-members')}
				</p>
			);
		}

		return (
			<div className="divide-y divide-[color:var(--publy-row-border)]">
				{rows.map((row) => (
					<div key={row.id} className="flex items-center gap-3 px-4 py-2.5">
						<PersonAvatar
							name={row.displayName}
							avatarUrl={row.avatarUrl}
							size="sm"
						/>
						<div className="min-w-0 flex-1">
							<p className="truncate text-[13px] font-medium text-foreground">
								{row.displayName}
							</p>
							<p className="truncate text-xs text-muted-foreground">
								{row.email}
							</p>
						</div>
						<StatusPill tone="neutral">
							{formatTenantUserLevelLabel(row.level, t)}
						</StatusPill>
						<StatusPill tone={statusPillTone(row.status)}>
							{formatTenantUserStatusLabel(row.status, t)}
						</StatusPill>
					</div>
				))}
			</div>
		);
	};

	return (
		<section className="rounded-[var(--publy-radius-card)] bg-card shadow-[var(--publy-shadow-ring)]">
			<div className="publy-card-header">
				<p className="publy-type-section-title">
					{t('users')} · {tenant.usersCount}
				</p>
				<Link
					to="/staff/tenants/$tenantId/users"
					params={{ tenantId: tenant.id }}
					className="text-xs font-medium text-muted-foreground hover:text-foreground"
				>
					{t('view-all')}
				</Link>
			</div>
			<div data-testid="tenant-users-preview-rows">{renderBody()}</div>
		</section>
	);
};
