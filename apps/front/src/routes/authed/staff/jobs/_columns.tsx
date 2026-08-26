import { IconActivity, IconEye } from '@tabler/icons-react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTableRowActions } from '~/components/table/row-actions';
import { DropdownMenuItem } from '~/components/ui/dropdown-menu';
import { StatusPill } from '~/components/ui/product-page';
import { formatDateTime } from '~/lib/format-date-time';
import type { StaffJobQueueRow } from '~/lib/query/staff-jobs';

import { queueStatusLabel, queueStatusTone } from './_jobs-status';

/** Column definitions for the staff job-queue table. Lives outside the route
 * file so `queue.tsx` exports only its route (react-doctor rung 2); tests
 * import it directly from here. */
export const makeQueueColumns = (
	t: (key: string, options?: Record<string, unknown>) => string,
	locale: string,
	onInspect: (row: StaffJobQueueRow) => void,
): ColumnDef<StaffJobQueueRow>[] => [
	{
		id: 'job_type',
		header: t('common:column-job-type'),
		enableSorting: false,
		meta: { headerIcon: <IconActivity />, width: '240px' },
		cell: ({ row }) => (
			<div className="min-w-0">
				<span
					className="block truncate font-mono text-[13px] font-medium"
					title={row.original.jobType ?? undefined}
				>
					{/* data-honesty-ignore: a legacy row's missing job type renders as a no-value dash, not fabricated identity data */}
					{row.original.jobType || '-'}
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
		id: 'status',
		header: t('column-status'),
		enableSorting: false,
		meta: { width: '130px' },
		cell: ({ row }) => (
			<StatusPill tone={queueStatusTone(row.original.status)}>
				{queueStatusLabel(t, row.original.status)}
			</StatusPill>
		),
	},
	{
		id: 'attempts',
		header: t('common:column-attempts'),
		enableSorting: false,
		meta: { width: '100px', hideBelow: 768 },
		cell: ({ row }) => (
			<span className="font-mono text-[13px]">
				{row.original.attempts}/{row.original.maxAttempts}
			</span>
		),
	},
	{
		id: 'tenant_id',
		header: t('column-tenant'),
		enableSorting: false,
		meta: { width: '180px', hideBelow: 1024 },
		cell: ({ row }) => (
			<span
				className="block truncate font-mono text-xs text-muted-foreground"
				title={row.original.tenantId ?? undefined}
			>
				{/* data-honesty-ignore: a purged tenant reference renders as a no-value dash */}
				{row.original.tenantId || '-'}
			</span>
		),
	},
	{
		id: 'next_attempt_at',
		header: t('column-next-attempt'),
		enableSorting: false,
		meta: { width: '180px', hideBelow: 1024 },
		cell: ({ row }) => (
			<span className="whitespace-nowrap text-[13px]">
				{formatDateTime(row.original.nextAttemptAt, locale)}
			</span>
		),
	},
	{
		id: 'actions',
		header: '',
		enableSorting: false,
		meta: { width: '60px' },
		cell: ({ row }) => (
			<DataTableRowActions ariaLabel={row.original.jobType ?? ''}>
				<DropdownMenuItem onSelect={() => onInspect(row.original)}>
					<IconEye aria-hidden="true" className="size-4" />
					{t('common:action-inspect')}
				</DropdownMenuItem>
			</DataTableRowActions>
		),
	},
];
