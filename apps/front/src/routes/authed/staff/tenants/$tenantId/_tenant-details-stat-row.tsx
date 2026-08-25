import {
	IconClock,
	IconKey,
	IconMail,
	IconShield,
	IconUsers,
} from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { AvatarStack } from '~/components/ui/initials-avatar';
import { StatusPill } from '~/components/ui/product-page';
import { StatCard } from '~/components/ui/stat-card';
import {
	toStaffTenantUserRows,
	useStaffTenantUsersQuery,
} from '~/lib/query/staff-tenant-users';
import type { StaffTenantDetails } from '~/lib/query/staff-tenants';

/** The four headline stat cards of the tenant "basics" section. Split out of
 * the route file for `react-doctor/no-giant-component`; markup, test ids and
 * i18n keys are unchanged. */
export const TenantDetailsStatRow = ({
	tenant,
	ownersQuery,
	t,
}: {
	tenant: StaffTenantDetails;
	ownersQuery: ReturnType<typeof useStaffTenantUsersQuery>;
	t: (key: string, options?: Record<string, unknown>) => string;
}) => {
	const seatsLeft = Math.max(tenant.maxUsers - tenant.usersCount, 0);
	const meterPercent =
		tenant.maxUsers > 0
			? Math.min((tenant.usersCount / tenant.maxUsers) * 100, 100)
			: 0;
	const ownerPeople = toStaffTenantUserRows(ownersQuery.data?.data)
		.slice(0, 5)
		.map((row) => ({
			id: row.id,
			name: row.displayName,
			avatarUrl: row.avatarUrl,
		}));
	const hasExpiringSoonInvitations = tenant.expiringSoonInvitationsCount > 0;

	return (
		<div className="publy-stat-row">
			<StatCard
				testId="tenant-stat-members"
				label={t('members')}
				icon={<IconUsers aria-hidden="true" className="size-[14px]" />}
				secondary={
					<>
						<div className="publy-stat-meter">
							<div
								className="publy-stat-meter-fill"
								style={{ width: `${meterPercent}%` }}
							/>
						</div>
						<span>{t('seats-left', { count: seatsLeft })}</span>
					</>
				}
			>
				{tenant.usersCount}
				<span className="publy-stat-card-value-suffix">
					{' '}
					/ {tenant.maxUsers}
				</span>
			</StatCard>

			<StatCard
				testId="tenant-stat-owners"
				label={t('owners')}
				icon={<IconKey aria-hidden="true" className="size-[14px]" />}
				secondary={<AvatarStack people={ownerPeople} />}
			>
				{tenant.ownersCount}
			</StatCard>

			<StatCard
				testId="tenant-stat-invites"
				label={t('pending-invites')}
				icon={<IconMail aria-hidden="true" className="size-[14px]" />}
				secondary={
					hasExpiringSoonInvitations ? (
						<>
							<StatusPill tone="warning">
								<IconClock aria-hidden="true" className="size-3" />
								{tenant.expiringSoonInvitationsCount}
							</StatusPill>
							<span>{t('expire-soon')}</span>
						</>
					) : (
						<span>{t('no-invites-expiring-soon')}</span>
					)
				}
			>
				{tenant.pendingInvitationsCount}
			</StatCard>

			<StatCard
				testId="tenant-stat-profiles"
				label={t('profiles')}
				icon={<IconShield aria-hidden="true" className="size-[14px]" />}
				secondary={
					<Link
						to="/staff/tenants/$tenantId/profiles"
						params={{ tenantId: tenant.id }}
						className="publy-stat-card-link"
					>
						{t('view-profiles')}
					</Link>
				}
			>
				{tenant.profilesCount}
			</StatCard>
		</div>
	);
};
