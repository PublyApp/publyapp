import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { useQueryClient } from '@tanstack/react-query';
import capitalize from 'lodash/capitalize';
import { useState } from 'react';

import {
	FRONT_PATH_NAMES,
	USER_STATUS_ENUM,
} from '@org/shared-ts/lib/constants';
import { logger } from '@org/shared-ts/lib/logger/iso-logger';

import { ConfirmDialog } from '#app/components/custom-dialog/confirm-dialog.tsx';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { RouterLink } from '#app/components/router-link.tsx';
import { toast } from '#app/components/snackbar/index.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import {
	useGetVerificationLink,
	useSendEmailVerificationReminder,
} from '#app/lib/react-query/features/common/auth.hooks.ts';
import {
	useDeleteStaffUser,
	useSuspendStaffUser,
	useReactivateStaffUser,
} from '#app/lib/react-query/features/staff/staff-user.hooks.ts';

import type { StaffUserRowData } from './use-staff-users-table-controller.ts';
import {
	clearDeletedStaffUserRelatedQueries,
	invalidateStaffUsersListAndDetails,
} from './staff-users-list-helpers.ts';

const ALLOW_COPY_LINK = false;

type StaffUserRowActionsProps = {
	user: StaffUserRowData;
};

const StaffUserRowActions = ({ user }: StaffUserRowActionsProps) => {
	const { t } = useTranslate();
	const queryClient = useQueryClient();
	const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
	const [reactivateDialogOpen, setReactivateDialogOpen] = useState(false);
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

	const isPendingUser = user.status === USER_STATUS_ENUM.PENDING;
	const isSuspended = user.status === USER_STATUS_ENUM.SUSPENDED;
	const canDelete = isSuspended;

	const { mutate: suspendStaffUser, isPending: isSuspending } =
		useSuspendStaffUser({
			meta: { successMessage: 'staff-user-suspended-success' },
			onSuccess: async () => {
				setSuspendDialogOpen(false);
				await invalidateStaffUsersListAndDetails({
					queryClient,
					userIds: [user.id],
				});
			},
		});

	const { mutate: reactivateStaffUser, isPending: isReactivating } =
		useReactivateStaffUser({
			meta: { successMessage: 'staff-user-reactivated-success' },
			onSuccess: async () => {
				setReactivateDialogOpen(false);
				await invalidateStaffUsersListAndDetails({
					queryClient,
					userIds: [user.id],
				});
			},
		});

	const { mutate: deleteStaffUser, isPending: isDeleting } = useDeleteStaffUser(
		{
			meta: { successMessage: 'staff-user-deleted-success' },
			onSuccess: async () => {
				setDeleteDialogOpen(false);
				await invalidateStaffUsersListAndDetails({
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
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
				<FollowUpButton isUserPending={isPendingUser} email={user.email} />

				<CopyLinkButton isUserPending={isPendingUser} userId={user.id} />

				{isSuspended ? (
					<Tooltip title={t('reactivate')} placement="top" arrow>
						<IconButton
							color="default"
							size="small"
							onClick={() => setReactivateDialogOpen(true)}
							disabled={isReactivating}
						>
							<Iconify icon="solar:play-circle-bold" width={18} />
						</IconButton>
					</Tooltip>
				) : (
					<Tooltip title={t('suspend')} placement="top" arrow>
						<IconButton
							color="default"
							size="small"
							onClick={() => setSuspendDialogOpen(true)}
							disabled={isSuspending}
						>
							<Iconify icon="solar:forbidden-circle-bold" width={18} />
						</IconButton>
					</Tooltip>
				)}

				<Tooltip title={t('view-details')} placement="top" arrow>
					<IconButton
						color="default"
						size="small"
						LinkComponent={RouterLink}
						href={FRONT_PATH_NAMES.staff.staffUsers.details(user.id)}
					>
						<Iconify icon="solar:eye-bold" width={18} />
					</IconButton>
				</Tooltip>

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
								color: canDelete ? 'error.main' : 'text.disabled',
							}}
						>
							<Iconify icon="solar:trash-bin-trash-bold" width={18} />
						</IconButton>
					</Box>
				</Tooltip>
			</Box>

			<ConfirmDialog
				open={suspendDialogOpen}
				onClose={() => setSuspendDialogOpen(false)}
				title={t('suspend-staff-user')}
				content={t('suspend-staff-user-confirm')}
				action={
					<Button
						variant="contained"
						color="warning"
						onClick={() => suspendStaffUser({ userId: user.id })}
						disabled={isSuspending}
					>
						{t('suspend')}
					</Button>
				}
			/>

			<ConfirmDialog
				open={reactivateDialogOpen}
				onClose={() => setReactivateDialogOpen(false)}
				title={t('reactivate-staff-user')}
				content={t('reactivate-staff-user-confirm')}
				action={
					<Button
						variant="contained"
						color="success"
						onClick={() => reactivateStaffUser({ userId: user.id })}
						disabled={isReactivating}
					>
						{t('reactivate')}
					</Button>
				}
			/>

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

type CopyLinkButtonProps = {
	isUserPending: boolean;
	userId: string;
	onClose?: () => void;
	forceShow?: boolean;
};

const CopyLinkButton = ({
	isUserPending,
	userId,
	onClose,
	forceShow = false,
}: CopyLinkButtonProps) => {
	const { t } = useTranslate();

	const {
		data: linkData,
		refetch: fetchVerificationLink,
		isLoading: isLoadingGetVerificationLink,
	} = useGetVerificationLink({
		variables: { userId },
		enabled: false,
	});

	if ((!isUserPending || !ALLOW_COPY_LINK) && !forceShow) {
		return null;
	}

	return (
		<Tooltip
			title={capitalize(t('copy-item', { item: t('verification-link') }))}
			placement="top"
		>
			<IconButton
				color="default"
				size="small"
				loading={isLoadingGetVerificationLink}
				onClick={async () => {
					let link = linkData?.link || 'unable to get verification link';

					if (!linkData) {
						const result = await fetchVerificationLink();

						if (result.error) {
							logger.error('Failed to get verification link', {
								error: result.error,
							});
							toast.error(t('copy-to-clipboard-error'));
							return;
						}

						if (result.data) {
							link = result.data.link || link;
						}
					}

					await navigator.clipboard.writeText(link);
					toast.success(t('copy-to-clipboard-success'));
					onClose?.();
				}}
			>
				<Iconify icon="solar:copy-bold-duotone" width={18} />
			</IconButton>
		</Tooltip>
	);
};

type FollowUpButtonProps = {
	isUserPending: boolean;
	email: string;
	forceShow?: boolean;
};

const FollowUpButton = ({
	isUserPending,
	email,
	forceShow = false,
}: FollowUpButtonProps) => {
	const { t } = useTranslate();

	const {
		mutateAsync: sendEmailVerificationReminder,
		isPending: isPendingSendEmailVerificationReminder,
	} = useSendEmailVerificationReminder({
		onSuccess: () => {
			toast.success(t('email-verification-follow-up-success'));
		},
	});

	if (!isUserPending && !forceShow) {
		return null;
	}

	return (
		<Tooltip
			title={capitalize(t('send-email-verification-follow-up'))}
			placement="top"
		>
			<IconButton
				color="default"
				size="small"
				loading={isPendingSendEmailVerificationReminder}
				onClick={async () => {
					await sendEmailVerificationReminder({ email });
				}}
			>
				<Iconify icon="custom:send-fill" width={18} />
			</IconButton>
		</Tooltip>
	);
};

export default StaffUserRowActions;
