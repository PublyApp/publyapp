import { IconPlayerPlay, IconRefresh } from '@tabler/icons-react';
import type { ColumnDef } from '~/components/table/column-type';
import { Button } from '~/components/ui/button';
import { Switch } from '~/components/ui/switch';
import { formatDateTime } from '~/lib/format-date-time';
import type { StaffSystemJobDefinitionRow } from '~/lib/query/staff-jobs';

type Translator = (key: string, options?: Record<string, unknown>) => string;

export type SystemJobColumnActions = {
	canUpdateSystemJob: boolean;
	canTriggerSystemJob: boolean;
	/** True while the live staff auth-scope request is still in flight. Buttons
	 * render disabled-with-explanation (never clickable) so a click can't be
	 * silently swallowed (brief #1626).
	 *
	 * Prefer this over `canUpdateSystemJob`/`canTriggerSystemJob` for the
	 * disabled state: those resolve to `false` for a *denied* user too, but a
	 * denied user must see *why* the action is blocked, not just a dead button.
	 */
	permissionsPending: boolean;
	/** True once the request resolved and an action is denied (load error, or a
	 * grant that does not include the required key for that specific action).
	 * These are scoped per action so a user who can trigger but not edit-cron
	 * is not wrongly blocked on the trigger control — only the action they
	 * actually lack is disabled-with-explanation (brief #1626). */
	updateDenied: boolean;
	triggerDenied: boolean;
	isTogglePending: boolean;
	onToggleEnabled: (row: StaffSystemJobDefinitionRow, next: boolean) => void;
	onTriggerNow: (row: StaffSystemJobDefinitionRow) => void;
	onEditCron: (row: StaffSystemJobDefinitionRow) => void;
};

/** Column definitions for the system-job definitions table. Lives outside the
 * route file; tests import it directly from here. The enabled `Switch` and
 * the action buttons always render — gating happens at the click handler per
 * the bulk-action UX convention (render, gate the click). */
export const makeSystemJobColumns = (
	t: Translator,
	locale: string,
	actions: SystemJobColumnActions,
): ColumnDef<StaffSystemJobDefinitionRow>[] => {
	// While the permissions request is unresolved, or once it resolved and
	// denied this action, the action is unavailable — but the control must stay
	// visible and explained, never a clickable dead control (brief #1626).
	// Denial is scoped per action so a user lacking one grant is not blocked on
	// the action they can still do.
	const updateDisabled = actions.permissionsPending || actions.updateDenied;
	const triggerDisabled = actions.permissionsPending || actions.triggerDenied;
	let explanation: string | undefined;
	if (actions.permissionsPending) {
		explanation = t('action-permission-checking');
	} else if (actions.updateDenied || actions.triggerDenied) {
		explanation = t('action-permission-denied');
	} else {
		explanation = undefined;
	}

	return [
		{
			id: 'job_key',
			header: t('common:column-job-key'),
			enableSorting: false,
			meta: { headerIcon: <IconRefresh />, width: '280px' },
			cell: ({ row }) => (
				<div className="min-w-0">
					<span
						className="block truncate font-mono text-[13px] font-medium"
						title={row.original.jobKey ?? undefined}
					>
						{row.original.jobKey || t('common:no-value')}
					</span>
					<span
						className="block truncate font-mono text-xs text-muted-foreground"
						title={row.original.cronExpression ?? undefined}
					>
						{row.original.cronExpression || t('common:no-value')}
					</span>
				</div>
			),
		},
		{
			id: 'is_enabled',
			header: t('common:column-enabled'),
			enableSorting: false,
			meta: { width: '110px' },
			cell: ({ row }) => (
				<Switch
					size="sm"
					aria-label={`${t('common:action-toggle-enabled')} ${row.original.jobKey ?? ''}`}
					data-testid={`system-job-toggle-${row.original.id}`}
					checked={row.original.isEnabled === true}
					disabled={actions.isTogglePending || updateDisabled}
					title={updateDisabled ? explanation : undefined}
					onCheckedChange={(checked) =>
						actions.onToggleEnabled(row.original, checked === true)
					}
				/>
			),
		},
		{
			id: 'last_enqueued_at',
			header: t('column-last-enqueued'),
			enableSorting: false,
			meta: { width: '180px', hideBelow: 768 },
			cell: ({ row }) => (
				<span className="whitespace-nowrap text-[13px]">
					{formatDateTime(row.original.lastEnqueuedAt, locale)}
				</span>
			),
		},
		{
			id: 'updated_at',
			header: t('column-updated-at'),
			enableSorting: false,
			meta: { width: '180px', hideBelow: 1024 },
			cell: ({ row }) => (
				<span className="whitespace-nowrap text-[13px]">
					{formatDateTime(row.original.updatedAt, locale)}
				</span>
			),
		},
		{
			id: 'actions',
			header: '',
			enableSorting: false,
			meta: { width: '200px' },
			cell: ({ row }) => (
				<div className="flex items-center justify-end gap-1.5">
					<Button
						type="button"
						variant="outline"
						size="sm"
						data-testid={`system-job-edit-cron-${row.original.id}`}
						disabled={updateDisabled}
						title={updateDisabled ? explanation : undefined}
						onClick={() => actions.onEditCron(row.original)}
					>
						{t('action-edit-cron')}
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						data-testid={`system-job-trigger-${row.original.id}`}
						disabled={triggerDisabled}
						title={triggerDisabled ? explanation : undefined}
						onClick={() => actions.onTriggerNow(row.original)}
					>
						<IconPlayerPlay aria-hidden="true" className="size-3.5" />
						{t('action-trigger-now')}
					</Button>
				</div>
			),
		},
	];
};
