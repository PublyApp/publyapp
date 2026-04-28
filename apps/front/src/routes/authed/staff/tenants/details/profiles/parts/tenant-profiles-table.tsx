import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import capitalize from 'lodash/capitalize';
import {
	createMRTColumnHelper,
	MaterialReactTable,
	type MRT_ColumnDef,
	type MRT_TableOptions,
} from 'material-react-table';
import { useMemo, useRef } from 'react';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { Label } from '#app/components/label/label.tsx';
import { useMRTTable } from '#app/hooks/use-mrt-table.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';

import TenantProfileDeleteAction from './tenant-profile-delete-action.tsx';
import TenantProfileEditAction from './tenant-profile-edit-action.tsx';
import TenantProfilesExportDialogController, {
	type TenantProfilesExportDialogControllerRef,
} from './tenant-profiles-export-dialog-controller.tsx';
import TenantProfilesSelectionActions from './tenant-profiles-selection-actions.tsx';
import type { TenantProfileRowData } from './tenant-profiles-table.types.ts';
import useTenantProfilesTableController from './use-tenant-profiles-table-controller.ts';

const columnHelper = createMRTColumnHelper<TenantProfileRowData>();

type TenantProfilesTableProps = {
	tenantId: string;
};

const TenantProfilesTable = ({ tenantId }: TenantProfilesTableProps) => {
	const { t } = useTranslate();
	const exportDialogRef =
		useRef<TenantProfilesExportDialogControllerRef | null>(null);
	const {
		handleCursorPaginationChange,
		handleSortingChange,
		hasNextPage,
		hasPreviousPage,
		isSelectionMode,
		profilesQuery,
		queryState,
		renderEmptyRowsFallback,
		rowSelection,
		rows,
		searchValue,
		selectedCount,
		selectedRows,
		selectionModeDisabledReason,
		setRowSelection,
		setSearchValue,
		sortTooltipLocalization,
		sortingDisabledReason,
		tableState,
	} = useTenantProfilesTableController(tenantId);

	const columns = useMemo(() => {
		return [
			columnHelper.accessor('name', {
				header: capitalize(t('profile')),
				Cell: ProfileNameCell,
				size: 280,
			}),
			columnHelper.accessor('description', {
				header: t('description'),
				enableSorting: false,
				Cell: DescriptionCell,
				size: 360,
			}),
			columnHelper.accessor('userAccountCount', {
				id: 'user_account_count',
				header: t('user-accounts'),
				Cell: UserAccountCountCell,
				size: 120,
				muiTableHeadCellProps: {
					align: 'center',
				},
				muiTableBodyCellProps: {
					align: 'center',
				},
			}),
			columnHelper.display({
				id: 'actions',
				header: t('actions'),
				Cell: (props) => {
					return (
						<ProfileActionsCell
							tenantId={tenantId}
							profile={props.row.original}
						/>
					);
				},
				size: 120,
			}),
		];
	}, [t, tenantId]);

	const table = useMRTTable('minimal-cursor', {
		columns,
		data: rows,
		enableRowSelection: true,
		manualSorting: true,
		localization: sortTooltipLocalization,
		manualPagination: true,
		getRowId: (row) => row.id,
		onRowSelectionChange: (updater) => {
			setRowSelection((prev) => {
				return typeof updater === 'function' ? updater(prev) : updater;
			});
		},
		onSortingChange: (updater) => {
			// Lock query-shaping controls while rows are selected so the user does not
			// accidentally page/filter away the current bulk-action target set.
			if (isSelectionMode) {
				return;
			}

			handleSortingChange(updater);
		},
		state: {
			...tableState,
			...queryState,
			density: 'compact',
			rowSelection,
		},
		muiTableHeadCellProps: ({ column }) => {
			if (!column.getCanSort()) {
				return {};
			}

			if (!isSelectionMode) {
				return {
					title: undefined,
				};
			}

			return {
				title: sortingDisabledReason,
				sx: {
					'& .MuiTableSortLabel-root': {
						cursor: 'not-allowed',
						pointerEvents: 'none',
						opacity: 0.56,
					},
					'& .MuiTableSortLabel-icon': {
						opacity: '1 !important',
					},
				},
			} satisfies MRT_TableOptions<TenantProfileRowData>['muiTableHeadCellProps'];
		},
		muiTablePaperProps: {
			sx: {
				flexGrow: 1,
			},
		},
		meta: {
			handlePaginationChange: handleCursorPaginationChange,
			hasNextPage,
			hasPreviousPage,
			isPending: profilesQuery.isPending,
			disablePaginationControls: isSelectionMode,
			renderToolbarFilters: () => {
				return (
					<Tooltip
						title={isSelectionMode ? selectionModeDisabledReason : ''}
						arrow
						disableHoverListener={!isSelectionMode}
						describeChild
					>
						<Box component="span">
							<TextField
								size="small"
								placeholder={t('search')}
								value={searchValue}
								onChange={(event) => setSearchValue(event.target.value)}
								disabled={isSelectionMode}
								sx={{ minWidth: 320 }}
								slotProps={{
									input: {
										startAdornment: (
											<InputAdornment position="start">
												<Iconify icon="eva:search-fill" />
											</InputAdornment>
										),
										'aria-label': t('search'),
									},
								}}
							/>
						</Box>
					</Tooltip>
				);
			},
			renderExportActions: () => {
				return (
					<Button
						size="small"
						variant="outlined"
						onClick={() => exportDialogRef.current?.open()}
						startIcon={<Iconify icon="solar:download-bold" />}
					>
						{t('export')}
					</Button>
				);
			},
			renderSelectionActions: () => {
				return (
					<TenantProfilesSelectionActions
						tenantId={tenantId}
						selectedRows={selectedRows}
						onExportSelected={() => exportDialogRef.current?.open()}
						onClearSelection={() => setRowSelection({})}
						onKeepSelectedRows={(profileIds) => {
							setRowSelection(
								Object.fromEntries(
									profileIds.map((profileId) => [profileId, true]),
								),
							);
						}}
					/>
				);
			},
		},
		renderEmptyRowsFallback,
	});

	return (
		<Box
			sx={{
				flexGrow: 1,
				display: 'flex',
				flexDirection: 'column',
			}}
		>
			<MaterialReactTable table={table} />

			<TenantProfilesExportDialogController
				ref={exportDialogRef}
				isSelectionMode={isSelectionMode}
				selectedCount={selectedCount}
				rows={rows}
				selectedRows={selectedRows}
			/>
		</Box>
	);
};

