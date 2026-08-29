import { IconActivity, IconRotateClockwise } from '@tabler/icons-react';
import type { ColumnDef } from '~/components/table/column-type';
import { DataTableRowActions } from '~/components/table/row-actions';
import { DropdownMenuItem } from '~/components/ui/dropdown-menu';
import { StatusPill } from '~/components/ui/product-page';
import { formatDateTime } from '~/lib/format-date-time';
import type { StaffDeadLetterRow } from '~/lib/query/staff-jobs';

import { formatFailureCause } from './_jobs-helpers';
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
	options?: {
		/** True while the live staff auth-scope request is still in flight.
		 * The Requeue item stays visible but renders disabled-with-explanation
		 * so a click can't be silently swallowed (brief #1626). The click is
		 * also gated at the handler (render, gate the click).
		 *
		 * Prefer this over `canRequeue` for the disabled state: a denied user
		 * (grant resolved, key absent) must see *why* the action is blocked,
		 * not just a dead item. */
		permissionsPending?: boolean;
		/** True once the request resolved and Requeue is denied. Drives the
		 * explanation. */
		permissionsDenied?: boolean;
		title?: string;
	},
): ColumnDef<StaffDeadLetterRow>[] => [
	{
		id: 'job_type',
		header: t('common:column-job-type'),
		enableSorting: false,
		meta: { headerIcon: <IconActivity />, width: '220px' },
		cell: ({ row }) => (
			<div className="min-w-0">
				<span
					className="block truncate font-mono text-[13px] font-medium"
					title={row.original.jobType ?? undefined}
				>
					{row.original.jobType || t('common:no-value')}
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
		header: t('common:column-state'),
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
		header: t('common:column-attempts'),
		enableSorting: false,
		meta: { width: '90px', hideBelow: 768 },
		cell: ({ row }) => (
			<span className="font-mono text-[13px]">{row.original.attempts}</span>
		),
	},
	{
		id: 'failed_at',
		header: t('common:column-failed-at'),
		enableSorting: false,
		meta: { width: '180px', hideBelow: 1024 },
		cell: ({ row }) => (
			<span className="whitespace-nowrap text-[13px]">
				{formatDateTime(row.original.failedAt, locale)}
			</span>
		),
	},
	{
		id: 'last_error',
		header: t('common:column-last-error'),
		enableSorting: false,
		meta: { width: '280px' },
		cell: ({ row }) => {
			const cause = formatFailureCause(row.original.lastError, t);
			const isAbsent = cause === t('common:no-cause');
			return (
				<div className="min-w-0">
					<span
						className="block truncate text-[13px]"
						title={isAbsent ? undefined : cause}
						data-testid={`cell-last-error-${row.original.id}`}
					>
						{cause}
					</span>
				</div>
			);
		},
	},
	{
		id: 'requeued_at',
		header: t('common:column-requeued-at'),
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
				<DropdownMenuItem
					data-testid={`dead-letter-inspect-${row.original.id}`}
					onClick={() => onInspect(row.original)}
				>
					<IconActivity aria-hidden="true" className="size-4" />
					{t('common:action-inspect')}
				</DropdownMenuItem>
				<DropdownMenuItem
					data-testid={`dead-letter-requeue-${row.original.id}`}
					disabled={
						Boolean(row.original.requeuedAt) ||
						Boolean(options?.permissionsPending) ||
						Boolean(options?.permissionsDenied)
					}
					title={
						options?.permissionsPending || options?.permissionsDenied
							? options.title
							: undefined
					}
					onClick={() => onRequeue(row.original)}
				>
					<IconRotateClockwise aria-hidden="true" className="size-4" />
					{t('common:action-requeue')}
				</DropdownMenuItem>
			</DataTableRowActions>
		),
	},
];
