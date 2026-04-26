import Button from '@mui/material/Button';

import { ConfirmDialog } from '#app/components/custom-dialog/confirm-dialog.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';

import type { StaffUsersBulkActionType } from './use-staff-users-bulk-actions.ts';

export type StaffUsersBulkActionDialogState = {
	type: StaffUsersBulkActionType;
	open: boolean;
};

type StaffUsersBulkActionDialogsProps = {
	dialogState: StaffUsersBulkActionDialogState;
	selectedCount: number;
	isBulkSuspending: boolean;
	isBulkReactivating: boolean;
	isBulkDeleting: boolean;
	onClose: (type: StaffUsersBulkActionType) => void;
	onBulkSuspend: () => void;
	onBulkReactivate: () => void;
	onBulkDelete: () => void;
};

const StaffUsersBulkActionDialogs = ({
	dialogState,
	selectedCount,
	isBulkSuspending,
	isBulkReactivating,
	isBulkDeleting,
	onClose,
	onBulkSuspend,
	onBulkReactivate,
	onBulkDelete,
}: StaffUsersBulkActionDialogsProps) => {
	const { t } = useTranslate();

	return (
		<>
			<ConfirmDialog
				open={dialogState.type === 'suspend' && dialogState.open}
				onClose={() => onClose('suspend')}
				title={t('bulk-suspend')}
				content={t('bulk-suspend-staff-users-confirm', {
					count: selectedCount,
				})}
				action={
					<Button
						variant="contained"
						color="warning"
						onClick={onBulkSuspend}
						disabled={isBulkSuspending}
					>
						{t('suspend')}
					</Button>
				}
			/>

			<ConfirmDialog
				open={dialogState.type === 'reactivate' && dialogState.open}
				onClose={() => onClose('reactivate')}
				title={t('bulk-reactivate')}
				content={t('bulk-reactivate-staff-users-confirm', {
					count: selectedCount,
				})}
				action={
					<Button
						variant="contained"
						color="success"
						onClick={onBulkReactivate}
						disabled={isBulkReactivating}
					>
						{t('reactivate')}
					</Button>
				}
			/>

			<ConfirmDialog
				open={dialogState.type === 'delete' && dialogState.open}
				onClose={() => onClose('delete')}
				title={t('bulk-delete')}
				content={t('bulk-delete-staff-users-confirm', {
					count: selectedCount,
				})}
				action={
					<Button
						variant="contained"
						color="error"
						onClick={onBulkDelete}
						disabled={isBulkDeleting}
					>
						{t('delete')}
					</Button>
				}
			/>
		</>
	);
};

export default StaffUsersBulkActionDialogs;
