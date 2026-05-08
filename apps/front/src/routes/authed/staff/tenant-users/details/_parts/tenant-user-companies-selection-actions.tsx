import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';

import type { TenantUserCompanyBulkActionResult } from '@org/client-ts/src/models';
import { USER_STATUS_ENUM } from '@org/shared-ts/lib/constants';

import { ConfirmDialog } from '#app/components/custom-dialog/confirm-dialog.tsx';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { toast } from '#app/components/snackbar/index.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { getFailureMessage, toApiFailure } from '#app/lib/api-failure/index.ts';
import {
	useBulkReactivateTenantUserCompanies,
	useBulkRemoveTenantUserCompanies,
	useBulkSuspendTenantUserCompanies,
} from '#app/lib/react-query/features/staff/staff-tenant.hooks.ts';

import { invalidateTenantUserCompanyQueries } from './tenant-user-companies-cache.ts';
import type { TenantUserCompanyData } from './tenant-user-companies-table.types.ts';

const SELECTION_MODE_MENU_MIN_WIDTH = 220;
const GLOBALLY_SUSPENDED_STATUS_VALUE = 'globally_suspended';
const GLOBALLY_SUSPENDED_STATUS_DESCRIPTION = 'GloballySuspended';

type BulkCompanyAction = 'remove' | 'suspend' | 'reactivate';

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
	const [confirmAction, setConfirmAction] = useState<BulkCompanyAction | null>(
		null,
	);
	const isMenuOpen = anchorEl != null;
	const closeMenu = () => {
		setAnchorEl(null);
	};
	// Bulk suspend/reactivate are tenant-membership actions. Globally suspended
	// rows stay selected for export/remove, but are skipped for those actions.
	const eligibleRows = confirmAction
		? getEligibleRows(confirmAction, selectedRows)
		: selectedRows;
	const selectedTenantIds = eligibleRows.map((row) => row.tenantId);
	const skippedCount = selectedRows.length - eligibleRows.length;
	const suspendableCount = getEligibleRows('suspend', selectedRows).length;
	const reactivatableCount = getEligibleRows('reactivate', selectedRows).length;
	const canSuspendSelection = suspendableCount > 0;
	const canReactivateSelection = reactivatableCount > 0;

	const handleBulkSuccess = async (
		action: BulkCompanyAction,
		result: TenantUserCompanyBulkActionResult,
	) => {
		const succeeded = result.succeededCount ?? 0;
		const failed = result.failedCount ?? 0;

		setConfirmAction(null);
		onClearSelection();
		await invalidateTenantUserCompanyQueries({ queryClient, userId });

		if (failed > 0) {
			toast.warning(
				t(getPartialSuccessKey(action), {
					succeeded,
					failed,
				}),
			);
			return;
		}

		toast.success(
			t(getSuccessKey(action), {
				count: succeeded,
			}),
		);
	};

	const handleBulkError = (action: BulkCompanyAction, error: unknown) => {
		toast.error(
			getFailureMessage(toApiFailure(error), {
				fallback: t(getFailureKey(action)),
			}),
		);
	};

	const { mutate: bulkRemove, isPending: isBulkRemoving } =
		useBulkRemoveTenantUserCompanies({
			meta: { skipGlobalErrorHandler: true },
			onSuccess: (result) => {
				void handleBulkSuccess('remove', result);
			},
			onError: (error: unknown) => {
				handleBulkError('remove', error);
			},
		});

	const { mutate: bulkSuspend, isPending: isBulkSuspending } =
		useBulkSuspendTenantUserCompanies({
			meta: { skipGlobalErrorHandler: true },
			onSuccess: (result) => {
				void handleBulkSuccess('suspend', result);
			},
			onError: (error: unknown) => {
				handleBulkError('suspend', error);
			},
		});

	const { mutate: bulkReactivate, isPending: isBulkReactivating } =
		useBulkReactivateTenantUserCompanies({
			meta: { skipGlobalErrorHandler: true },
			onSuccess: (result) => {
				void handleBulkSuccess('reactivate', result);
			},
			onError: (error: unknown) => {
				handleBulkError('reactivate', error);
			},
		});

	const isBulkPending =
		isBulkRemoving || isBulkSuspending || isBulkReactivating;

	const openConfirmDialog = (action: BulkCompanyAction) => {
		if (getEligibleRows(action, selectedRows).length === 0) {
			return;
		}

		closeMenu();
		setConfirmAction(action);
	};

	const handleConfirmBulkAction = () => {
		if (!userId) {
			return;
		}

		if (selectedTenantIds.length === 0) {
			setConfirmAction(null);
			return;
		}

		if (confirmAction === 'remove') {
			bulkRemove({ userId, tenantIds: selectedTenantIds });
			return;
		}

		if (confirmAction === 'suspend') {
			bulkSuspend({ userId, tenantIds: selectedTenantIds });
			return;
		}

		if (confirmAction === 'reactivate') {
			bulkReactivate({ userId, tenantIds: selectedTenantIds });
		}
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
				<Tooltip
					title={
						canSuspendSelection
							? ''
							: t('bulk-suspend-disabled-no-active-organizations')
					}
					placement="left"
					arrow
				>
					<Box component="span">
						<MenuItem
							disabled={!canSuspendSelection}
							onClick={() => {
								openConfirmDialog('suspend');
							}}
						>
							<Iconify icon="solar:stop-circle-bold" width={18} />
							<ListItemText
								primary={t('suspend-selected-organizations')}
								sx={{ ml: 1 }}
							/>
						</MenuItem>
					</Box>
				</Tooltip>
				<Tooltip
					title={
						canReactivateSelection
							? ''
							: t('bulk-reactivate-disabled-no-suspended-organizations')
					}
					placement="left"
					arrow
				>
					<Box component="span">
						<MenuItem
							disabled={!canReactivateSelection}
							onClick={() => {
								openConfirmDialog('reactivate');
							}}
						>
							<Iconify icon="solar:restart-bold" width={18} />
							<ListItemText
								primary={t('reactivate-selected-organizations')}
								sx={{ ml: 1 }}
							/>
						</MenuItem>
					</Box>
				</Tooltip>
				<MenuItem
					onClick={() => {
						openConfirmDialog('remove');
					}}
				>
					<Iconify icon="solar:trash-bin-trash-bold" width={18} />
					<ListItemText
						primary={t('remove-selected-organizations')}
						sx={{ ml: 1 }}
					/>
				</MenuItem>
			</Menu>

			<ConfirmDialog
				open={confirmAction != null}
				onClose={() => setConfirmAction(null)}
				title={confirmAction ? t(getTitleKey(confirmAction)) : ''}
				content={
					confirmAction
						? [
								t(getContentKey(confirmAction), {
									count: eligibleRows.length,
								}),
								skippedCount > 0
									? t('bulk-tenant-user-companies-skipped', {
											skipped: skippedCount,
										})
									: null,
							]
								.filter(Boolean)
								.join(' ')
						: ''
				}
				action={
					<Button
						variant="contained"
						color="inherit"
						onClick={handleConfirmBulkAction}
						disabled={isBulkPending}
					>
						{confirmAction ? t(getActionLabelKey(confirmAction)) : t('confirm')}
					</Button>
				}
			/>
		</>
	);
};