export default TenantProfilesTable;

const ProfileNameCell: MRT_ColumnDef<TenantProfileRowData, string>['Cell'] = (
	props,
) => {
	const name = props.row.original.name;
	const profileId = props.row.original.id;
	const isDefault = props.row.original.isDefault;
	const { t } = useTranslate();

	return (
		<Box
			sx={{
				gap: 1.5,
				width: 1,
				minWidth: 0,
				display: 'flex',
				alignItems: 'center',
			}}
		>
			<Avatar
				variant="rounded"
				sx={{
					width: 36,
					height: 36,
					flexShrink: 0,
					bgcolor: 'background.neutral',
					color: 'text.disabled',
				}}
			>
				<Iconify icon="solar:user-id-bold" width={20} />
			</Avatar>

			<Box
				sx={{
					minWidth: 0,
					flex: '1 1 auto',
					display: 'flex',
					flexDirection: 'column',
					gap: 0.25,
				}}
			>
				<Box
					sx={{
						minWidth: 0,
						display: 'flex',
						alignItems: 'center',
						gap: 0.75,
					}}
				>
					<Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
						{name}
					</Typography>
					{isDefault ? (
						<Label
							variant="soft"
							color="default"
							sx={{
								height: 18,
								px: 0.5,
								flexShrink: 0,
								typography: 'caption',
								color: 'text.secondary',
							}}
						>
							{t('default')}
						</Label>
					) : null}
				</Box>
				<Tooltip title={profileId} placement="top" arrow>
					<Typography
						variant="caption"
						component="span"
						noWrap
						sx={{ color: 'text.disabled', display: 'block' }}
					>
						{profileId}
					</Typography>
				</Tooltip>
			</Box>
		</Box>
	);
};

const DescriptionCell: MRT_ColumnDef<
	TenantProfileRowData,
	string | null
>['Cell'] = (props) => {
	const description = props.cell.getValue();

	return (
		<Box
			sx={{
				color: description ? 'text.primary' : 'text.disabled',
			}}
		>
			{description || '-'}
		</Box>
	);
};

const UserAccountCountCell: MRT_ColumnDef<
	TenantProfileRowData,
	number
>['Cell'] = (props) => {
	const count = props.cell.getValue();

	return <Label variant="soft">{count}</Label>;
};

const ProfileActionsCell = ({
	tenantId,
	profile,
}: {
	tenantId: string;
	profile: TenantProfileRowData;
}) => {
	return (
		<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
			<TenantProfileEditAction tenantId={tenantId} profile={profile} />
			<TenantProfileDeleteAction tenantId={tenantId} profile={profile} />
		</Box>
	);
};
