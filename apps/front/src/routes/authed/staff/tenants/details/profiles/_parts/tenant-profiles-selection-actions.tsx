import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { BULK_ACTION_MAX_COUNT } from '@org/shared-ts/lib/constants';

import { ConfirmDialog } from '#app/components/custom-dialog/confirm-dialog.tsx';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { toast } from '#app/components/snackbar/index.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { getFailureMessage, toApiFailure } from '#app/lib/api-failure/index.ts';
import {
	useBulkDeleteTenantProfiles,
	useFindTenantProfilePermissions,
	useFindTenantProfiles,
	useGetTenantProfileById,
} from '#app/lib/react-query/features/staff/staff-tenant.hooks.ts';

import TenantProfilesCompareDrawer from './tenant-profiles-compare-drawer.tsx';
import type { TenantProfileRowData } from './tenant-profiles-table.types.ts';

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
	const isOverLimit = selectedCount > BULK_ACTION_MAX_COUNT;
	const overLimitMessage = t('bulk-action-max-count-exceeded', {
		max: BULK_ACTION_MAX_COUNT,
		count: selectedCount,
	});
	const compareDisabledReason =
		selectedCount > 3
			? t('compare-selected-disabled-max')
			: t('compare-selected-disabled-min');

	const { mutateAsync: bulkDeleteProfiles, isPending: isBulkDeleting } =
		useBulkDeleteTenantProfiles({
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

		// Call the tenant bulk delete endpoint once for all selected profile IDs.
		const selectedProfileIds = selectedRows.map((row) => row.id);
		let result: Awaited<ReturnType<typeof bulkDeleteProfiles>>;
		try {
			result = await bulkDeleteProfiles({
				tenantId,
				profileIds: selectedProfileIds,
			});
		} catch (error) {
			setConfirmBulkDeleteOpen(false);
			toast.error(
				getFailureMessage(toApiFailure(error), {
					fallback: t('tenant-profile-bulk-delete-failure'),
				}),
			);
			return;
		}

		const failedProfileIds = (result.failedItems ?? [])
			.map((item) => item.profileId)
			.filter((id): id is string => id != null && id !== '');
		const failedProfileIdSet = new Set(failedProfileIds);
		const succeededProfileIds = selectedProfileIds.filter(
			(profileId) => !failedProfileIdSet.has(profileId),
		);
		const succeeded = succeededProfileIds.length;
		const failed = result.failedCount ?? 0;

		setConfirmBulkDeleteOpen(false);

		if (succeededProfileIds.length > 0) {
			// Refresh list and only the per-profile detail/query caches that actually changed.
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

		if (failed > 0 && succeeded === 0) {
			// Keep the full set selected so the user can retry after a full failure.
			onKeepSelectedRows(selectedProfileIds);
			toast.error(t('tenant-profile-bulk-delete-failure'));
			return;
		}

		if (failed > 0) {
			// Keep only failed rows selected so retries are limited to unresolved items.
			onKeepSelectedRows(failedProfileIds);
			toast.warning(
				t('tenant-profile-bulk-delete-partial-success', {
					succeeded,
					failed,
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
			<Tooltip
				title={isOverLimit ? overLimitMessage : t('actions')}
				placement="top"
				arrow
			>
				<span>
					<IconButton
						size="small"
						aria-label={isOverLimit ? overLimitMessage : t('actions')}
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
						if (!canCompare) {
							closeMenu();
							toast.warning(compareDisabledReason);
							return;
						}

						handleOpenCompareDrawer();
					}}
				>
					<Iconify icon="carbon:chevron-sort" width={18} />
					<ListItemText primary={t('compare-selected')} sx={{ ml: 1 }} />
				</MenuItem>

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

						if (hasDefaultSelected) {
							toast.warning(
								t('tenant-profile-default-delete-not-allowed', {
									ns: 'response-message',
								}),
							);
							return;
						}

						setConfirmBulkDeleteOpen(true);
					}}
					sx={{ color: 'error.main' }}
				>
					<Iconify icon="solar:trash-bin-trash-bold" width={18} />
					<ListItemText primary={t('bulk-delete')} sx={{ ml: 1 }} />
				</MenuItem>
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