export default TenantUserCompaniesSelectionActions;

const getTitleKey = (action: BulkCompanyAction) => {
	if (action === 'suspend') {
		return 'suspend-selected-organizations';
	}
	if (action === 'reactivate') {
		return 'reactivate-selected-organizations';
	}
	return 'remove-selected-organizations';
};

const getContentKey = (action: BulkCompanyAction) => {
	if (action === 'suspend') {
		return 'confirm-bulk-suspend-tenant-user-companies';
	}
	if (action === 'reactivate') {
		return 'confirm-bulk-reactivate-tenant-user-companies';
	}
	return 'confirm-bulk-remove-tenant-user-companies';
};

const getActionLabelKey = (action: BulkCompanyAction) => {
	if (action === 'suspend') {
		return 'suspend';
	}
	if (action === 'reactivate') {
		return 'reactivate';
	}
	return 'remove';
};

const getSuccessKey = (action: BulkCompanyAction) => {
	if (action === 'suspend') {
		return 'tenant-user-company-bulk-suspend-success';
	}
	if (action === 'reactivate') {
		return 'tenant-user-company-bulk-reactivate-success';
	}
	return 'tenant-user-company-bulk-remove-success';
};

const getPartialSuccessKey = (action: BulkCompanyAction) => {
	if (action === 'suspend') {
		return 'tenant-user-company-bulk-suspend-partial-success';
	}
	if (action === 'reactivate') {
		return 'tenant-user-company-bulk-reactivate-partial-success';
	}
	return 'tenant-user-company-bulk-remove-partial-success';
};

const getFailureKey = (action: BulkCompanyAction) => {
	if (action === 'suspend') {
		return 'tenant-user-company-bulk-suspend-failure';
	}
	if (action === 'reactivate') {
		return 'tenant-user-company-bulk-reactivate-failure';
	}
	return 'tenant-user-company-bulk-remove-failure';
};

const isGloballySuspendedStatus = (status: string | undefined) => {
	return (
		status === GLOBALLY_SUSPENDED_STATUS_VALUE ||
		status === GLOBALLY_SUSPENDED_STATUS_DESCRIPTION
	);
};

const getEligibleRows = (
	action: BulkCompanyAction,
	rows: TenantUserCompanyData[],
) => {
	if (action === 'remove') {
		return rows;
	}

	if (action === 'suspend') {
		return rows.filter(
			(row) =>
				row.status === USER_STATUS_ENUM.ACTIVE &&
				!isGloballySuspendedStatus(row.status),
		);
	}

	return rows.filter(
		(row) =>
			row.status === USER_STATUS_ENUM.SUSPENDED &&
			!isGloballySuspendedStatus(row.status),
	);
};
