import IconButton from '@mui/material/IconButton';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import type { MouseEvent } from 'react';

import { BULK_ACTION_MAX_COUNT } from '@org/shared-ts/lib/constants';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { toast } from '#app/components/snackbar/index.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';

const SELECTION_MODE_MENU_MIN_WIDTH = 240;

type StaffInvitationsSelectionActionsProps = {
	anchorEl: HTMLElement | null;
	eligibleBulkRevokeCount: number;
	selectedCount: number;
	isOpen: boolean;
	onOpenMenu: (event: MouseEvent<HTMLButtonElement>) => void;
	onCloseMenu: () => void;
	onOpenExportDialog: () => void;
	onOpenBulkRevokeDialog: () => void;
};

export const StaffInvitationsSelectionActions = ({
	anchorEl,
	eligibleBulkRevokeCount,
	selectedCount,
	isOpen,
	onOpenMenu,
	onCloseMenu,
	onOpenExportDialog,
	onOpenBulkRevokeDialog,
}: StaffInvitationsSelectionActionsProps) => {
	const { t } = useTranslate();
	const isOverLimit = selectedCount > BULK_ACTION_MAX_COUNT;
	const overLimitMessage = t('bulk-action-max-count-exceeded', {
		max: BULK_ACTION_MAX_COUNT,
		count: selectedCount,
	});

	return (
		<>
			<Tooltip
				title={isOverLimit ? overLimitMessage : t('more-actions')}
				placement="top"
				arrow
			>
				<span>
					<IconButton
						size="small"
						aria-label={isOverLimit ? overLimitMessage : t('more-actions')}
						onClick={onOpenMenu}
						disabled={isOverLimit}
						sx={{ width: 32, height: 32 }}
					>
						<Iconify icon="eva:more-vertical-fill" width={18} />
					</IconButton>
				</span>
			</Tooltip>
			<Menu
				anchorEl={anchorEl}
				open={isOpen}
				onClose={onCloseMenu}
				anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
				transformOrigin={{ vertical: 'top', horizontal: 'right' }}
				slotProps={{
					paper: {
						sx: {
							minWidth: SELECTION_MODE_MENU_MIN_WIDTH,
						},
					},
				}}
			>
				<MenuItem onClick={onOpenExportDialog}>
					<Iconify icon="solar:download-bold" width={18} />
					<ListItemText primary={t('export-selected')} sx={{ ml: 1 }} />
				</MenuItem>
				<MenuItem
					onClick={() => {
						if (eligibleBulkRevokeCount === 0) {
							onCloseMenu();
							toast.warning(t('only-pending-invitations-can-be-revoked'));
							return;
						}

						onOpenBulkRevokeDialog();
					}}
					sx={{ color: 'error.main' }}
				>
					<Iconify icon="solar:close-circle-bold" width={18} />
					<ListItemText primary={t('revoke-selected')} sx={{ ml: 1 }} />
				</MenuItem>
			</Menu>
		</>
	);
};
