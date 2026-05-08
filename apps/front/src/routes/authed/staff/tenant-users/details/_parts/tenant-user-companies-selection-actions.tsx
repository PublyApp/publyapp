import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';

import { ConfirmDialog } from '#app/components/custom-dialog/confirm-dialog.tsx';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { toast } from '#app/components/snackbar/index.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { getFailureMessage, toApiFailure } from '#app/lib/api-failure/index.ts';
import { useRemoveTenantUser } from '#app/lib/react-query/features/staff/staff-tenant.hooks.ts';

import { invalidateTenantUserCompanyQueries } from './tenant-user-companies-cache.ts';
import type { TenantUserCompanyData } from './tenant-user-companies-table.types.ts';

const SELECTION_MODE_MENU_MIN_WIDTH = 220;

type TenantUserCompaniesSelectionActionsProps = {
	selectedRows: TenantUserCompanyData[];
	onExportSelected: () => void;
	onClearSelection: () => void;
};

const TenantUserCompaniesSelectionActions = ({
	selectedRows,
	onExportSelected,
	onClearSelection,
}: TenantUserCompaniesSelectionActionsProps) => {
	const { t } = useTranslate();
	const { userId = '' } = useParams();
	const queryClient = useQueryClient();
	const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
	const [confirmBulkRemoveOpen, setConfirmBulkRemoveOpen] = useState(false);
	const isMenuOpen = anchorEl != null;
	const closeMenu = () => {
		setAnchorEl(null);
	};

	const { mutateAsync: removeTenantUserAsync, isPending: isBulkRemoving } =
		useRemoveTenantUser({
			meta: { skipGlobalErrorHandler: true },
		});

	const handleConfirmBulkRemove = async () => {
		if (!userId) {
			return;
		}

		const results = await Promise.all(
			selectedRows.map(async (row) => {
				try {
					await removeTenantUserAsync({
						tenantId: row.tenantId,
						userId,
					});
					return { succeeded: true as const };
				} catch (error) {
					return {
						succeeded: false as const,
						message: getFailureMessage(toApiFailure(error), {
							fallback: t('tenant-user-company-bulk-remove-failure'),
						}),
					};
				}
			}),
		);

		const failedResults = results.filter((result) => !result.succeeded);
		const succeeded = results.length - failedResults.length;
		const failed = failedResults.length;
		const firstFailureMessage = failedResults[0]?.message;

		setConfirmBulkRemoveOpen(false);
		onClearSelection();
		await invalidateTenantUserCompanyQueries({ queryClient, userId });

		if (succeeded === 0 && failed > 0) {
			toast.error(
				firstFailureMessage || t('tenant-user-company-bulk-remove-failure'),
			);
			return;
		}

		if (failed > 0) {
			toast.warning(
				t('tenant-user-company-bulk-remove-partial-success', {
					succeeded,
					failed,
				}),
			);
			return;
		}

		toast.success(
			t('tenant-user-company-bulk-remove-success', {
				count: succeeded,
			}),
		);
	};

	return (
		<>
			<Tooltip title={t('actions')} placement="top" arrow>
				<IconButton
					size="small"
					onClick={(event) => setAnchorEl(event.currentTarget)}
					sx={{ width: 32, height: 32 }}
				>
					<Iconify icon="eva:more-vertical-fill" width={18} />
				</IconButton>
			</Tooltip>

			<Menu
				anchorEl={anchorEl}
				open={isMenuOpen}
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
						onExportSelected();
					}}
				>
					<Iconify icon="solar:download-bold" width={18} />
					<ListItemText primary={t('export-selected')} sx={{ ml: 1 }} />
				</MenuItem>
				<MenuItem
					onClick={() => {
						closeMenu();
						setConfirmBulkRemoveOpen(true);
					}}
					sx={{ color: 'text.secondary' }}
				>
					<Iconify icon="solar:trash-bin-trash-bold" width={18} />
					<ListItemText
						primary={t('remove-selected-organizations')}
						sx={{ ml: 1 }}
					/>
				</MenuItem>
			</Menu>

			<ConfirmDialog
				open={confirmBulkRemoveOpen}
				onClose={() => setConfirmBulkRemoveOpen(false)}
				title={t('remove-selected-organizations')}
				content={t('confirm-bulk-remove-tenant-user-companies', {
					count: selectedRows.length,
				})}
				action={
					<Button
						variant="contained"
						color="inherit"
						onClick={handleConfirmBulkRemove}
						disabled={isBulkRemoving}
					>
						{t('remove')}
					</Button>
				}
			/>
		</>
	);
};

export default TenantUserCompaniesSelectionActions;
