import {
	IconBuilding,
	IconChartPie,
	IconUsersGroup,
} from '@tabler/icons-react';
import { StatCard } from '~/components/ui/stat-card';
import type { StaffTenantRow } from '~/lib/query/staff-tenants';

import { occupancyBand } from './_tenants-list-config';

const Dash = () => <span className="text-muted-foreground">—</span>;

/**
 * The StatCards above the organisations list (§4.2). Every figure describes
 * the whole collection, never just the loaded page: when the consumer keeps
 * cursor pagination and the API exposes no count source, `known` is false and
 * the figures are an em dash. The invitations card is omitted until the list
 * API provides an invitation count (issue #2275).
 */
export const TenantStatCards = ({
	rows,
	t,
	known = true,
}: {
	rows: StaffTenantRow[];
	t: (key: string, options?: Record<string, unknown>) => string;
	known?: boolean;
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

	let membersFooter = <Dash />;
	if (known && seatsShare !== null) {
		membersFooter = (
			<>
				<span className="font-medium text-foreground">
					{t('list-stat-seats-share', { percent: seatsShare })}
				</span>
			</>
		);
	}

	return (
		<>
			<StatCard
				testId="tenant-stat-total"
				label={t('list-stat-organisations')}
				icon={<IconBuilding />}
				value={known ? rows.length : <Dash />}
				footer={
					known ? (
						<>
							<span className="font-medium text-foreground">
								{t('list-stat-active-count', { count: active })}
							</span>{' '}
							· {t('list-stat-pending-count', { count: pending })} ·{' '}
							{t('list-stat-suspended-count', { count: suspended })}
						</>
					) : (
						<Dash />
					)
				}
			/>
			<StatCard
				testId="tenant-stat-members"
				label={t('list-stat-members')}
				icon={<IconUsersGroup />}
				value={known ? members : <Dash />}
				unit={known && seats > 0 ? `/ ${seats}` : undefined}
				footer={membersFooter}
			/>
			<StatCard
				testId="tenant-stat-almost-full"
				label={t('list-stat-almost-full')}
				icon={<IconChartPie />}
				value={known ? almostFull : <Dash />}
				footer={
					known ? (
						<>
							<span className="text-[var(--publy-chip-pending-text)]">
								{t('list-stat-over-80', { count: almostFull })}
							</span>{' '}
							· {t('list-stat-full', { count: full })}
						</>
					) : (
						<Dash />
					)
				}
			/>
		</>
	);
};
