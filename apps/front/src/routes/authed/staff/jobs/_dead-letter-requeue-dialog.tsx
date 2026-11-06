import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import type { StaffDeadLetterRow } from '~/lib/query/staff-jobs';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const MAX_NOTE_LENGTH = 500;

/** The dead-letter requeue confirmation and its optional note. */
export const DeadLetterRequeueDialog = ({
	target,
	note,
	error,
	isPending,
	onNoteChange,
	onConfirm,
	onOpenChange,
	t,
}: {
	target: StaffDeadLetterRow | null;
	note: string;
	error: string | null;
	isPending: boolean;
	onNoteChange: (note: string) => void;
	onConfirm: () => void;
	onOpenChange: (open: boolean) => void;
	t: Translate;
}) => (
	<ConfirmDialog
		isOpen={target !== null}
		title={t('staff-jobs:requeue-confirm-title')}
		description={
			target?.jobType
				? t('staff-jobs:requeue-confirm-description', {
						jobType: target.jobType,
					})
				: t('staff-jobs:requeue-confirm-description-generic')
		}
		confirmLabel={t('common:action-requeue')}
		isPending={isPending}
		tone="primary"
		onConfirm={onConfirm}
		onOpenChange={onOpenChange}
	>
		<div className="space-y-1.5">
			<Label htmlFor="requeue-note">{t('staff-jobs:requeue-note-label')}</Label>
			<Input
				id="requeue-note"
				value={note}
				maxLength={MAX_NOTE_LENGTH}
				onChange={(event) => onNoteChange(event.target.value)}
			/>
			{error ? (
				<p role="alert" className="text-[13px] text-destructive">
					{error}
				</p>
			) : null}
		</div>
	</ConfirmDialog>
);
