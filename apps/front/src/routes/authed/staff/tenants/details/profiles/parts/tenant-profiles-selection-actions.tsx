import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

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
import TenantProfilesCompareDrawer from './tenant-profiles-compare-drawer.tsx';

const SELECTION_MODE_MENU_MIN_WIDTH = 220;

type TenantProfilesSelectionActionsProps = {
	tenantId: string;
	selectedRows: TenantProfileRowData[];
	onExportSelected: () => void;
	onClearSelection: () => void;
	onKeepSelectedRows: (profileIds: string[]) => void;
};

const TenantProfilesSelectionActions = ({
	tenantId,
	selectedRows,
	onExportSelected,
	onClearSelection,
	onKeepSelectedRows,
}: TenantProfilesSelectionActionsProps) => {
	const { t } = useTranslate();
	const queryClient = useQueryClient();
	const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
	const [confirmBulkDeleteOpen, setConfirmBulkDeleteOpen] = useState(false);
	const [compareDrawerOpen, setCompareDrawerOpen] = useState(false);
	const [comparedProfileIds, setComparedProfileIds] = useState<string[]>([]);
	const isMenuOpen = anchorEl != null;
	const selectedCount = selectedRows.length;
	const canCompare = selectedCount === 2 || selectedCount === 3;
	const hasDefaultSelected = selectedRows.some((row) => row.isDefault);
	const bulkDeleteBlockedReason = t(
		'tenant-profile-default-delete-not-allowed',
		{
			ns: 'response-message',
		},
	);
	let compareDisabledReason = '';

	if (selectedCount < 2) {
		compareDisabledReason = t('compare-selected-disabled-min');
	}

	if (selectedCount > 3) {
		compareDisabledReason = t('compare-selected-disabled-max');
	}

	const { mutateAsync: deleteProfile, isPending: isBulkDeleting } =
		useDeleteTenantProfile({
			meta: { skipGlobalErrorHandler: true },
		});

	const closeMenu = () => {
		setAnchorEl(null);
	};
	const handleOpenCompareDrawer = () => {
		// Snapshot the current selection before closing the menu so the compare
		// drawer does not depend on the menu subtree staying mounted.
		setComparedProfileIds(selectedRows.map((row) => row.id));
		closeMenu();
		setCompareDrawerOpen(true);
	};
	const handleCloseCompareDrawer = () => {
		setCompareDrawerOpen(false);
		setComparedProfileIds([]);
	};

	const handleConfirmBulkDelete = async () => {
		if (hasDefaultSelected) {
			return;
		}

		let firstFailureMessage: string | undefined;
		const failedProfileIds: string[] = [];
		const succeededProfileIds: string[] = [];

		for (const row of selectedRows) {
			try {
				// Bulk delete currently falls back to the existing single-delete route.
				// Keep it sequential so a failure does not prevent later rows from running.
				// eslint_disable-next-line no-await-in-loop
				await deleteProfile({
					tenantId,
					profileId: row.id,
				});
				succeededProfileIds.push(row.id);
			} catch (error) {
				failedProfileIds.push(row.id);

				if (firstFailureMessage == null) {
					firstFailureMessage = getFailureMessage(toApiFailure(error), {
						fallback: t('tenant-profile-bulk-delete-failure'),
					});
				}
			}
		}

		setConfirmBulkDeleteOpen(false);

		if (succeededProfileIds.length > 0) {
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: useFindTenantProfiles.getKey({ tenantId }),
				}),
				...succeededProfileIds.map((profileId) => {
					return queryClient.invalidateQueries({
						queryKey: useGetTenantProfileById.getKey({
							tenantId,
							profileId,
						}),
					});
				}),
				...succeededProfileIds.map((profileId) => {
					return queryClient.invalidateQueries({
						queryKey: useFindTenantProfilePermissions.getKey({
							tenantId,
							profileId,
						}),
					});
				}),
			]);
		}

		if (failedProfileIds.length > 0 && succeededProfileIds.length === 0) {
			toast.error(
				firstFailureMessage || t('tenant-profile-bulk-delete-failure'),
			);
			return;
		}

		if (failedProfileIds.length > 0) {
			onKeepSelectedRows(failedProfileIds);
			toast.warning(
				t('tenant-profile-bulk-delete-partial-success', {
					succeeded: succeededProfileIds.length,
					failed: failedProfileIds.length,
				}),
			);
			return;
		}

		onClearSelection();
		toast.success(
			t('tenant-profile-bulk-delete-success', {
				count: succeededProfileIds.length,
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
				<Tooltip
					title={canCompare ? '' : compareDisabledReason}
					placement="left"
					arrow
					disableHoverListener={canCompare}
				>
					<Box component="span">
						<MenuItem disabled={!canCompare} onClick={handleOpenCompareDrawer}>
							<Iconify icon="carbon:chevron-sort" width={18} />
							<ListItemText primary={t('compare-selected')} sx={{ ml: 1 }} />
						</MenuItem>
					</Box>
				</Tooltip>

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
					title={hasDefaultSelected ? bulkDeleteBlockedReason : ''}
					placement="left"
					arrow
					disableHoverListener={!hasDefaultSelected}
				>
					<Box component="span">
						<MenuItem
							disabled={hasDefaultSelected}
							onClick={() => {
								closeMenu();
								setConfirmBulkDeleteOpen(true);
							}}
							sx={{ color: 'error.main' }}
						>
							<Iconify icon="solar:trash-bin-trash-bold" width={18} />
							<ListItemText primary={t('bulk-delete')} sx={{ ml: 1 }} />
						</MenuItem>
					</Box>
				</Tooltip>
			</Menu>

			<TenantProfilesCompareDrawer
				tenantId={tenantId}
				selectedProfileIds={comparedProfileIds}
				open={compareDrawerOpen}
				onClose={handleCloseCompareDrawer}
			/>

			<ConfirmDialog
				open={confirmBulkDeleteOpen}
				onClose={() => setConfirmBulkDeleteOpen(false)}
				title={t('delete-item', {
					item: t('profiles'),
					ns: 'response-message',
				})}
				content={t('tenant-profile-bulk-delete-confirm', {
					count: selectedRows.length,
				})}
				action={
					<Button
						variant="contained"
						color="error"
						onClick={handleConfirmBulkDelete}
						disabled={isBulkDeleting || hasDefaultSelected}
					>
						{t('delete')}
					</Button>
				}
			/>
		</>
	);
};

export default TenantProfilesSelectionActions;
