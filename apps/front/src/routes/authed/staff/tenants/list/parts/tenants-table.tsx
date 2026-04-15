import Autocomplete from '@mui/material/Autocomplete';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Link from '@mui/material/Link';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import capitalize from 'lodash/capitalize';
import isEqual from 'lodash/isEqual';
import map from 'lodash/map';
import toLower from 'lodash/toLower';
import lodashToString from 'lodash/toString';
import trim from 'lodash/trim';
import {
	createMRTColumnHelper,
	MaterialReactTable,
	type MRT_ColumnDef,
	type MRT_Localization,
	type MRT_SortingState,
	type MRT_TableOptions,
} from 'material-react-table';
import { useDebounce } from 'minimal-shared/hooks';
import { varAlpha } from 'minimal-shared/utils';
import { nanoid } from 'nanoid';
import { parseAsString, useQueryStates } from 'nuqs';
import {
	useCallback,
	useEffect,
	useId,
	useImperativeHandle,
	useMemo,
	useReducer,
	useRef,
	useState,
	type Ref,
} from 'react';

import type { TenantAsStaffListItem } from '@org/client-ts/src/models';
import {
	DEFAULT_PAGE_SIZE,
	FRONT_PATH_NAMES,
	TENANT_STATUS_ENUM,
} from '@org/shared-ts/lib/constants';

import { ConfirmDialog } from '#app/components/custom-dialog/confirm-dialog.tsx';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { Label } from '#app/components/label/label.tsx';
import type { LabelColor } from '#app/components/label/types.ts';
import { RouterLink } from '#app/components/router-link.tsx';
import { toast } from '#app/components/snackbar/index.ts';
import { useMRTTable } from '#app/hooks/use-mrt-table.ts';
import { useTableQueryOptions } from '#app/hooks/use-table-query-options.tsx';
import { useTableState } from '#app/hooks/use-table-state.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import {
	getFailureMessage,
	isAbortFailure,
	isProblemFailure,
	toApiFailure,
} from '#app/lib/api-failure/index.ts';
import { getUntypedNumber } from '#app/lib/js-client/kiota-utils.ts';
import {
	useBulkDeleteTenants,
	useBulkReactivateTenants,
	useBulkSuspendTenants,
	useDeleteTenant,
	useFindTenants,
	useReactivateTenant,
	useSuspendTenant,
} from '#app/lib/react-query/features/staff/staff-tenant.hooks.ts';

export type TenantRowData = {
	id: string;
	name: string;
	logoUrl: string;
	usersCount: number;
	maxUsers: number;
	status: string;
	createdAt?: Date;
	updatedAt?: Date;
	code?: string;
};

const TenantRowDataMapper = (tenant: TenantAsStaffListItem): TenantRowData => {
	return {
		id: tenant.id || nanoid(),
		name: tenant.name || '-',
		logoUrl: tenant.logoUrl || '',
		usersCount: getUntypedNumber(tenant.usersCount, 0),
		maxUsers: getUntypedNumber(tenant.maxUsers, 0),
		status: tenant.status || '-',
	};
};

const columnHelper = createMRTColumnHelper<TenantRowData>();

// Use snake_case sort IDs to match backend API
const defaultSorting: MRT_SortingState[number] = {
	desc: true,
	id: 'created_at',
};
const parseStatusFilter = (value: string) => {
	if (!value) {
		return [];
	}

	return value.split(',').filter(Boolean);
};
const SELECTION_MODE_MENU_MIN_WIDTH = 220;

type BulkActionDialogState = {
	type: 'suspend' | 'reactivate' | 'delete';
	open: boolean;
};

type BulkActionType = BulkActionDialogState['type'];
type ExportFormat = 'csv' | 'json' | 'xlsx';
type TenantStatusFilterOption = {
	label: string;
	value: string;
};

type TableUiState = {
	rowSelection: Record<string, boolean>;
	bulkActionDialog: BulkActionDialogState;
};

const initialTableUiState: TableUiState = {
	rowSelection: {},
	bulkActionDialog: { type: 'suspend', open: false },
};

const tableUiReducer = (
	state: TableUiState,
	update:
		| Partial<TableUiState>
		| ((state: TableUiState) => Partial<TableUiState>),
) => {
	const nextState = typeof update === 'function' ? update(state) : update;

	return { ...state, ...nextState };
};

