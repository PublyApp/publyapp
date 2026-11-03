import {
	IconBuilding,
	IconChartPie,
	IconUsersGroup,
} from '@tabler/icons-react';
import { StatCard } from '~/components/ui/stat-card';

import type { TenantListCountsResponse } from '@org/client-ts/models/index';

const Dash = () => <span className="text-muted-foreground">—</span>;

/**
 * The StatCards above the organisations list (§4.2), from the list API's
 * whole-collection `counts` (issue #2301) — never the loaded page's sums. The
 * invitations card is omitted until the list API provides an invitation count.
 */
export const TenantStatCards = ({
	counts,
	t,
}: {
	counts: TenantListCountsResponse | null | undefined;
	t: (key: string, options?: Record<string, unknown>) => string;
}) => {
	if (!counts) {
		return (
			<>
				<StatCard
					testId="tenant-stat-total"
					label={t('list-stat-organisations')}
					icon={<IconBuilding />}
					value={<Dash />}
					footer={<Dash />}
				/>
				<StatCard
					testId="tenant-stat-members"
					label={t('list-stat-members')}
					icon={<IconUsersGroup />}
					value={<Dash />}
					footer={<Dash />}
				/>
				<StatCard
					testId="tenant-stat-almost-full"
					label={t('list-stat-almost-full')}
					icon={<IconChartPie />}
					value={<Dash />}
					footer={<Dash />}
				/>
			</>
		);
	}

	const members = counts.members ?? 0;
	const seats = counts.seats ?? 0;
	const seatsShare = seats > 0 ? Math.round((members / seats) * 100) : null;
	const active = counts.active ?? 0;
	const pending = counts.pending ?? 0;
	const suspended = counts.suspended ?? 0;
	const almostFull = counts.almostFull ?? 0;
	const full = counts.full ?? 0;

	return (
		<>
			<StatCard
				testId="tenant-stat-total"
				label={t('list-stat-organisations')}
				icon={<IconBuilding />}
				value={counts.total ?? 0}
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
						<span className="font-medium text-foreground">
							{t('list-stat-seats-share', { percent: seatsShare })}
						</span>
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
		</>
	);
};
