import {
	IconActivity,
	IconCalendarClock,
	IconEye,
	IconTarget,
	IconUser,
	IconWorld,
} from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy';
import { DataTableRowActions } from '~/components/table/row-actions';
import { DropdownMenuItem } from '~/components/ui/dropdown-menu';
import { StatusPill } from '~/components/ui/product-page';
import { formatDateTime } from '~/lib/format-date-time';
import type { StaffAuditLogRow } from '~/lib/query/staff-audit-logs';

import {
	auditActionKindLabel,
	categorizeAuditAction,
} from './_audit-log-action-category';

/** Column definitions for the staff audit-logs table. Lives outside the
 * route file so `audit-logs.tsx` exports only its route (react-doctor rung
 * 2, #1417); tests import it directly from here. */
export const makeAuditLogColumns = (
	t: (key: string, options?: Record<string, unknown>) => string,
	locale: string,
): ColumnDef<StaffAuditLogRow>[] => [
	{
		id: 'event',
		header: t('common:event'),
		enableSorting: false,
		meta: { headerIcon: <IconActivity />, width: '240px' },
		cell: ({ row }) => {
			const { kind, tone } = categorizeAuditAction(row.original.action);

			return (
				<div className="min-w-0">
					<div className="mb-1">
						<StatusPill tone={tone}>{auditActionKindLabel(t, kind)}</StatusPill>
					</div>
					<Link
						to="/staff/audit-logs/$logId"
						params={{ logId: row.original.id }}
						className="publy-record-link block truncate font-mono text-[13px] font-medium no-underline"
						title={row.original.action ?? undefined}
					>
						{/* data-honesty-ignore: a legacy audit row's missing action key renders as a no-value dash, not fabricated identity data */}
						{row.original.action || '-'}
					</Link>
					<span
						className="block truncate font-mono text-xs text-muted-foreground"
						title={row.original.id}
					>
						{row.original.id}
					</span>
				</div>
			);
		},
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
					{/* data-honesty-ignore: a deleted user's identity is genuinely absent, so the no-value dash is not fabricated identity data */}
					{row.original.userName || '-'}
				</span>
				<span
					className="block truncate text-xs text-muted-foreground"
					title={row.original.userEmail ?? undefined}
				>
					{/* data-honesty-ignore: a deleted user's identity is genuinely absent, so the no-value dash is not fabricated identity data */}
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
	{
		id: 'actions',
		header: () => <span className="sr-only">{t('common:actions')}</span>,
		enableSorting: false,
		meta: { width: '40px', align: 'center' },
		cell: ({ row }) => (
			<DataTableRowActions
				ariaLabel={t('common:actions-for', {
					name: row.original.action ?? row.original.id,
				})}
				testId={`staff-audit-log-actions-${row.original.id}`}
			>
				<DropdownMenuItem
					render={
						<Link
							to="/staff/audit-logs/$logId"
							params={{ logId: row.original.id }}
						/>
					}
				>
					<IconEye />
					{t('common:view-details')}
				</DropdownMenuItem>
			</DataTableRowActions>
		),
	},
];