const useTenantsTableController = () => {
	const { t } = useTranslate();
	const searchTooltipId = useId();
	const statusTooltipId = useId();
	const exportDialogRef = useRef<TenantsExportDialogControllerRef | null>(null);
	const tenantStatusOptions = useMemo<TenantStatusFilterOption[]>(() => {
		return [
			{ label: t('active'), value: TENANT_STATUS_ENUM.ACTIVE },
			{ label: t('pending'), value: TENANT_STATUS_ENUM.PENDING },
			{ label: t('suspended'), value: TENANT_STATUS_ENUM.SUSPENDED },
		];
	}, [t]);

	// Filter state with nuqs (URL-persisted)
	const [filterStates, setFilterStates] = useQueryStates({
		q: parseAsString.withDefault(''),
		status: parseAsString.withDefault(''),
	});

	const [globalFilter, setGlobalFilter] = useState(filterStates.q);
	const [statusFilter, setStatusFilter] = useState<string[]>(() =>
		parseStatusFilter(filterStates.status),
	);

	// Use the custom table state hook for cursor pagination
	const {
		handlePaginationChange,
		handleSortingChange,
		apiVariables,
		tableState,
		setNextCursor,
		hasPreviousPage,
		resetCursorPagination,
	} = useTableState({
		defaultSorting,
		defaultPageSize: DEFAULT_PAGE_SIZE,
		paginationMode: 'cursor',
	});

	// Debounce URL updates (NOT UI typing).
	const debouncedQ = useDebounce(globalFilter, 300);

	useEffect(() => {
		if (debouncedQ === filterStates.q) {
			return;
		}

		resetCursorPagination?.();
		setFilterStates({ q: debouncedQ, status: statusFilter.join(',') });
	}, [
		debouncedQ,
		filterStates.q,
		resetCursorPagination,
		setFilterStates,
		statusFilter,
	]);

	useEffect(() => {
		setGlobalFilter(filterStates.q);
	}, [filterStates.q]);

	useEffect(() => {
		const nextStatusFilter = parseStatusFilter(filterStates.status);
		if (!isEqual(nextStatusFilter, statusFilter)) {
			setStatusFilter(nextStatusFilter);
		}
	}, [filterStates.status, statusFilter]);

	const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value;
		setGlobalFilter(value);
	};

	// Status filter handler - reset cursor before updating
	const handleStatusChange = (
		_value: React.SyntheticEvent,
		selectedOptions: TenantStatusFilterOption[],
	) => {
		const nextStatusFilter = map(selectedOptions, (option) => option.value);
		resetCursorPagination?.();
		setStatusFilter(nextStatusFilter);
		setFilterStates({ q: globalFilter, status: nextStatusFilter.join(',') });
	};

	// Row selection state for bulk actions
	const [tableUiState, setTableUiState] = useReducer(
		tableUiReducer,
		initialTableUiState,
	);
	const { rowSelection, bulkActionDialog } = tableUiState;

	const handleBulkActionSuccess = useCallback((type: BulkActionType) => {
		setTableUiState({
			bulkActionDialog: { type, open: false },
			rowSelection: {},
		});
	}, []);

	const {
		handleBulkSuspend,
		handleBulkReactivate,
		handleBulkDelete,
		isBulkSuspending,
		isBulkReactivating,
		isBulkDeleting,
	} = useTenantsBulkActions({
		rowSelection,
		onSuccess: handleBulkActionSuccess,
	});

	const columns = useMemo(() => {
		return [
			// Hidden columns for sorting by created_at/updated_at (snake_case to match backend)
			columnHelper.accessor('createdAt', {
				id: 'created_at',
				header: t('created-at'),
				enableSorting: true,
			}),
			columnHelper.accessor('updatedAt', {
				id: 'updated_at',
				header: t('updated-at', { defaultValue: 'Updated at' }),
				enableSorting: true,
			}),
			columnHelper.accessor('name', {
				header: t('name'),
				Cell: TenantCell,
				size: 300,
			}),
			columnHelper.accessor('usersCount', {
				header: t('users'),
				Cell: UsersCountCell,
				enableSorting: false,
				size: 70,
			}),
			columnHelper.accessor('status', {
				header: t('status'),
				Cell: StatusCell,
				size: 70,
			}),
			columnHelper.display({
				header: 'Actions',
				Cell: TenantActionsCell,
				enableSorting: false,
				size: 70,
			}),
		];
	}, [t]);

	const tenantsQuery = useFindTenants({
		variables: {
			cursor: apiVariables.cursor || undefined,
			limit: apiVariables.limit,
			sort: apiVariables.sort,
			q: filterStates.q || undefined,
			status: filterStates.status || undefined,
		},
	});

	const handleCursorPaginationChange: typeof handlePaginationChange =
		useCallback(
			(updater) => {
				setNextCursor?.(tenantsQuery.data?.nextCursor ?? null);
				handlePaginationChange(updater);
			},
			[handlePaginationChange, tenantsQuery.data?.nextCursor, setNextCursor],
		);
	const hasNextPage = tenantsQuery.data?.nextCursor != null;

	const { renderEmptyRowsFallback, queryState } = useTableQueryOptions({
		query: tenantsQuery,
		emptyContent: {
			title: capitalize(
				t('no-items-found', {
					item: t('tenants'),
					ns: 'response-message',
				}),
			),
		},
		errorContent: {
			title: capitalize(
				t('error-loading-items', {
					item: t('tenants'),
					ns: 'response-message',
				}),
			),
		},
	});

	const dataTable = useMemo(() => {
		if (!tenantsQuery.data?.data) return [];
		return map(tenantsQuery.data.data, (tenant) => TenantRowDataMapper(tenant));
	}, [tenantsQuery.data]);

	const selectedCount = Object.keys(rowSelection).length;
	const isSelectionMode = selectedCount > 0;
	const selectionModeDisabledReason = t('selection-mode-disable-controls', {
		defaultValue:
			'Clear the current selection to change the table query or navigation.',
	});
	const sortingDisabledReason = t('selection-mode-disable-sorting', {
		defaultValue: 'Clear the current selection to change the table sorting.',
	});
	const sortTooltipLocalization = useMemo<Partial<MRT_Localization>>(() => {
		if (!isSelectionMode) {
			return {};
		}

		return {
			sortByColumnAsc: sortingDisabledReason,
			sortByColumnDesc: sortingDisabledReason,
			sortedByColumnAsc: sortingDisabledReason,
			sortedByColumnDesc: sortingDisabledReason,
		};
	}, [isSelectionMode, sortingDisabledReason]);
	const selectedRows = useMemo(() => {
		return dataTable.filter((row) => rowSelection[row.id]);
	}, [dataTable, rowSelection]);

	const openExportDialog = () => {
		// Keep dialog `open` state inside the dialog controller so opening the export
		// UI doesn't cause a full table re-render (the table is the heavy sibling).
		exportDialogRef.current?.open();
	};
	const openBulkActionDialog = (type: BulkActionType) => {
		setTableUiState({
			bulkActionDialog: { type, open: true },
		});
	};
	const closeBulkActionDialog = (type: BulkActionType) => {
		setTableUiState({
			bulkActionDialog: { type, open: false },
		});
	};
	const exportRows = (format: 'csv' | 'json') => {
		const rowsToExport = isSelectionMode ? selectedRows : dataTable;

		if (format === 'csv') {
			const headers = ['Name', 'Status', 'Users', 'Max Users'];
			const rows = map(rowsToExport, (row) => [
				`"${row.name}"`,
				row.status,
				lodashToString(row.usersCount),
				lodashToString(row.maxUsers),
			]);
			const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
			const blob = new Blob([csv], { type: 'text/csv' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = isSelectionMode ? 'selected-tenants.csv' : 'tenants.csv';
			a.click();
			URL.revokeObjectURL(url);
			return;
		}

		const blob = new Blob([JSON.stringify(rowsToExport, null, 2)], {
			type: 'application/json',
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = isSelectionMode ? 'selected-tenants.json' : 'tenants.json';
		a.click();
		URL.revokeObjectURL(url);
	};

	const renderToolbarFilters = () => {
		return (
			<TenantsToolbarFilters
				searchTooltipId={searchTooltipId}
				statusTooltipId={statusTooltipId}
				isSelectionMode={isSelectionMode}
				disabledReason={selectionModeDisabledReason}
				globalFilter={globalFilter}
				statusFilter={statusFilter}
				statusOptions={tenantStatusOptions}
				onSearchChange={handleSearchChange}
				onStatusChange={handleStatusChange}
			/>
		);
	};
	const renderExportActions = () => {
		return <TenantsExportActions onOpenExportDialog={openExportDialog} />;
	};
	const renderSelectionActions = () => {
		return (
			<TenantsSelectionActions
				onOpenExportDialog={openExportDialog}
				onOpenBulkActionDialog={openBulkActionDialog}
			/>
		);
	};

	const table = useMRTTable('minimal-cursor', {
		columns,
		data: dataTable,
		enableRowSelection: true,
		getRowId: (row) => row.id,
		initialState: {
			columnVisibility: {
				created_at: false,
				updated_at: false,
			},
		},
		manualSorting: true,
		localization: sortTooltipLocalization,
		onRowSelectionChange: (updater) => {
			setTableUiState((state) => {
				const rowSelection =
					typeof updater === 'function' ? updater(state.rowSelection) : updater;

				return { rowSelection };
			});
		},
		onSortingChange: (updater) => {
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
		meta: {
			handlePaginationChange: handleCursorPaginationChange,
			hasNextPage,
			hasPreviousPage,
			isPending: tenantsQuery.isPending,
			disablePaginationControls: isSelectionMode,
			renderToolbarFilters,
			renderSelectionActions,
			renderExportActions,
		},
		renderEmptyRowsFallback,
		muiTablePaperProps: {
			sx: {
				flexGrow: 1,
			},
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
			} satisfies MRT_TableOptions<TenantRowData>['muiTableHeadCellProps'];
		},
	});

	return {
		table,
		exportDialogRef,
		isSelectionMode,
		selectedCount,
		rowsCount: dataTable.length,
		exportRows,
		bulkActionDialog,
		isBulkSuspending,
		isBulkReactivating,
		isBulkDeleting,
		closeBulkActionDialog,
		handleBulkSuspend,
		handleBulkReactivate,
		handleBulkDelete,
	};
};

const TenantsTable = () => {
	const {
		table,
		exportDialogRef,
		isSelectionMode,
		selectedCount,
		rowsCount,
		exportRows,
		bulkActionDialog,
		isBulkSuspending,
		isBulkReactivating,
		isBulkDeleting,
		closeBulkActionDialog,
		handleBulkSuspend,
		handleBulkReactivate,
		handleBulkDelete,
	} = useTenantsTableController();

	return (
		<Box
			sx={{
				flexGrow: 1,
				display: 'flex',
				flexDirection: 'column',
				border: 'none',
			}}
		>
			<MaterialReactTable table={table} />

			<TenantsExportDialogController
				ref={exportDialogRef}
				isSelectionMode={isSelectionMode}
				selectedCount={selectedCount}
				rowsCount={rowsCount}
				onExport={exportRows}
			/>

			<TenantsBulkActionDialogs
				dialogState={bulkActionDialog}
				selectedCount={selectedCount}
				isBulkSuspending={isBulkSuspending}
				isBulkReactivating={isBulkReactivating}
				isBulkDeleting={isBulkDeleting}
				onClose={closeBulkActionDialog}
				onBulkSuspend={handleBulkSuspend}
				onBulkReactivate={handleBulkReactivate}
				onBulkDelete={handleBulkDelete}
			/>
		</Box>
	);
};

export default TenantsTable;

// ----------------------------------------------------------------------

type UseTenantsBulkActionsProps = {
	rowSelection: Record<string, boolean>;
	onSuccess: (type: BulkActionType) => void;
};

const useTenantsBulkActions = ({
	rowSelection,
	onSuccess,
}: UseTenantsBulkActionsProps) => {
	const { t } = useTranslate();
	const queryClient = useQueryClient();

	const invalidateTenants = () => {
		queryClient.invalidateQueries({
			queryKey: useFindTenants.getKey(),
		});
	};

	const { mutate: bulkSuspend, isPending: isBulkSuspending } =
		useBulkSuspendTenants({
			// Bulk actions own specialized success/partial/failure feedback, so they
			// intentionally bypass the shared global mutation error toast.
			meta: { skipGlobalErrorHandler: true },
			onSuccess: (result) => {
				const succeeded = result.succeededCount ?? 0;
				const failed = result.failedCount ?? 0;
				if (failed > 0) {
					toast.warning(
						t('tenant-bulk-suspend-partial-success', {
							succeeded,
							failed,
						}),
					);
				} else {
					toast.success(
						t('tenant-bulk-suspend-success', {
							count: succeeded,
						}),
					);
				}
				onSuccess('suspend');
				invalidateTenants();
			},
			onError: (error: unknown) => {
				const failure = toApiFailure(error);

				if (isAbortFailure(failure)) {
					return;
				}

				if (isProblemFailure(failure)) {
					toast.error(
						getFailureMessage(failure, {
							fallback: t('tenant-bulk-suspend-failure'),
						}),
					);
					return;
				}

				toast.error(t('tenant-bulk-suspend-failure'));
			},
		});

	const { mutate: bulkReactivate, isPending: isBulkReactivating } =
		useBulkReactivateTenants({
			// Bulk actions own specialized success/partial/failure feedback, so they
			// intentionally bypass the shared global mutation error toast.
			meta: { skipGlobalErrorHandler: true },
			onSuccess: (result) => {
				const succeeded = result.succeededCount ?? 0;
				const failed = result.failedCount ?? 0;
				if (failed > 0) {
					toast.warning(
						t('tenant-bulk-reactivate-partial-success', {
							succeeded,
							failed,
						}),
					);
				} else {
					toast.success(
						t('tenant-bulk-reactivate-success', {
							count: succeeded,
						}),
					);
				}
				onSuccess('reactivate');
				invalidateTenants();
			},
			onError: (error: unknown) => {
				const failure = toApiFailure(error);

				if (isAbortFailure(failure)) {
					return;
				}

				if (isProblemFailure(failure)) {
					toast.error(
						getFailureMessage(failure, {
							fallback: t('tenant-bulk-reactivate-failure'),
						}),
					);
					return;
				}

				toast.error(t('tenant-bulk-reactivate-failure'));
			},
		});

	const { mutate: bulkDelete, isPending: isBulkDeleting } =
		useBulkDeleteTenants({
			// Bulk actions own specialized success/partial/failure feedback, so they
			// intentionally bypass the shared global mutation error toast.
			meta: { skipGlobalErrorHandler: true },
			onSuccess: (result) => {
				const succeeded = result.succeededCount ?? 0;
				const failed = result.failedCount ?? 0;
				if (failed > 0) {
					toast.warning(
						t('tenant-bulk-delete-partial-success', {
							succeeded,
							failed,
						}),
					);
				} else {
					toast.success(
						t('tenant-bulk-delete-success', {
							count: succeeded,
						}),
					);
				}
				onSuccess('delete');
				invalidateTenants();
			},
			onError: (error: unknown) => {
				const failure = toApiFailure(error);

				if (isAbortFailure(failure)) {
					return;
				}

				if (isProblemFailure(failure)) {
					toast.error(
						getFailureMessage(failure, {
							fallback: t('tenant-bulk-delete-failure'),
						}),
					);
					return;
				}

				toast.error(t('tenant-bulk-delete-failure'));
			},
		});

	const selectedIds = Object.keys(rowSelection);

	return {
		handleBulkSuspend: () => {
			bulkSuspend({ tenantIds: selectedIds });
		},
		handleBulkReactivate: () => {
			bulkReactivate({ tenantIds: selectedIds });
		},
		handleBulkDelete: () => {
			bulkDelete({ tenantIds: selectedIds });
		},
		isBulkSuspending,
		isBulkReactivating,
		isBulkDeleting,
	};
};

type TenantsToolbarFiltersProps = {
	searchTooltipId: string;
	statusTooltipId: string;
	isSelectionMode: boolean;
	disabledReason: string;
	globalFilter: string;
	statusFilter: string[];
	statusOptions: TenantStatusFilterOption[];
	onSearchChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
	onStatusChange: (
		event: React.SyntheticEvent,
		selectedOptions: TenantStatusFilterOption[],
	) => void;
};

const TenantsToolbarFilters = ({
	searchTooltipId,
	statusTooltipId,
	isSelectionMode,
	disabledReason,
	globalFilter,
	statusFilter,
	statusOptions,
	onSearchChange,
	onStatusChange,
}: TenantsToolbarFiltersProps) => {
	const { t } = useTranslate();

	return (
		<>
			<Tooltip
				title={isSelectionMode ? disabledReason : ''}
				arrow
				disableHoverListener={!isSelectionMode}
				describeChild
				slotProps={{ tooltip: { id: searchTooltipId } }}
			>
				<Box component="span">
					<TextField
						size="small"
						placeholder={t('search-tenants')}
						value={globalFilter}
						onChange={onSearchChange}
						disabled={isSelectionMode}
						slotProps={{
							input: {
								startAdornment: (
									<InputAdornment position="start">
										<Iconify icon="eva:search-fill" />
									</InputAdornment>
								),
							},
						}}
						sx={{ minWidth: 260 }}
					/>
				</Box>
			</Tooltip>

			<Tooltip
				title={isSelectionMode ? disabledReason : ''}
				arrow
				disableHoverListener={!isSelectionMode}
				describeChild
				slotProps={{ tooltip: { id: statusTooltipId } }}
			>
				<Box component="span">
					<Autocomplete
						multiple
						disableCloseOnSelect
						size="small"
						options={statusOptions}
						value={statusOptions.filter((option) =>
							statusFilter.includes(option.value),
						)}
						onChange={onStatusChange}
						disabled={isSelectionMode}
						isOptionEqualToValue={(option, value) =>
							option.value === value.value
						}
						getOptionLabel={(option) => option.label}
						renderInput={(params) => (
							<TextField
								{...params}
								placeholder={
									statusFilter.length === 0 ? t('all-statuses') : undefined
								}
								InputProps={{
									...params.InputProps,
									startAdornment: (
										<>
											<Box
												component="span"
												sx={{
													color: 'text.secondary',
													typography: 'body2',
													whiteSpace: 'nowrap',
													mr: 1,
													display: 'inline-flex',
													alignItems: 'center',
													alignSelf: 'center',
													minHeight: 24,
												}}
											>
												{t('status')}:
											</Box>
											{params.InputProps.startAdornment}
										</>
									),
								}}
							/>
						)}
						renderOption={(props, option, { selected }) => {
							const { key, ...optionProps } = props;

							return (
								<Box
									component="li"
									key={key}
									{...optionProps}
									sx={(theme) => ({
										'&.Mui-focused': {
											backgroundColor: varAlpha(
												theme.vars.palette.grey['500Channel'],
												0.08,
											),
										},
										'&[aria-selected="true"]': {
											backgroundColor: varAlpha(
												theme.vars.palette.primary.mainChannel,
												0.08,
											),
										},
										'&[aria-selected="true"].Mui-focused': {
											backgroundColor: varAlpha(
												theme.vars.palette.primary.mainChannel,
												0.12,
											),
										},
									})}
								>
									<Checkbox checked={selected} sx={{ mr: 1 }} />
									{option.label}
								</Box>
							);
						}}
						slotProps={{
							paper: {
								sx: {
									width: 280,
								},
							},
							chip: {
								sx: (theme) => ({
									backgroundColor: varAlpha(
										theme.vars.palette.grey['500Channel'],
										0.16,
									),
									color: 'text.secondary',
									'&:hover': {
										backgroundColor: varAlpha(
											theme.vars.palette.grey['500Channel'],
											0.24,
										),
									},
								}),
							},
						}}
						sx={{
							'& .MuiAutocomplete-tag': {
								maxWidth: 120,
							},
						}}
					/>
				</Box>
			</Tooltip>
		</>
	);
};

type TenantsExportActionsProps = {
	onOpenExportDialog: () => void;
};

const TenantsExportActions = ({
	onOpenExportDialog,
}: TenantsExportActionsProps) => {
	const { t } = useTranslate();

	return (
		<Button
			size="small"
			variant="outlined"
			onClick={onOpenExportDialog}
			startIcon={<Iconify icon="solar:download-bold" />}
		>
			{t('export')}
		</Button>
	);
};

type TenantsSelectionActionsProps = {
	onOpenExportDialog: () => void;
	onOpenBulkActionDialog: (type: BulkActionType) => void;
};

const TenantsSelectionActions = ({
	onOpenExportDialog,
	onOpenBulkActionDialog,
}: TenantsSelectionActionsProps) => {
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

type TenantsExportDialogProps = {
	open: boolean;
	isSelectionMode: boolean;
	selectedCount: number;
	rowsCount: number;
	exportFormat: ExportFormat;
	onClose: () => void;
	onFormatChange: (format: ExportFormat) => void;
	onExport: (format: 'csv' | 'json') => void;
};

export type TenantsExportDialogControllerRef = {
	open: () => void;
};

type TenantsExportDialogControllerProps = {
	isSelectionMode: boolean;
	selectedCount: number;
	rowsCount: number;
	onExport: (format: 'csv' | 'json') => void;
	ref?: Ref<TenantsExportDialogControllerRef>;
};

const TenantsExportDialogController = ({
	isSelectionMode,
	selectedCount,
	rowsCount,
	onExport,
	ref,
}: TenantsExportDialogControllerProps) => {
	const [open, setOpen] = useState(false);
	const [exportFormat, setExportFormat] = useState<ExportFormat>('csv');

	// React 19: `ref` is a normal prop (no `forwardRef` needed). We use an
	// imperative handle because the export dialog can be opened from multiple
	// toolbar/menu triggers without lifting dialog state into the heavy table.
	useImperativeHandle(ref, () => {
		return {
			open: () => {
				setExportFormat('csv');
				setOpen(true);
			},
		};
	}, []);

	return (
		<TenantsExportDialog
			open={open}
			isSelectionMode={isSelectionMode}
			selectedCount={selectedCount}
			rowsCount={rowsCount}
			exportFormat={exportFormat}
			onClose={() => setOpen(false)}
			onFormatChange={setExportFormat}
			onExport={(format) => {
				onExport(format);
				setOpen(false);
			}}
		/>
	);
};

const TenantsExportDialog = ({
	open,
	isSelectionMode,
	selectedCount,
	rowsCount,
	exportFormat,
	onClose,
	onFormatChange,
	onExport,
}: TenantsExportDialogProps) => {
	const { t } = useTranslate();

	const handleExport = () => {
		if (exportFormat === 'xlsx') {
			return;
		}

		onExport(exportFormat);
	};

	return (
		<Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
			<DialogTitle sx={{ pb: 1 }}>
				{isSelectionMode
					? t('export-selected-tenants', {
							defaultValue: 'Export selected tenants',
						})
					: t('export-tenants', {
							defaultValue: 'Export tenants',
						})}
			</DialogTitle>
			<DialogContent sx={{ pt: '8px !important', pb: 2.5 }}>
				<Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
					<Typography variant="body2">
						{isSelectionMode
							? t('export-selected-items', {
									count: selectedCount,
									defaultValue: 'Export {{count}} selected item(s)',
								})
							: t('export-current-results', {
									count: rowsCount,
									defaultValue:
										'Export the current result set ({{count}} item(s)).',
								})}
					</Typography>
					<Tabs
						value={exportFormat}
						onChange={(_event, value: ExportFormat) => {
							if (value) {
								onFormatChange(value);
							}
						}}
						sx={(theme) => ({
							mt: 1.5,
							alignSelf: 'flex-start',
							minHeight: 32,
							p: '2px 2px 1px',
							border: `1px solid ${theme.vars.palette.divider}`,
							borderRadius: 1,
							bgcolor: 'background.paper',
							'& .MuiTabs-indicator': {
								display: 'none',
							},
							'& .MuiTabs-list': {
								gap: '2px',
							},
							'& .MuiTab-root': {
								minHeight: 26,
								minWidth: 64,
								px: 1,
								py: 0.375,
								borderRadius: 0.75,
								fontSize: theme.typography.caption.fontSize,
								fontWeight: theme.typography.fontWeightMedium,
								textTransform: 'none',
								color: 'text.secondary',
								m: 0,
								transition: theme.transitions.create(
									['background-color', 'color', 'box-shadow'],
									{
										duration: theme.transitions.duration.shorter,
									},
								),
							},
							'& .MuiTab-root.Mui-selected': {
								color: 'text.primary',
								bgcolor: varAlpha(theme.vars.palette.grey['500Channel'], 0.16),
								boxShadow: 'none',
							},
							'& .MuiTab-root.Mui-disabled': {
								opacity: 0.48,
							},
						})}
					>
						<Tab label="CSV" value="csv" />
						<Tab label="JSON" value="json" />
						<Tab label="XLSX" value="xlsx" />
					</Tabs>
					<Typography
						variant="body2"
						color="text.secondary"
						sx={{ minHeight: 20 }}
					>
						{exportFormat === 'xlsx'
							? t('xlsx-export-coming-soon', {
									defaultValue: 'XLSX export is coming soon.',
								})
							: ' '}
					</Typography>
				</Box>
			</DialogContent>
			<DialogActions
				sx={{
					px: 3,
					pb: 3,
					pt: 0,
					gap: 0.75,
					justifyContent: 'flex-end',
				}}
			>
				<Button
					variant="contained"
					onClick={handleExport}
					startIcon={<Iconify icon="solar:download-bold" />}
					disabled={exportFormat === 'xlsx'}
				>
					{t('export')}
				</Button>
				<Button variant="outlined" color="inherit" onClick={onClose}>
					{t('cancel')}
				</Button>
			</DialogActions>
		</Dialog>
	);
};

type TenantsBulkActionDialogsProps = {
	dialogState: BulkActionDialogState;
	selectedCount: number;
	isBulkSuspending: boolean;
	isBulkReactivating: boolean;
	isBulkDeleting: boolean;
	onClose: (type: BulkActionType) => void;
	onBulkSuspend: () => void;
	onBulkReactivate: () => void;
	onBulkDelete: () => void;
};

const TenantsBulkActionDialogs = ({
	dialogState,
	selectedCount,
	isBulkSuspending,
	isBulkReactivating,
	isBulkDeleting,
	onClose,
	onBulkSuspend,
	onBulkReactivate,
	onBulkDelete,
}: TenantsBulkActionDialogsProps) => {
	const { t } = useTranslate();

	return (
		<>
			<ConfirmDialog
				open={dialogState.type === 'suspend' && dialogState.open}
				onClose={() => onClose('suspend')}
				title={t('bulk-suspend')}
				content={t('bulk-suspend-confirm', { count: selectedCount })}
				action={
					<Button
						variant="contained"
						color="warning"
						onClick={onBulkSuspend}
						disabled={isBulkSuspending}
					>
						{t('suspend')}
					</Button>
				}
			/>

			<ConfirmDialog
				open={dialogState.type === 'reactivate' && dialogState.open}
				onClose={() => onClose('reactivate')}
				title={t('bulk-reactivate')}
				content={t('bulk-reactivate-confirm', { count: selectedCount })}
				action={
					<Button
						variant="contained"
						color="success"
						onClick={onBulkReactivate}
						disabled={isBulkReactivating}
					>
						{t('reactivate')}
					</Button>
				}
			/>

			<ConfirmDialog
				open={dialogState.type === 'delete' && dialogState.open}
				onClose={() => onClose('delete')}
				title={t('bulk-delete')}
				content={t('bulk-delete-confirm', { count: selectedCount })}
				action={
					<Button
						variant="contained"
						color="error"
						onClick={onBulkDelete}
						disabled={isBulkDeleting}
					>
						{t('delete')}
					</Button>
				}
			/>
		</>
	);
};

const TenantCell: MRT_ColumnDef<TenantRowData, string>['Cell'] = (props) => {
	const name = props.row.original.name;
	const logoUrl = props.row.original.logoUrl;
	const normalizedLogoUrl = trim(logoUrl);
	const href = FRONT_PATH_NAMES.staff.tenants.details(
		props.row.original.id,
	).root;

	return (
		<Box
			sx={{
				py: 1,
				gap: 2,
				width: 1,
				display: 'flex',
				alignItems: 'center',
			}}
		>
			<Avatar
				alt={name}
				src={normalizedLogoUrl || undefined}
				variant="rounded"
				sx={{
					width: 46,
					height: 46,
					...(normalizedLogoUrl
						? {}
						: {
								bgcolor: 'background.neutral',
								color: 'text.disabled',
							}),
				}}
			>
				{!normalizedLogoUrl ? (
					<Iconify icon="solar:buildings-bold" width={24} />
				) : null}
			</Avatar>

			<ListItemText
				primary={
					<Link component={RouterLink} href={href} color="inherit">
						{name}
					</Link>
				}
				secondary={props.row.original.id}
				slotProps={{
					primary: { noWrap: true },
					secondary: { sx: { color: 'text.disabled' } },
				}}
			/>
		</Box>
	);
};

const StatusCell: MRT_ColumnDef<TenantRowData, string>['Cell'] = (props) => {
	const { t } = useTranslate();
	const queryClient = useQueryClient();
	const [menuAnchorEl, setMenuAnchorEl] = useState<HTMLElement | null>(null);
	const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
	const [reactivateDialogOpen, setReactivateDialogOpen] = useState(false);
	const tenant = props.row.original;

	const status = props.cell.getValue();
	const effectiveStatus = status;

	let color: LabelColor = 'default';
	let label = status || toLower(t('unknown-item', { item: 'status' }));

	if (effectiveStatus === TENANT_STATUS_ENUM.ACTIVE) {
		color = 'success';
		label = t('active');
	} else if (effectiveStatus === TENANT_STATUS_ENUM.PENDING) {
		color = 'warning';
		label = t('pending');
	} else if (effectiveStatus === TENANT_STATUS_ENUM.SUSPENDED) {
		color = 'error';
		label = t('suspended');
	}

	const canChangeStatus =
		effectiveStatus === TENANT_STATUS_ENUM.ACTIVE ||
		effectiveStatus === TENANT_STATUS_ENUM.SUSPENDED;

	const { mutate: suspendTenant, isPending: isSuspending } = useSuspendTenant({
		meta: { successMessage: 'tenant-suspended-success' },
		onSuccess: () => {
			setSuspendDialogOpen(false);
			queryClient.invalidateQueries({
				queryKey: useFindTenants.getKey(),
			});
		},
	});

	const { mutate: reactivateTenant, isPending: isReactivating } =
		useReactivateTenant({
			meta: { successMessage: 'tenant-reactivated-success' },
			onSuccess: () => {
				setReactivateDialogOpen(false);
				queryClient.invalidateQueries({
					queryKey: useFindTenants.getKey(),
				});
			},
		});

	const handleChangeStatus = (
		nextStatus:
			| typeof TENANT_STATUS_ENUM.ACTIVE
			| typeof TENANT_STATUS_ENUM.SUSPENDED,
	) => {
		if (nextStatus === effectiveStatus) {
			setMenuAnchorEl(null);
			return;
		}

		setMenuAnchorEl(null);

		if (nextStatus === TENANT_STATUS_ENUM.SUSPENDED) {
			setSuspendDialogOpen(true);
			return;
		}

		setReactivateDialogOpen(true);
	};

	if (!canChangeStatus) {
		return (
			<Label variant="soft" color={color}>
				{label}
			</Label>
		);
	}

	return (
		<>
			<Tooltip title={t('change-status')} placement="top" arrow>
				<ButtonBase
					onClick={(event) => {
						setMenuAnchorEl(event.currentTarget);
					}}
					sx={(theme) => ({
						gap: 0.5,
						px: 0.5,
						py: 0.25,
						borderRadius: 1,
						display: 'inline-flex',
						alignItems: 'center',
						justifyContent: 'center',
						transition: theme.transitions.create('background-color', {
							duration: theme.transitions.duration.shorter,
						}),
						'&:hover': {
							backgroundColor: varAlpha(
								theme.vars.palette.grey['500Channel'],
								0.08,
							),
						},
					})}
				>
					<Label variant="soft" color={color}>
						{label}
					</Label>
					<Iconify icon="eva:arrow-ios-downward-fill" width={16} />
				</ButtonBase>
			</Tooltip>

			<Menu
				open={menuAnchorEl !== null}
				disableAutoFocusItem
				onClose={() => {
					setMenuAnchorEl(null);
				}}
				anchorEl={menuAnchorEl}
				anchorOrigin={{
					vertical: 'bottom',
					horizontal: 'left',
				}}
				transformOrigin={{
					vertical: 'top',
					horizontal: 'left',
				}}
			>
				<MenuItem
					selected={effectiveStatus === TENANT_STATUS_ENUM.ACTIVE}
					onClick={() => handleChangeStatus(TENANT_STATUS_ENUM.ACTIVE)}
				>
					<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
						{effectiveStatus === TENANT_STATUS_ENUM.ACTIVE ? (
							<Iconify icon="solar:check-circle-bold" width={18} />
						) : (
							<Iconify icon="solar:play-circle-bold" width={18} />
						)}
						{t('active')}
					</Box>
				</MenuItem>

				<MenuItem
					selected={effectiveStatus === TENANT_STATUS_ENUM.SUSPENDED}
					onClick={() => handleChangeStatus(TENANT_STATUS_ENUM.SUSPENDED)}
				>
					<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
						{effectiveStatus === TENANT_STATUS_ENUM.SUSPENDED ? (
							<Iconify icon="solar:check-circle-bold" width={18} />
						) : (
							<Iconify icon="solar:forbidden-circle-bold" width={18} />
						)}
						{t('suspended')}
					</Box>
				</MenuItem>
			</Menu>

			<ConfirmDialog
				open={suspendDialogOpen}
				onClose={() => setSuspendDialogOpen(false)}
				title={t('suspend-tenant')}
				content={t('suspend-tenant-confirm', { name: tenant.name })}
				action={
					<Button
						variant="contained"
						color="warning"
						onClick={() => suspendTenant({ tenantId: tenant.id })}
						disabled={isSuspending}
					>
						{t('suspend')}
					</Button>
				}
			/>

			<ConfirmDialog
				open={reactivateDialogOpen}
				onClose={() => setReactivateDialogOpen(false)}
				title={t('reactivate-tenant')}
				content={t('reactivate-tenant-confirm', { name: tenant.name })}
				action={
					<Button
						variant="contained"
						color="success"
						onClick={() => reactivateTenant({ tenantId: tenant.id })}
						disabled={isReactivating}
					>
						{t('reactivate')}
					</Button>
				}
			/>
		</>
	);
};

const UsersCountCell: MRT_ColumnDef<TenantRowData, number>['Cell'] = (
	props,
) => {
	return (
		<>
			{props.cell.getValue()} / {props.row.original.maxUsers}
		</>
	);
};

const TenantActionsCell: MRT_ColumnDef<TenantRowData>['Cell'] = (props) => {
	const tenant = props.row.original;

	return (
		<Box sx={{ display: 'flex', alignItems: 'center' }}>
			<DeleteTenantAction tenant={tenant} />
		</Box>
	);
};

type TenantActionProps = {
	tenant: TenantRowData;
};

const DeleteTenantAction = ({ tenant }: TenantActionProps) => {
	const { t } = useTranslate();
	const queryClient = useQueryClient();
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const canDelete = tenant.status === TENANT_STATUS_ENUM.SUSPENDED;

	const { mutate: deleteTenant, isPending: isDeleting } = useDeleteTenant({
		meta: { successMessage: 'tenant-deleted-success' },
		onSuccess: () => {
			setDeleteDialogOpen(false);
			queryClient.invalidateQueries({
				queryKey: useFindTenants.getKey(),
			});
		},
	});

	return (
		<>
			<Tooltip
				title={
					canDelete ? t('delete') : t('delete-tenant-disabled-until-suspended')
				}
				placement="top"
				arrow
			>
				<Box component="span">
					<IconButton
						color="default"
						onClick={() => setDeleteDialogOpen(true)}
						disabled={!canDelete}
						sx={{
							color: canDelete ? 'error.main' : 'text.disabled',
						}}
					>
						<Iconify icon="solar:trash-bin-trash-bold" />
					</IconButton>
				</Box>
			</Tooltip>

			<ConfirmDialog
				open={deleteDialogOpen}
				onClose={() => setDeleteDialogOpen(false)}
				title={t('confirm-delete-tenant-title')}
				content={t('confirm-delete-tenant-message')}
				action={
					<Button
						variant="contained"
						color="error"
						onClick={() => deleteTenant({ tenantId: tenant.id })}
						disabled={isDeleting}
					>
						{t('delete')}
					</Button>
				}
			/>
		</>
	);
};
