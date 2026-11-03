import {
	IconCalendarCog,
	IconEye,
	IconPlayerPlay,
	IconRotateClockwise,
} from '@tabler/icons-react';
import { DataTableRowActions } from '~/components/table/row-actions';
import { DropdownMenuItem } from '~/components/ui/dropdown-menu';
import type {
	StaffDeadLetterRow,
	StaffJobQueueRow,
	StaffSystemJobDefinitionRow,
} from '~/lib/query/staff-jobs';

type Translate = (key: string, options?: Record<string, unknown>) => string;

export const QueueRowActions = ({
	row,
	t,
	onInspect,
}: {
	row: StaffJobQueueRow;
	t: Translate;
	onInspect: (row: StaffJobQueueRow) => void;
}) => (
	<DataTableRowActions ariaLabel={row.jobType ?? row.id}>
		<DropdownMenuItem
			data-testid={`queue-inspect-${row.id}`}
			onClick={() => onInspect(row)}
		>
			<IconEye aria-hidden="true" className="size-4" />
			{t('common:action-inspect')}
		</DropdownMenuItem>
	</DataTableRowActions>
);

export const DeadLetterRowActions = ({
	row,
	t,
	onInspect,
	onRequeue,
	permissionsPending,
	permissionsDenied,
	explanation,
}: {
	row: StaffDeadLetterRow;
	t: Translate;
	onInspect: (row: StaffDeadLetterRow) => void;
	onRequeue: (row: StaffDeadLetterRow) => void;
	permissionsPending: boolean;
	permissionsDenied: boolean;
	explanation?: string;
}) => {
	const requeueBlocked =
		Boolean(row.requeuedAt) || permissionsPending || permissionsDenied;
	return (
		<DataTableRowActions ariaLabel={row.jobType ?? row.id}>
			<DropdownMenuItem
				data-testid={`dead-letter-inspect-${row.id}`}
				onClick={() => onInspect(row)}
			>
				<IconEye aria-hidden="true" className="size-4" />
				{t('common:action-inspect')}
			</DropdownMenuItem>
			<DropdownMenuItem
				data-testid={`dead-letter-requeue-${row.id}`}
				disabled={requeueBlocked}
				title={
					permissionsPending || permissionsDenied ? explanation : undefined
				}
				onClick={() => {
					if (requeueBlocked) {
						return;
					}
					onRequeue(row);
				}}
			>
				<IconRotateClockwise aria-hidden="true" className="size-4" />
				{t('common:action-requeue')}
			</DropdownMenuItem>
		</DataTableRowActions>
	);
};

export const SystemJobRowActions = ({
	row,
	t,
	permissionsPending,
	updateDenied,
	triggerDenied,
	explanation,
	onEditCron,
	onTriggerNow,
}: {
	row: StaffSystemJobDefinitionRow;
	t: Translate;
	permissionsPending: boolean;
	updateDenied: boolean;
	triggerDenied: boolean;
	explanation?: string;
	onEditCron: (row: StaffSystemJobDefinitionRow) => void;
	onTriggerNow: (row: StaffSystemJobDefinitionRow) => void;
}) => {
	const updateBlocked = permissionsPending || updateDenied;
	const triggerBlocked = permissionsPending || triggerDenied;
	return (
		<DataTableRowActions ariaLabel={row.jobKey ?? row.id}>
			<DropdownMenuItem
				data-testid={`system-job-edit-cron-${row.id}`}
				disabled={updateBlocked}
				title={updateBlocked ? explanation : undefined}
				onClick={() => {
					if (updateBlocked) {
						return;
					}
					onEditCron(row);
				}}
			>
				<IconCalendarCog aria-hidden="true" className="size-4" />
				{t('staff-jobs:action-edit-cron')}
			</DropdownMenuItem>
			<DropdownMenuItem
				data-testid={`system-job-trigger-${row.id}`}
				disabled={triggerBlocked}
				title={triggerBlocked ? explanation : undefined}
				onClick={() => {
					if (triggerBlocked) {
						return;
					}
					onTriggerNow(row);
				}}
			>
				<IconPlayerPlay aria-hidden="true" className="size-4" />
				{t('staff-jobs:action-trigger-now')}
			</DropdownMenuItem>
		</DataTableRowActions>
	);
};
