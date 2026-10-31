import { IconSend, IconUser } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTableRowActions } from '~/components/table/row-actions';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { DropdownMenuItem } from '~/components/ui/dropdown-menu';
import { toastLocalMutationResult } from '~/lib/mutation-feedback/mutation-toast';
import {
	invalidateStaffInvitations,
	useResendStaffInvitationMutation,
	useRevokeStaffInvitationMutation,
} from '~/lib/query/staff-invitations';

import type { StaffInvitationRow } from './list-helpers';

export const InvitationRowActions = ({ row }: { row: StaffInvitationRow }) => {
	const { t } = useTranslation(['staff-invitations', 'common']);
	const queryClient = useQueryClient();
	const [isConfirmOpen, setConfirmOpen] = useState(false);
	const resendMutation = useResendStaffInvitationMutation();
	const revokeMutation = useRevokeStaffInvitationMutation();
	const isActionPending = resendMutation.isPending || revokeMutation.isPending;
	const canManage = row.status === 'pending';

	const handleIneligibleAction = () => {
		toastLocalMutationResult.warning(
			t('only-pending-invitations-can-be-managed'),
		);
	};

	const handleResend = async () => {
		if (!canManage) {
			handleIneligibleAction();
			return;
		}

		try {
			await resendMutation.mutateAsync({ invitationId: row.id });
			await invalidateStaffInvitations(queryClient);
		} catch {
			// MutationCache owns ordinary mutation feedback.
		}
	};

	const handleRevoke = async () => {
		if (!canManage) {
			handleIneligibleAction();
			setConfirmOpen(false);
			return;
		}

		try {
			await revokeMutation.mutateAsync({ invitationId: row.id });
			await invalidateStaffInvitations(queryClient);
		} catch {
			// MutationCache owns ordinary mutation feedback.
		}
		// No try/finally: the React Compiler cannot lower finally clauses
		// yet and would skip this component.
		setConfirmOpen(false);
	};

	return (
		<>
			<DataTableRowActions
				ariaLabel={t('common:actions-for', {
					name: row.email || t('common:invitation'),
				})}
				testId={`staff-invitation-actions-${row.id}`}
			>
				<DropdownMenuItem
					onClick={() => void handleResend()}
					disabled={isActionPending}
				>
					<IconSend className="size-[15px]" />
					{t('send-reminder')}
				</DropdownMenuItem>
				<DropdownMenuItem
					onClick={() =>
						void (canManage ? setConfirmOpen(true) : handleRevoke())
					}
					disabled={isActionPending}
				>
					<IconUser className="size-[15px]" />
					{t('common:revoke-invitation')}
				</DropdownMenuItem>
			</DataTableRowActions>
			<ConfirmDialog
				isOpen={isConfirmOpen}
				title={t('common:revoke-invitation')}
				description={t('invitation-removal-description')}
				confirmLabel={t('common:revoke')}
				isPending={revokeMutation.isPending}
				onConfirm={() => void handleRevoke()}
				onOpenChange={setConfirmOpen}
			/>
		</>
	);
};
