import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import type { StaffSystemJobDefinitionRow } from '~/lib/query/staff-jobs';

type Translate = (key: string, options?: Record<string, unknown>) => string;

export type CronDialogState = {
	row: StaffSystemJobDefinitionRow;
	draft: string;
	error: string | null;
};

const MAX_CRON_LENGTH = 100;

/** The system-job schedule editor. */
export const SystemCronDialog = ({
	dialog,
	isPending,
	onDraftChange,
	onConfirm,
	onOpenChange,
	t,
}: {
	dialog: CronDialogState | null;
	isPending: boolean;
	onDraftChange: (draft: string) => void;
	onConfirm: () => void;
	onOpenChange: (open: boolean) => void;
	t: Translate;
}) => (
	<ConfirmDialog
		isOpen={dialog !== null}
		title={t('staff-jobs:cron-dialog-title')}
		description={t('staff-jobs:cron-dialog-description', {
			jobKey: dialog?.row.jobKey ?? '',
		})}
		confirmLabel={t('staff-jobs:action-save-cron')}
		isPending={isPending}
		tone="primary"
		onConfirm={onConfirm}
		onOpenChange={onOpenChange}
	>
		<div className="space-y-1.5">
			<Label htmlFor="cron-expression">
				{t('staff-jobs:cron-expression-label')}
			</Label>
			<Input
				id="cron-expression"
				value={dialog?.draft ?? ''}
				maxLength={MAX_CRON_LENGTH}
				onChange={(event) => onDraftChange(event.target.value)}
			/>
			{dialog?.error ? (
				<p role="alert" className="text-[13px] text-destructive">
					{dialog.error}
				</p>
			) : null}
		</div>
	</ConfirmDialog>
);
