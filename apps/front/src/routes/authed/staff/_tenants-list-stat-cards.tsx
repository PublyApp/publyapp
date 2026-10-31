import {
	IconBuilding,
	IconChartPie,
	IconMail,
	IconUsersGroup,
} from '@tabler/icons-react';
import { StatCard } from '~/components/ui/stat-card';
import type { StaffTenantRow } from '~/lib/query/staff-tenants';

import { occupancyBand } from './_tenants-list-model';

const Dash = () => <span className="text-muted-foreground">—</span>;

/**
 * The four StatCards above the organisations list (§4.2). Every figure is
 * computed from the loaded rows; a value the list API does not provide
 * ("Invitations en attente") is an em dash, never a silent 0.
 */
export const TenantStatCards = ({
	rows,
	t,
}: {
	rows: StaffTenantRow[];
	t: (key: string, options?: Record<string, unknown>) => string;
}) => {
	let members = 0;
	let seats = 0;
	let active = 0;
	let pending = 0;
	let suspended = 0;
	let almostFull = 0;
	let full = 0;

	for (const row of rows) {
		members += row.usersCount;
		seats += row.maxUsers;
		const band = occupancyBand(row);
		if (band === 'high' || band === 'full') {
			almostFull += 1;
		}
		if (band === 'full') {
			full += 1;
		}
		const status = row.status?.trim().toLowerCase();
		if (status === 'active') {
			active += 1;
		} else if (status === 'pending') {
			pending += 1;
		} else if (status === 'suspended') {
			suspended += 1;
		}
	}

	const seatsShare = seats > 0 ? Math.round((members / seats) * 100) : null;

	return (
		<>
			<StatCard
				testId="tenant-stat-total"
				label={t('list-stat-organisations')}
				icon={<IconBuilding />}
				value={rows.length}
				footer={
					<>
						<span className="font-medium text-foreground">
							{t('list-stat-active-count', { count: active })}
						</span>{' '}
						· {t('list-stat-pending-count', { count: pending })} ·{' '}
						{t('list-stat-suspended-count', { count: suspended })}
					</>
				}
			/>
			<StatCard
				testId="tenant-stat-members"
				label={t('list-stat-members')}
				icon={<IconUsersGroup />}
				value={members}
				unit={seats > 0 ? `/ ${seats}` : undefined}
				footer={
					seatsShare === null ? (
						<Dash />
					) : (
						<>
							<span className="font-medium text-foreground">
								{t('list-stat-seats-share', { percent: seatsShare })}
							</span>
						</>
					)
				}
			/>
			<StatCard
				testId="tenant-stat-almost-full"
				label={t('list-stat-almost-full')}
				icon={<IconChartPie />}
				value={almostFull}
				footer={
					<>
						<span className="text-[var(--publy-chip-pending-text)]">
							{t('list-stat-over-80', { count: almostFull })}
						</span>{' '}
						· {t('list-stat-full', { count: full })}
					</>
				}
			/>
			<StatCard
				testId="tenant-stat-invitations"
				label={t('list-stat-pending-invitations')}
				icon={<IconMail />}
				value={<Dash />}
				footer={<Dash />}
			/>
		</>
	);
};
