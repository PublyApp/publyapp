import IconButton from '@mui/material/IconButton';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useState } from 'react';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';

import type { StaffUsersBulkActionType } from './use-staff-users-bulk-actions.ts';

const SELECTION_MODE_MENU_MIN_WIDTH = 220;

type StaffUsersSelectionActionsProps = {
	onOpenExportDialog: () => void;
	onOpenBulkActionDialog: (type: StaffUsersBulkActionType) => void;
};

const StaffUsersSelectionActions = ({
	onOpenExportDialog,
	onOpenBulkActionDialog,
}: StaffUsersSelectionActionsProps) => {
	const { t } = useTranslate();
	const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
	const open = Boolean(anchorEl);

	const closeMenu = () => setAnchorEl(null);

	return (
		<>
			<IconButton
				size="small"
				onClick={(event) => setAnchorEl(event.currentTarget)}
				sx={{ width: 32, height: 32 }}
			>
				<Iconify icon="eva:more-vertical-fill" width={18} />
			</IconButton>

			<Menu
				anchorEl={anchorEl}
				open={open}
				onClose={closeMenu}
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
				<MenuItem
					onClick={() => {
						closeMenu();
						onOpenExportDialog();
					}}
				>
					<Iconify icon="solar:download-bold" width={18} />
					<ListItemText
						primary={t('export-selected', {
							defaultValue: 'Export selected',
						})}
						sx={{ ml: 1 }}
					/>
				</MenuItem>

				<MenuItem
					onClick={() => {
						closeMenu();
						onOpenBulkActionDialog('suspend');
					}}
				>
					<Iconify icon="solar:forbidden-circle-bold" width={18} />
					<ListItemText primary={t('bulk-suspend')} sx={{ ml: 1 }} />
				</MenuItem>

				<MenuItem
					onClick={() => {
						closeMenu();
						onOpenBulkActionDialog('reactivate');
					}}
				>
					<Iconify icon="solar:play-circle-bold" width={18} />
					<ListItemText primary={t('bulk-reactivate')} sx={{ ml: 1 }} />
				</MenuItem>

				<MenuItem
					onClick={() => {
						closeMenu();
						onOpenBulkActionDialog('delete');
					}}
					sx={{ color: 'error.main' }}
				>
					<Iconify icon="solar:trash-bin-trash-bold" width={18} />
					<ListItemText primary={t('bulk-delete')} sx={{ ml: 1 }} />
				</MenuItem>
			</Menu>
		</>
	);
};

export default StaffUsersSelectionActions;
