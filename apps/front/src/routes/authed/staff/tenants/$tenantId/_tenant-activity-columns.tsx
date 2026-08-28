import {
	IconActivity,
	IconCalendarClock,
	IconTarget,
	IconUser,
	IconWorld,
} from '@tabler/icons-react';
import type { ColumnDef } from '~/components/table/column-type';
import { formatDateTime } from '~/lib/format-date-time';
import type { TenantActivityRow } from '~/lib/query/staff-tenant-activity';

/** Column definitions for the tenant activity table. Lives outside the route
 * file so `activity.tsx` exports only its route (react-doctor rung 2, #1417). */
export const makeTenantActivityColumns = (
	t: (key: string, options?: Record<string, unknown>) => string,
	locale: string,
): ColumnDef<TenantActivityRow>[] => [
	{
		id: 'event',
		header: t('common:event'),
		enableSorting: false,
		meta: { headerIcon: <IconActivity />, width: '260px' },
		cell: ({ row }) => (
			<div className="min-w-0">
				<span
					className="block truncate font-mono text-[13px] font-medium"
					title={row.original.action ?? undefined}
				>
					{/* data-honesty-ignore: a tenant activity row's missing action key renders as a no-value dash, not fabricated identity data */}
					{row.original.action || '-'}
				</span>
				<span
					className="block truncate font-mono text-xs text-muted-foreground"
					title={row.original.id}
				>
					{row.original.id}
				</span>
			</div>
		),
	},
	{
		id: 'user',
		header: t('common:user'),
		enableSorting: false,
		meta: { headerIcon: <IconUser />, width: '220px', hideBelow: 768 },
		cell: ({ row }) => (
			<div className="min-w-0">
				<span
					className="block truncate font-normal"
					title={row.original.userName ?? undefined}
				>
					{/* data-honesty-ignore: a hard-deleted user has no surviving row (orphaned FK), so the no-value dash is not fabricated identity data */}
					{row.original.userName || '-'}
				</span>
				<span
					className="block truncate text-xs text-muted-foreground"
					title={row.original.userEmail ?? undefined}
				>
					{/* data-honesty-ignore: a hard-deleted user has no surviving row (orphaned FK), so the no-value dash is not fabricated identity data */}
					{row.original.userEmail || '-'}
				</span>
			</div>
		),
	},
	{
		id: 'target-id',
		header: t('common:target-id'),
		accessorKey: 'targetId',
		enableSorting: false,
		meta: { headerIcon: <IconTarget />, width: '160px', hideBelow: 768 },
		cell: ({ getValue }) => {
			const targetId = getValue<string | null>();
			return (
				<span
					className="block max-w-35 truncate font-mono text-xs text-muted-foreground"
					title={targetId ?? undefined}
				>
					{/* data-honesty-ignore: target id is a documented OPTIONAL field — an event without a target has none, not fabricated identity data */}
					{targetId || '-'}
				</span>
			);
		},
	},
	{
		id: 'ip-address',
		header: t('common:ip-address'),
		accessorKey: 'ipAddress',
		enableSorting: false,
		meta: { headerIcon: <IconWorld />, width: '140px', hideBelow: 768 },
		cell: ({ getValue }) => (
			<span className="block truncate font-mono text-xs text-muted-foreground">
				{/* data-honesty-ignore: ip address is a documented OPTIONAL field — a server-side event has none, not fabricated identity data */}
				{getValue<string | null>() || '-'}
			</span>
		),
	},
	{
		id: 'created_at',
		header: t('common:created-at'),
		accessorKey: 'createdAt',
		meta: { headerIcon: <IconCalendarClock />, width: '200px' },
		cell: ({ getValue }) => {
			const createdAt = getValue<Date | null>();
			return (
				<span className="block truncate font-normal">
					{formatDateTime(createdAt, locale)}
				</span>
			);
		},
	},
];
