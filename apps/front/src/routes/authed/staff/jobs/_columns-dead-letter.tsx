import { IconActivity, IconRotateClockwise } from '@tabler/icons-react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTableRowActions } from '~/components/table/row-actions';
import { DropdownMenuItem } from '~/components/ui/dropdown-menu';
import { StatusPill } from '~/components/ui/product-page';
import { formatDateTime } from '~/lib/format-date-time';
import type { StaffDeadLetterRow } from '~/lib/query/staff-jobs';

import {
	externalStateStatusLabel,
	externalStateStatusTone,
} from './_jobs-status';

type Translator = (key: string, options?: Record<string, unknown>) => string;

/** Column definitions for the staff dead-letter table. Lives outside the
 * route file so `dead-letter.tsx` exports only its route (react-doctor rung
 * 2); tests import it directly from here. */
export const makeDeadLetterColumns = (
	t: Translator,
	locale: string,
	onInspect: (row: StaffDeadLetterRow) => void,
	onRequeue: (row: StaffDeadLetterRow) => void,
): ColumnDef<StaffDeadLetterRow>[] => [
	{
		id: 'job_type',
		header: t('column-job-type'),
		enableSorting: false,
		meta: { headerIcon: <IconActivity />, width: '220px' },
		cell: ({ row }) => (
			<div className="min-w-0">
				<span
					className="block truncate font-mono text-[13px] font-medium"
					title={row.original.jobType ?? undefined}
				>
					{row.original.jobType || t('no-value')}
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
		id: 'external_state_status',
		header: t('column-state'),
		enableSorting: false,
		meta: { width: '160px' },
		cell: ({ row }) => (
			<StatusPill
				tone={externalStateStatusTone(row.original.externalStateStatus)}
			>
				{externalStateStatusLabel(t, row.original.externalStateStatus)}
			</StatusPill>
		),
	},
	{
		id: 'attempts',
		header: t('column-attempts'),
		enableSorting: false,
		meta: { width: '90px', hideBelow: 768 },
		cell: ({ row }) => (
			<span className="font-mono text-[13px]">{row.original.attempts}</span>
		),
	},
	{
		id: 'failed_at',
		header: t('column-failed-at'),
		enableSorting: false,
		meta: { width: '180px', hideBelow: 1024 },
		cell: ({ row }) => (
			<span className="whitespace-nowrap text-[13px]">
				{formatDateTime(row.original.failedAt, locale)}
			</span>
		),
	},
	{
		id: 'requeued_at',
		header: t('column-requeued-at'),
		enableSorting: false,
		meta: { width: '180px', hideBelow: 1024 },
		cell: ({ row }) =>
			row.original.requeuedAt ? (
				<span className="whitespace-nowrap text-[13px] text-muted-foreground">
					{formatDateTime(row.original.requeuedAt, locale)}
				</span>
			) : (
				<span className="text-[13px] text-muted-foreground">—</span>
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
					<IconActivity aria-hidden="true" className="size-4" />
					{t('action-inspect')}
				</DropdownMenuItem>
				<DropdownMenuItem
					data-testid={`dead-letter-requeue-${row.original.id}`}
					disabled={Boolean(row.original.requeuedAt)}
					onSelect={() => onRequeue(row.original)}
				>
					<IconRotateClockwise aria-hidden="true" className="size-4" />
					{t('action-requeue')}
				</DropdownMenuItem>
			</DataTableRowActions>
		),
	},
];
