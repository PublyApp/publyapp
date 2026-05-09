import IconButton from '@mui/material/IconButton';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import type { MouseEvent } from 'react';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';

const SELECTION_MODE_MENU_MIN_WIDTH = 240;

type StaffInvitationsSelectionActionsProps = {
	anchorEl: HTMLElement | null;
	eligibleBulkRevokeCount: number;
	isOpen: boolean;
	onOpenMenu: (event: MouseEvent<HTMLButtonElement>) => void;
	onCloseMenu: () => void;
	onOpenExportDialog: () => void;
	onOpenBulkRevokeDialog: () => void;
};

export const StaffInvitationsSelectionActions = ({
	anchorEl,
	eligibleBulkRevokeCount,
	isOpen,
	onOpenMenu,
	onCloseMenu,
	onOpenExportDialog,
	onOpenBulkRevokeDialog,
}: StaffInvitationsSelectionActionsProps) => {
	const { t } = useTranslate();

	return (
		<>
			<Tooltip title={t('more-actions')} placement="top" arrow>
				<IconButton
					size="small"
					aria-label={t('more-actions')}
					onClick={onOpenMenu}
					sx={{ width: 32, height: 32 }}
				>
					<Iconify icon="eva:more-vertical-fill" width={18} />
				</IconButton>
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
				{eligibleBulkRevokeCount > 0 && (
					<MenuItem
						onClick={onOpenBulkRevokeDialog}
						sx={{ color: 'error.main' }}
					>
						<Iconify icon="solar:close-circle-bold" width={18} />
						<ListItemText primary={t('revoke-selected')} sx={{ ml: 1 }} />
					</MenuItem>
				)}
			</Menu>
		</>
	);
};
