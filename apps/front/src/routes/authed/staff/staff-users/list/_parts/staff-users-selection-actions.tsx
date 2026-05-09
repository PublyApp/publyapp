import IconButton from '@mui/material/IconButton';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import { useState } from 'react';

import { BULK_ACTION_MAX_COUNT } from '@org/shared-ts/lib/constants';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { toast } from '#app/components/snackbar/index.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';

import type { StaffUsersBulkActionType } from './use-staff-users-bulk-actions.ts';

const SELECTION_MODE_MENU_MIN_WIDTH = 220;

type StaffUsersSelectionActionsProps = {
	canSuspend: boolean;
	canReactivate: boolean;
	canDelete: boolean;
	selectedCount: number;
	onOpenExportDialog: () => void;
	onOpenBulkActionDialog: (type: StaffUsersBulkActionType) => void;
};

const StaffUsersSelectionActions = ({
	canSuspend,
	canReactivate,
	canDelete,
	selectedCount,
	onOpenExportDialog,
	onOpenBulkActionDialog,
}: StaffUsersSelectionActionsProps) => {
	const { t } = useTranslate();
	const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
	const open = Boolean(anchorEl);
	const isOverLimit = selectedCount > BULK_ACTION_MAX_COUNT;
	const overLimitMessage = t('bulk-action-max-count-exceeded', {
		max: BULK_ACTION_MAX_COUNT,
		count: selectedCount,
	});

	const closeMenu = () => setAnchorEl(null);

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
						onClick={(event) => setAnchorEl(event.currentTarget)}
						disabled={isOverLimit}
						sx={{ width: 32, height: 32 }}
					>
						<Iconify icon="eva:more-vertical-fill" width={18} />
					</IconButton>
				</span>
			</Tooltip>

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
					<ListItemText primary={t('export-selected')} sx={{ ml: 1 }} />
				</MenuItem>

				<MenuItem
					onClick={() => {
						closeMenu();

						if (!canSuspend) {
							toast.warning(t('bulk-suspend-disabled-no-active-users'));
							return;
						}

						onOpenBulkActionDialog('suspend');
					}}
				>
					<Iconify icon="solar:forbidden-circle-bold" width={18} />
					<ListItemText primary={t('bulk-suspend')} sx={{ ml: 1 }} />
				</MenuItem>

				<MenuItem
					onClick={() => {
						closeMenu();

						if (!canReactivate) {
							toast.warning(t('bulk-reactivate-disabled-no-suspended-users'));
							return;
						}

						onOpenBulkActionDialog('reactivate');
					}}
				>
					<Iconify icon="solar:play-circle-bold" width={18} />
					<ListItemText primary={t('bulk-reactivate')} sx={{ ml: 1 }} />
				</MenuItem>

				<MenuItem
					onClick={() => {
						closeMenu();

						if (!canDelete) {
							toast.warning(t('bulk-delete-disabled-until-all-suspended'));
							return;
						}

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
