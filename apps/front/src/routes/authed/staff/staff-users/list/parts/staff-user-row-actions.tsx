import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { USER_STATUS_ENUM } from '@org/shared-ts/lib/constants';

import { ConfirmDialog } from '#app/components/custom-dialog/confirm-dialog.tsx';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { useDeleteStaffUser } from '#app/lib/react-query/features/staff/staff-user.hooks.ts';
import {
	clearDeletedStaffUserRelatedQueries,
	invalidateStaffUserLifecycleQueries,
} from '#app/routes/authed/staff/staff-users/shared/staff-user-cache-helpers.ts';

import type { StaffUserRowData } from './use-staff-users-table-controller.ts';

type DeleteStaffUserActionProps = {
	user: StaffUserRowData;
};

export const DeleteStaffUserAction = ({ user }: DeleteStaffUserActionProps) => {
	const { t } = useTranslate();
	const queryClient = useQueryClient();
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const canDelete = user.status === USER_STATUS_ENUM.SUSPENDED;

	const { mutate: deleteStaffUser, isPending: isDeleting } = useDeleteStaffUser(
		{
			meta: { successMessage: 'staff-user-deleted-success' },
			onSuccess: async () => {
				setDeleteDialogOpen(false);
				await invalidateStaffUserLifecycleQueries({
					queryClient,
					userIds: [user.id],
					invalidateStaffProfilesList: true,
				});
				clearDeletedStaffUserRelatedQueries({
					queryClient,
					userIds: [user.id],
				});
			},
		},
	);

	return (
		<>
			<Tooltip
				title={
					canDelete
						? t('delete')
						: t('delete-staff-user-disabled-until-suspended')
				}
				placement="top"
				arrow
			>
				<Box component="span">
					<IconButton
						color="default"
						size="small"
						onClick={() => setDeleteDialogOpen(true)}
						disabled={!canDelete || isDeleting}
						sx={{
							color: canDelete ? 'text.secondary' : 'action.disabled',
						}}
					>
						<Iconify icon="solar:trash-bin-trash-bold" width={18} />
					</IconButton>
				</Box>
			</Tooltip>

			<ConfirmDialog
				open={deleteDialogOpen}
				onClose={() => setDeleteDialogOpen(false)}
				title={t('confirm-delete-staff-user-title')}
				content={t('confirm-delete-staff-user-message')}
				action={
					<Button
						variant="contained"
						color="error"
						onClick={() => deleteStaffUser({ userId: user.id })}
						disabled={isDeleting}
					>
						{t('delete')}
					</Button>
				}
			/>
		</>
	);
};
