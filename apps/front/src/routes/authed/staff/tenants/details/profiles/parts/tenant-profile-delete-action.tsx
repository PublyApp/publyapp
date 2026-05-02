import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { useQueryClient } from '@tanstack/react-query';
import { useBoolean } from 'minimal-shared/hooks';

import { ConfirmDialog } from '#app/components/custom-dialog/confirm-dialog.tsx';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { toast } from '#app/components/snackbar/index.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { getFailureMessage, toApiFailure } from '#app/lib/api-failure/index.ts';
import {
	useDeleteTenantProfile,
	useFindTenantProfilePermissions,
	useFindTenantProfiles,
	useGetTenantProfileById,
} from '#app/lib/react-query/features/staff/staff-tenant.hooks.ts';

import type { TenantProfileRowData } from './tenant-profiles-table.types.ts';

type TenantProfileDeleteActionProps = {
	tenantId: string;
	profile: TenantProfileRowData;
};

const TenantProfileDeleteAction = ({
	tenantId,
	profile,
}: TenantProfileDeleteActionProps) => {
	const { t } = useTranslate();
	const queryClient = useQueryClient();
	const confirmDialog = useBoolean();
	const disabledReason = t('tenant-profile-default-delete-not-allowed', {
		ns: 'response-message',
	});
	const { mutate: deleteProfile, isPending: isDeleting } =
		useDeleteTenantProfile({
			meta: { skipGlobalErrorHandler: true },
			onSuccess: () => {
				confirmDialog.onFalse();
				toast.success(
					t('tenant-profile-deleted-success', { ns: 'response-message' }),
				);
				void Promise.all([
					queryClient.invalidateQueries({
						queryKey: useFindTenantProfiles.getKey({ tenantId }),
					}),
					queryClient.invalidateQueries({
						queryKey: useGetTenantProfileById.getKey({
							tenantId,
							profileId: profile.id,
						}),
					}),
					queryClient.invalidateQueries({
						queryKey: useFindTenantProfilePermissions.getKey({
							tenantId,
							profileId: profile.id,
						}),
					}),
				]);
			},
			onError: (error) => {
				toast.error(
					getFailureMessage(toApiFailure(error), {
						fallback: t('something-went-wrong'),
					}),
				);
			},
		});

	const canDelete = !profile.isDefault && profile.id.length > 0;

	const handleConfirmDelete = () => {
		if (!canDelete) {
			return;
		}

		deleteProfile({
			tenantId,
			profileId: profile.id,
		});
	};

	return (
		<>
			<Tooltip
				title={canDelete ? t('delete') : disabledReason}
				placement="top"
				arrow
				describeChild
				disableHoverListener={canDelete}
			>
				<Box
					component="span"
					tabIndex={canDelete ? -1 : 0}
					role={canDelete ? undefined : 'button'}
					aria-disabled={canDelete ? undefined : 'true'}
					aria-label={canDelete ? undefined : disabledReason}
					sx={(theme) => {
						return {
							display: 'inline-flex',
							borderRadius: 1,
							'&:focus-visible': canDelete
								? undefined
								: {
										outline: `2px solid ${theme.palette.primary.main}`,
										outlineOffset: 2,
									},
						};
					}}
				>
					<IconButton
						color="default"
						size="small"
						onClick={canDelete ? confirmDialog.onTrue : undefined}
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
				open={confirmDialog.value}
				onClose={confirmDialog.onFalse}
				title={t('delete-item', {
					item: t('profile'),
					ns: 'response-message',
				})}
				content={t('confirm-delete-dialog-text', { ns: 'response-message' })}
				action={
					<Button
						variant="contained"
						color="error"
						onClick={handleConfirmDelete}
						disabled={isDeleting}
					>
						{t('delete')}
					</Button>
				}
			/>
		</>
	);
};

export default TenantProfileDeleteAction;
