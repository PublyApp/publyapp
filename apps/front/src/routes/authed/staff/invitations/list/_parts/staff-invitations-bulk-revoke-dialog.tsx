import Button from '@mui/material/Button';

import { ConfirmDialog } from '#app/components/custom-dialog/confirm-dialog.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';

type StaffInvitationsBulkRevokeDialogProps = {
	open: boolean;
	eligibleCount: number;
	ineligibleCount: number;
	isPending: boolean;
	onClose: () => void;
	onConfirm: () => void;
};

export const StaffInvitationsBulkRevokeDialog = ({
	open,
	eligibleCount,
	ineligibleCount,
	isPending,
	onClose,
	onConfirm,
}: StaffInvitationsBulkRevokeDialogProps) => {
	const { t } = useTranslate();

	return (
		<ConfirmDialog
			open={open}
			onClose={onClose}
			title={t('revoke-selected')}
			content={
				ineligibleCount > 0
					? t('confirm-bulk-revoke-invitations-with-ineligible', {
							eligible: eligibleCount,
							ineligible: ineligibleCount,
						})
					: t('confirm-bulk-revoke-invitations', {
							count: eligibleCount,
						})
			}
			action={
				<Button
					variant="contained"
					color="error"
					onClick={onConfirm}
					disabled={isPending}
				>
					{t('staff-revoke')}
				</Button>
			}
		/>
	);
};
