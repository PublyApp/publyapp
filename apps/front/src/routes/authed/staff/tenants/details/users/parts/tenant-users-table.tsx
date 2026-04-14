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
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Link from '@mui/material/Link';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import capitalize from 'lodash/capitalize';
import isEqual from 'lodash/isEqual';
import map from 'lodash/map';
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
import { useBoolean, useDebounce } from 'minimal-shared/hooks';
import { varAlpha } from 'minimal-shared/utils';
import { parseAsString, useQueryStates } from 'nuqs';
import {
	useCallback,
	useEffect,
	useId,
	useMemo,
	useReducer,
	useState,
} from 'react';
import { useParams } from 'react-router';

import {
	ACCOUNT_LEVEL_ENUM,
	DEFAULT_PAGE_SIZE,
	FRONT_PATH_NAMES,
	USER_STATUS_ENUM,
} from '@org/shared-ts/lib/constants';
import { getUserFullName } from '@org/shared-ts/utils/user.utils';

import { ConfirmDialog } from '#app/components/custom-dialog/confirm-dialog.tsx';
import DrawerAnchor from '#app/components/drawer-anchor.tsx';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import type { LabelColor } from '#app/components/label/index.ts';
import { Label } from '#app/components/label/label.tsx';
import { RouterLink } from '#app/components/router-link.tsx';
import { useSectionPageWithDrawer } from '#app/components/settings/section-page-with-drawer.tsx';
import { toast } from '#app/components/snackbar/index.ts';
import { useMRTTable } from '#app/hooks/use-mrt-table.ts';
import { useTableQueryOptions } from '#app/hooks/use-table-query-options.tsx';
import { useTableState } from '#app/hooks/use-table-state.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { getFailureMessage, toApiFailure } from '#app/lib/api-failure/index.ts';
import { useSendEmailVerificationReminder } from '#app/lib/react-query/features/common/auth.hooks.ts';
import {
	useFindTenantUsers,
	useReactivateTenantUser,
	useRemoveTenantUser,
	useSuspendTenantUser,
	useUpdateTenantUser,
} from '#app/lib/react-query/features/staff/staff-tenant.hooks.ts';

export type TenantUserRowData = {
	id: string;
	avatarUrl: string;
	firstName: string;
	lastName: string;
	level: string;
	status: string;
	email: string;
};

const columnHelper = createMRTColumnHelper<TenantUserRowData>();

const defaultSorting: MRT_SortingState[number] = {
	desc: true,
	id: 'created_at',
};
const SELECTION_MODE_MENU_MIN_WIDTH = 220;
const GLOBALLY_SUSPENDED_STATUS_VALUE = 'globally_suspended';
const GLOBALLY_SUSPENDED_STATUS_DESCRIPTION = 'GloballySuspended';

type TableUiState = {
	rowSelection: Record<string, boolean>;
	selectionActionAnchorEl: HTMLElement | null;
	exportDialogOpen: boolean;
	exportFormat: 'csv' | 'json' | 'xlsx';
	bulkRemoveDialogOpen: boolean;
};

const initialTableUiState: TableUiState = {
	rowSelection: {},
	selectionActionAnchorEl: null,
	exportDialogOpen: false,
	exportFormat: 'csv',
	bulkRemoveDialogOpen: false,
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

const isGloballySuspendedStatus = (status: string) => {
	return (
		status === GLOBALLY_SUSPENDED_STATUS_VALUE ||
		status === GLOBALLY_SUSPENDED_STATUS_DESCRIPTION
	);
};

const parseStatusFilter = (value: string) => {
	if (!value) {
		return [];
	}

	return value.split(',').filter(Boolean);
};

type ExportFormat = 'csv' | 'json' | 'xlsx';

const useTenantUsersTableController = () => {
	const { t } = useTranslate();
	const { tenantId } = useParams();
	const queryClient = useQueryClient();
	const { openDrawer } = useSectionPageWithDrawer();
	const searchTooltipId = useId();
	const statusTooltipId = useId();
	const statusOptions = useMemo(() => {
		return [
			{ label: t('active'), value: USER_STATUS_ENUM.ACTIVE },
			{ label: t('suspended'), value: USER_STATUS_ENUM.SUSPENDED },
			{
				label: t('globally-suspended', {
					defaultValue: 'Globally suspended',
				}),
				value: GLOBALLY_SUSPENDED_STATUS_VALUE,
			},
		];
	}, [t]);

	// Search and filter state
	const [filterStates, setFilterStates] = useQueryStates({
		q: parseAsString.withDefault(''),
		status: parseAsString.withDefault(''),
	});

	const [searchValue, setSearchValue] = useState(filterStates.q);
	const [statusFilter, setStatusFilter] = useState<string[]>(() =>
		parseStatusFilter(filterStates.status),
	);
	const [tableUiState, setTableUiState] = useReducer(
		tableUiReducer,
		initialTableUiState,
	);
	const {
		rowSelection,
		selectionActionAnchorEl,
		exportDialogOpen,
		exportFormat,
		bulkRemoveDialogOpen,
	} = tableUiState;

	const debouncedSearchValue = useDebounce(searchValue, 300);

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

	useEffect(() => {
		if (debouncedSearchValue === filterStates.q) {
			return;
		}

		resetCursorPagination?.();
		setFilterStates({
			q: debouncedSearchValue,
			status: statusFilter.join(','),
		});
	}, [
		debouncedSearchValue,
		filterStates.q,
		resetCursorPagination,
		setFilterStates,
		statusFilter,
	]);

	useEffect(() => {
		setSearchValue(filterStates.q);
	}, [filterStates.q]);

	useEffect(() => {
		const nextStatusFilter = parseStatusFilter(filterStates.status);
		if (!isEqual(nextStatusFilter, statusFilter)) {
			setStatusFilter(nextStatusFilter);
		}
	}, [filterStates.status, statusFilter]);

	const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setSearchValue(e.target.value);
	};

	const handleStatusChange = (
		_value: React.SyntheticEvent,
		selectedOptions: typeof statusOptions,
	) => {
		const nextStatusFilter = map(selectedOptions, (option) => option.value);
		resetCursorPagination?.();
		setStatusFilter(nextStatusFilter);
		setFilterStates({
			q: searchValue,
			status: nextStatusFilter.join(','),
		});
	};

	const columns = useMemo(() => {
		return [
			columnHelper.accessor(
				(row) => {
					return getUserFullName({
						firstName: row.firstName,
						lastName: row.lastName,
					});
				},
				{
					id: 'fullName',
					header: t('name'),
					Cell: UserCell,
					enableSorting: false,
				},
			),
			columnHelper.accessor('level', {
				header: t('level'),
				Cell: LevelCell,
				size: 150,
			}),
			columnHelper.accessor('status', {
				header: t('status'),
				Cell: StatusCell,
				size: 150,
			}),
			columnHelper.display({
				header: 'Actions',
				Cell: UserActionsCell,
				size: 150,
			}),
		];
	}, [t]);

	const tenantUsersQuery = useFindTenantUsers({
		variables: {
			tenantId: lodashToString(tenantId),
			cursor: apiVariables.cursor || undefined,
			limit: apiVariables.limit,
			sort: apiVariables.sort,
			q: filterStates.q || undefined,
			status: filterStates.status || undefined,
		},
		enabled: !!tenantId,
	});

	const handleCursorPaginationChange: typeof handlePaginationChange =
		useCallback(
			(updater) => {
				setNextCursor?.(tenantUsersQuery.data?.nextCursor);
				handlePaginationChange(updater);
			},
			[
				handlePaginationChange,
				tenantUsersQuery.data?.nextCursor,
				setNextCursor,
			],
		);
	const hasNextPage = tenantUsersQuery.data?.nextCursor != null;

	const { renderEmptyRowsFallback, queryState } = useTableQueryOptions({
		query: tenantUsersQuery,
		emptyContent: {
			title: capitalize(
				t('no-items-found', {
					item: t('users'),
					ns: 'response-message',
				}),
			),
			renderAction: () => (
				<Button
					variant="contained"
					startIcon={<Iconify width={16} icon="mingcute:add-line" />}
					onClick={openDrawer}
					sx={{ mt: 2 }}
				>
					{t('invite-first-user')}
				</Button>
			),
		},
		errorContent: {
			title: capitalize(
				t('error-loading-items', {
					item: t('users'),
					ns: 'response-message',
				}),
			),
		},
	});

	const rows: TenantUserRowData[] = useMemo(() => {
		if (!tenantUsersQuery.data?.data) {
			return [];
		}

		return map(tenantUsersQuery.data.data, (tenantUser) => {
			return {
				id: tenantUser.id || '',
				avatarUrl: tenantUser.avatarUrl || '',
				firstName: tenantUser.firstName || '',
				lastName: tenantUser.lastName || '',
				level: tenantUser.level || '',
				status: tenantUser.status || '',
				email: tenantUser.email || '',
			};
		});
	}, [tenantUsersQuery.data]);

	const selectedCount = Object.keys(rowSelection).length;
	const isSelectionMode = selectedCount > 0;
	const selectionModeDisabledReason = t('selection-mode-disable-controls');
	const sortingDisabledReason = t('selection-mode-disable-sorting');
	const selectedRows = useMemo(() => {
		return rows.filter((row) => rowSelection[row.id]);
	}, [rowSelection, rows]);
	const isSelectionActionMenuOpen = Boolean(selectionActionAnchorEl);
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

	const closeSelectionActionMenu = () => {
		setTableUiState({ selectionActionAnchorEl: null });
	};

	const openExportDialog = () => {
		closeSelectionActionMenu();
		setTableUiState({ exportDialogOpen: true, exportFormat: 'csv' });
	};
	const closeExportDialog = () => {
		setTableUiState({ exportDialogOpen: false });
	};
	const closeBulkRemoveDialog = () => {
		setTableUiState({ bulkRemoveDialogOpen: false });
	};
	const handleExportFormatChange = (format: ExportFormat) => {
		setTableUiState({ exportFormat: format });
	};

	const exportRows = (format: 'csv' | 'json') => {
		const rowsToExport = isSelectionMode ? selectedRows : rows;

		if (format === 'csv') {
			const headers = ['Name', 'Email', 'Level', 'Status'];
			const csvRows = map(rowsToExport, (row) => [
				`"${getUserFullName({
					firstName: row.firstName,
					lastName: row.lastName,
				})}"`,
				`"${row.email}"`,
				row.level,
				row.status,
			]);
			const csv = [headers, ...csvRows].map((row) => row.join(',')).join('\n');
			const blob = new Blob([csv], { type: 'text/csv' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = isSelectionMode
				? 'selected-tenant-users.csv'
				: 'tenant-users.csv';
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
		a.download = isSelectionMode
			? 'selected-tenant-users.json'
			: 'tenant-users.json';
		a.click();
		URL.revokeObjectURL(url);
	};

	const handleExport = (format: 'csv' | 'json') => {
		exportRows(format);
		setTableUiState({ exportDialogOpen: false });
	};

	const { mutateAsync: removeTenantUserAsync, isPending: isBulkRemoving } =
		useRemoveTenantUser({
			meta: { skipGlobalErrorHandler: true },
		});

	const handleBulkRemove = async () => {
		if (!tenantId) {
			return;
		}

		let succeeded = 0;
		let failed = 0;
		let firstFailureMessage: string | undefined;

		for (const userId of Object.keys(rowSelection)) {
			try {
				await removeTenantUserAsync({
					tenantId,
					userId,
				});
				succeeded += 1;
			} catch (error) {
				failed += 1;

				const failure = toApiFailure(error);
				if (firstFailureMessage == null) {
					firstFailureMessage = getFailureMessage(failure);
				}
			}
		}

		setTableUiState({ bulkRemoveDialogOpen: false, rowSelection: {} });
		await queryClient.invalidateQueries({
			queryKey: useFindTenantUsers.getKey({ tenantId }),
		});

		if (succeeded === 0 && failed > 0) {
			toast.error(
				firstFailureMessage ||
					t('tenant-user-bulk-remove-failure', {
						defaultValue: 'Failed to remove selected users from this tenant.',
					}),
			);
			return;
		}

		if (failed > 0) {
			toast.warning(
				t('tenant-user-bulk-remove-partial-success', {
					succeeded,
					failed,
					defaultValue: 'Removed {{succeeded}} user(s), {{failed}} failed.',
				}),
			);
			return;
		}

		toast.success(
			t('tenant-user-bulk-remove-success', {
				count: succeeded,
				defaultValue: 'Successfully removed {{count}} user(s).',
			}),
		);
	};

	const renderToolbarFilters = () => {
		return (
			<>
				<Tooltip
					title={isSelectionMode ? selectionModeDisabledReason : ''}
					arrow
					disableHoverListener={!isSelectionMode}
					describeChild
					slotProps={{ tooltip: { id: searchTooltipId } }}
				>
					<Box component="span">
						<TextField
							size="small"
							placeholder={t('search-users', {
								defaultValue: 'Search users',
							})}
							value={searchValue}
							onChange={handleSearchChange}
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
					title={isSelectionMode ? selectionModeDisabledReason : ''}
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
							onChange={handleStatusChange}
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

	const renderExportActions = () => {
		return (
			<Button
				size="small"
				variant="outlined"
				onClick={openExportDialog}
				startIcon={<Iconify icon="solar:download-bold" />}
			>
				{t('export')}
			</Button>
		);
	};

	const renderSelectionActions = () => {
		return (
			<>
				<IconButton
					size="small"
					onClick={(event) => {
						setTableUiState({
							selectionActionAnchorEl: event.currentTarget,
						});
					}}
					sx={{ width: 32, height: 32 }}
				>
					<Iconify icon="eva:more-vertical-fill" width={18} />
				</IconButton>
				<Menu
					anchorEl={selectionActionAnchorEl}
					open={isSelectionActionMenuOpen}
					onClose={closeSelectionActionMenu}
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
					<MenuItem onClick={openExportDialog}>
						<Iconify icon="solar:download-bold" width={18} />
						<ListItemText primary={t('export-selected')} sx={{ ml: 1 }} />
					</MenuItem>
					<MenuItem
						onClick={() => {
							closeSelectionActionMenu();
							setTableUiState({ bulkRemoveDialogOpen: true });
						}}
						sx={{ color: 'error.main' }}
					>
						<Iconify icon="solar:trash-bin-trash-bold" width={18} />
						<ListItemText
							primary={t('remove-selected-from-tenant', {
								defaultValue: 'Remove selected from tenant',
							})}
							sx={{ ml: 1 }}
						/>
					</MenuItem>
				</Menu>
			</>
		);
	};

	const table = useMRTTable('minimal-cursor', {
		columns,
		data: rows,
		enableRowSelection: true,
		getRowId: (row) => row.id,
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
			isPending: tenantUsersQuery.isPending,
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
		muiTableProps: {
			sx: {
				'& .MuiTableBody-root > tr > td:not(:nth-of-type(2)), & .MuiTableHead-root > tr > th:not(:nth-of-type(2))':
					{
						flex: '1 1 auto !important',
					},
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
			} satisfies MRT_TableOptions<TenantUserRowData>['muiTableHeadCellProps'];
		},
	});

	return {
		table,
		exportDialogOpen,
		isSelectionMode,
		selectedCount,
		rowsCount: rows.length,
		exportFormat,
		closeExportDialog,
		handleExportFormatChange,
		handleExport,
		bulkRemoveDialogOpen,
		closeBulkRemoveDialog,
		handleBulkRemove,
		isBulkRemoving,
	};
};

const TenantUsersTable = () => {
	const { t } = useTranslate();
	const {
		table,
		exportDialogOpen,
		isSelectionMode,
		selectedCount,
		rowsCount,
		exportFormat,
		closeExportDialog,
		handleExportFormatChange,
		handleExport,
		bulkRemoveDialogOpen,
		closeBulkRemoveDialog,
		handleBulkRemove,
		isBulkRemoving,
	} = useTenantUsersTableController();

	return (
		<Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
			<MaterialReactTable table={table} />

			<Dialog
				open={exportDialogOpen}
				onClose={closeExportDialog}
				fullWidth
				maxWidth="xs"
			>
				<DialogTitle sx={{ pb: 1 }}>
					{isSelectionMode
						? t('export-selected-users', {
								defaultValue: 'Export selected users',
							})
						: t('export-users', {
								defaultValue: 'Export users',
							})}
				</DialogTitle>
				<DialogContent sx={{ pt: '8px !important', pb: 2.5 }}>
					<Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
						<Typography variant="body2">
							{isSelectionMode
								? t('export-selected-items', {
										count: selectedCount,
									})
								: t('export-current-results', {
										count: rowsCount,
										defaultValue:
											'Export the current result set ({{count}} item(s)).',
									})}
						</Typography>
						<Tabs
							value={exportFormat}
							onChange={(_event, value: 'csv' | 'json' | 'xlsx') => {
								if (value) {
									handleExportFormatChange(value);
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
									bgcolor: varAlpha(
										theme.vars.palette.grey['500Channel'],
										0.16,
									),
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
						onClick={() => {
							if (exportFormat === 'xlsx') {
								return;
							}

							handleExport(exportFormat);
						}}
						startIcon={<Iconify icon="solar:download-bold" />}
						disabled={exportFormat === 'xlsx'}
					>
						{t('export')}
					</Button>
					<Button
						variant="outlined"
						color="inherit"
						onClick={closeExportDialog}
					>
						{t('cancel')}
					</Button>
				</DialogActions>
			</Dialog>

			<ConfirmDialog
				open={bulkRemoveDialogOpen}
				onClose={closeBulkRemoveDialog}
				title={t('remove-selected-from-tenant', {
					defaultValue: 'Remove selected from tenant',
				})}
				content={t('confirm-bulk-remove-tenant-users', {
					count: selectedCount,
					defaultValue:
						'Are you sure you want to remove {{count}} selected user(s) from this tenant?',
				})}
				action={
					<Button
						variant="contained"
						color="error"
						onClick={handleBulkRemove}
						disabled={isBulkRemoving}
					>
						{t('remove')}
					</Button>
				}
			/>
		</Box>
	);
};

export default TenantUsersTable;

// ----------------------------------------------------------------------

const UserCell: MRT_ColumnDef<TenantUserRowData, string>['Cell'] = (props) => {
	const fullName = props.cell.getValue();
	const { id, avatarUrl, email } = props.row.original;
	const normalizedAvatarUrl = trim(avatarUrl);
	const userDetailsLink = FRONT_PATH_NAMES.staff.tenantUsers.details(id);

	return (
		<Box sx={{ gap: 2, display: 'flex', alignItems: 'center' }}>
			<Avatar
				alt={fullName}
				src={normalizedAvatarUrl || undefined}
				sx={{
					...(normalizedAvatarUrl
						? {}
						: {
								bgcolor: 'background.neutral',
								color: 'text.disabled',
							}),
				}}
			>
				{!normalizedAvatarUrl ? (
					<Iconify icon="solar:user-rounded-bold" width={20} />
				) : null}
			</Avatar>

			<Stack
				sx={{
					typography: 'body2',
					flex: '1 1 auto',
					alignItems: 'flex-start',
				}}
			>
				<Link color="inherit" component={RouterLink} href={userDetailsLink}>
					{fullName}
				</Link>
				<Box component="span" sx={{ color: 'text.disabled' }}>
					{email}
				</Box>
			</Stack>
		</Box>
	);
};

const StatusCell: MRT_ColumnDef<TenantUserRowData, string>['Cell'] = (
	props,
) => {
	const { t } = useTranslate();
	const { tenantId } = useParams();
	const queryClient = useQueryClient();
	const user = props.row.original;
	const status = props.cell.getValue();
	const isGloballySuspended = isGloballySuspendedStatus(status);
	const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
	const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
	const [pendingStatus, setPendingStatus] = useState<string | null>(null);
	const globallySuspendedReason = t('globally-suspended-row-disabled', {
		defaultValue:
			'This user is globally suspended. Reactivate the user globally before managing tenant membership.',
	});

	const { mutate: suspendUser, isPending: isSuspending } = useSuspendTenantUser(
		{
			onSuccess: () => {
				toast.success(t('tenant-user-suspended-success'));
				setConfirmDialogOpen(false);
				setMenuAnchorEl(null);
				if (tenantId) {
					queryClient.invalidateQueries({
						queryKey: useFindTenantUsers.getKey({ tenantId }),
					});
				}
			},
		},
	);

	const { mutate: reactivateUser, isPending: isReactivating } =
		useReactivateTenantUser({
			onSuccess: () => {
				toast.success(t('tenant-user-reactivated-success'));
				setConfirmDialogOpen(false);
				setMenuAnchorEl(null);
				if (tenantId) {
					queryClient.invalidateQueries({
						queryKey: useFindTenantUsers.getKey({ tenantId }),
					});
				}
			},
		});

	let label: string = t('unknown-item', { item: 'status' });
	let color: LabelColor = 'default';

	if (isGloballySuspended) {
		label = t('globally-suspended', {
			defaultValue: 'Globally suspended',
		});
		color = 'error';
	} else if (status === USER_STATUS_ENUM.ACTIVE) {
		label = t('active');
		color = 'success';
	} else if (status === USER_STATUS_ENUM.SUSPENDED) {
		label = t('suspended');
		color = 'warning';
	}

	const isPending = isSuspending || isReactivating;

	const handleStatusClick = (newStatus: string) => {
		if (newStatus === status) {
			setMenuAnchorEl(null);
			return;
		}
		setPendingStatus(newStatus);
		setConfirmDialogOpen(true);
	};

	const handleConfirm = () => {
		if (!tenantId || !pendingStatus) return;

		if (pendingStatus === USER_STATUS_ENUM.SUSPENDED) {
			suspendUser({ tenantId, userId: user.id });
		} else if (pendingStatus === USER_STATUS_ENUM.ACTIVE) {
			reactivateUser({ tenantId, userId: user.id });
		}
	};

	const isActive = status === USER_STATUS_ENUM.ACTIVE;
	const isSuspended = status === USER_STATUS_ENUM.SUSPENDED;
	const canChangeStatus = !isGloballySuspended && (isActive || isSuspended);

	if (!canChangeStatus) {
		return (
			<Tooltip
				title={isGloballySuspended ? globallySuspendedReason : ''}
				placement="top"
				arrow
				disableHoverListener={!isGloballySuspended}
			>
				<Box component="span">
					<Label variant="soft" color={color}>
						{label}
					</Label>
				</Box>
			</Tooltip>
		);
	}

	return (
		<>
			<Box sx={{ display: 'flex', alignItems: 'center' }}>
				<Tooltip title={t('change-status')} placement="top" arrow>
					<ButtonBase
						onClick={(event) => {
							setMenuAnchorEl(event.currentTarget);
						}}
						disabled={isPending}
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
							'&:disabled': {
								opacity: 0.48,
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
						selected={isActive}
						onClick={() => handleStatusClick(USER_STATUS_ENUM.ACTIVE)}
					>
						<Stack direction="row" alignItems="center" gap={1}>
							{isActive ? (
								<Iconify icon="solar:check-circle-bold" width={18} />
							) : (
								<Iconify icon="solar:shield-check-bold" width={18} />
							)}
							{t('active')}
						</Stack>
					</MenuItem>

					<MenuItem
						selected={isSuspended}
						onClick={() => handleStatusClick(USER_STATUS_ENUM.SUSPENDED)}
					>
						<Stack direction="row" alignItems="center" gap={1}>
							{isSuspended ? (
								<Iconify icon="solar:check-circle-bold" width={18} />
							) : (
								<Iconify icon="solar:stop-circle-bold" width={18} />
							)}
							{t('suspended')}
						</Stack>
					</MenuItem>
				</Menu>
			</Box>

			<ConfirmDialog
				open={confirmDialogOpen}
				onClose={() => setConfirmDialogOpen(false)}
				title={
					pendingStatus === USER_STATUS_ENUM.SUSPENDED
						? t('confirm-suspend-tenant-user')
						: t('confirm-reactivate-tenant-user')
				}
				content={
					pendingStatus === USER_STATUS_ENUM.SUSPENDED
						? t('suspend-tenant-user-description', {
								defaultValue:
									'This user will lose access to this tenant. Are you sure you want to proceed?',
							})
						: t('reactivate-tenant-user-description', {
								defaultValue:
									'Access to this tenant will be restored. Are you sure you want to proceed?',
							})
				}
				action={
					<Button
						variant="contained"
						color={
							pendingStatus === USER_STATUS_ENUM.SUSPENDED ? 'error' : 'primary'
						}
						onClick={handleConfirm}
						disabled={isPending}
					>
						{pendingStatus === USER_STATUS_ENUM.SUSPENDED
							? t('suspend')
							: t('reactivate')}
					</Button>
				}
			/>
		</>
	);
};

const LevelCell: MRT_ColumnDef<TenantUserRowData, string>['Cell'] = (props) => {
	const { t } = useTranslate();
	const { tenantId } = useParams();
	const queryClient = useQueryClient();
	const user = props.row.original;
	const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
	const userId = user.id;
	const level = props.cell.getValue();
	const isGloballySuspended = isGloballySuspendedStatus(user.status);
	const globallySuspendedReason = t('globally-suspended-row-disabled', {
		defaultValue:
			'This user is globally suspended. Reactivate the user globally before managing tenant membership.',
	});

	const { mutate: updateUser, isPending } = useUpdateTenantUser({
		// Row-level tenant-user actions rely on the centralized mutation error
		// handler to translate RFC7807/translationKey failures consistently.
		onSuccess: () => {
			toast.success(t('user-level-updated-success'));
			setMenuAnchorEl(null);
			if (tenantId) {
				queryClient.invalidateQueries({
					queryKey: useFindTenantUsers.getKey({
						tenantId,
					}),
				});
			}
		},
	});

	let label: string = t('unknown-item', { item: 'role' });
	let color: LabelColor = 'default';

	if (level === ACCOUNT_LEVEL_ENUM.ADMIN) {
		label = t('admin');
		color = 'success';
	} else if (level === ACCOUNT_LEVEL_ENUM.USER) {
		label = t('user');
		color = 'warning';
	}

	const handleChangeLevel = (
		newLevel: typeof ACCOUNT_LEVEL_ENUM.ADMIN | typeof ACCOUNT_LEVEL_ENUM.USER,
	) => {
		if (newLevel === level) {
			setMenuAnchorEl(null);
			return;
		}

		if (!tenantId) {
			return;
		}

		updateUser({ tenantId, userId, level: newLevel });
	};

	return (
		<Box sx={{ display: 'flex', alignItems: 'center' }}>
			<Tooltip
				title={isGloballySuspended ? globallySuspendedReason : t('change-role')}
				placement="top"
				arrow
			>
				<Box component="span">
					<ButtonBase
						onClick={(event) => {
							setMenuAnchorEl(event.currentTarget);
						}}
						disabled={isPending || isGloballySuspended}
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
							'&:disabled': {
								opacity: 0.48,
							},
						})}
					>
						<Label variant="soft" color={color}>
							{label}
						</Label>
						<Iconify icon="eva:arrow-ios-downward-fill" width={16} />
					</ButtonBase>
				</Box>
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
					selected={level === ACCOUNT_LEVEL_ENUM.ADMIN}
					onClick={() => handleChangeLevel(ACCOUNT_LEVEL_ENUM.ADMIN)}
				>
					<Stack direction="row" alignItems="center" gap={1}>
						{level === ACCOUNT_LEVEL_ENUM.ADMIN ? (
							<Iconify icon="solar:check-circle-bold" width={18} />
						) : (
							<Iconify icon="solar:shield-check-bold" width={18} />
						)}
						{t('admin')}
					</Stack>
				</MenuItem>

				<MenuItem
					selected={level === ACCOUNT_LEVEL_ENUM.USER}
					onClick={() => handleChangeLevel(ACCOUNT_LEVEL_ENUM.USER)}
				>
					<Stack direction="row" alignItems="center" gap={1}>
						{level === ACCOUNT_LEVEL_ENUM.USER ? (
							<Iconify icon="solar:check-circle-bold" width={18} />
						) : (
							<Iconify icon="solar:users-group-rounded-bold" width={18} />
						)}
						{t('user')}
					</Stack>
				</MenuItem>
			</Menu>
		</Box>
	);
};

const UserActionsCell: MRT_ColumnDef<TenantUserRowData>['Cell'] = (props) => {
	const user = props.row.original;
	const { t } = useTranslate();
	const isGloballySuspended = isGloballySuspendedStatus(user.status);
	const disabledReason = t('globally-suspended-row-disabled');

	return (
		<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
			<FollowUpAction
				user={user}
				disabled={isGloballySuspended}
				disabledReason={disabledReason}
			/>

			<UserDetailsDrawerAction
				user={user}
				disabled={isGloballySuspended}
				disabledReason={disabledReason}
			/>

			<RemoveUserAction
				user={user}
				disabled={isGloballySuspended}
				disabledReason={disabledReason}
			/>
		</Box>
	);
};

type FollowUpActionProps = {
	user: TenantUserRowData;
	disabled: boolean;
	disabledReason: string;
};

const FollowUpAction = ({
	user,
	disabled,
	disabledReason,
}: FollowUpActionProps) => {
	const { t } = useTranslate();
	const isUserPending = user.status === USER_STATUS_ENUM.PENDING;

	const {
		mutateAsync: sendEmailVerificationReminder,
		isPending: isPendingSendEmailVerificationReminder,
	} = useSendEmailVerificationReminder({
		onSuccess: () => {
			toast.success(t('email-verification-follow-up-success'));
		},
	});

	if (!isUserPending) {
		return null;
	}

	return (
		<Tooltip
			title={
				disabled
					? disabledReason
					: capitalize(t('send-email-verification-follow-up'))
			}
			placement="top"
		>
			<Box component="span">
				<IconButton
					color="default"
					loading={isPendingSendEmailVerificationReminder}
					disabled={disabled}
					onClick={async () => {
						await sendEmailVerificationReminder({ email: user.email });
					}}
				>
					<Iconify icon="custom:send-fill" width={18} />
				</IconButton>
			</Box>
		</Tooltip>
	);
};

type UserDetailsDrawerActionProps = {
	user: TenantUserRowData;
	disabled: boolean;
	disabledReason: string;
};

const UserDetailsDrawerAction = ({
	user,
	disabled,
	disabledReason,
}: UserDetailsDrawerActionProps) => {
	const { t } = useTranslate();
	const detailsDrawer = useBoolean();
	const userDetailsLink = FRONT_PATH_NAMES.staff.tenantUsers.details(user.id);
	const fullName = getUserFullName({
		firstName: user.firstName,
		lastName: user.lastName,
	});

	let levelLabel = t('unknown-item', { item: 'role' });
	if (user.level === ACCOUNT_LEVEL_ENUM.ADMIN) {
		levelLabel = t('admin');
	} else if (user.level === ACCOUNT_LEVEL_ENUM.USER) {
		levelLabel = t('user');
	}

	let statusLabel = t('unknown-item', { item: 'status' });
	if (user.status === USER_STATUS_ENUM.ACTIVE) {
		statusLabel = t('active');
	} else if (isGloballySuspendedStatus(user.status)) {
		statusLabel = t('globally-suspended');
	} else if (user.status === USER_STATUS_ENUM.PENDING) {
		statusLabel = t('pending');
	} else if (user.status === USER_STATUS_ENUM.BANNED) {
		statusLabel = t('banned');
	} else if (user.status === USER_STATUS_ENUM.SUSPENDED) {
		statusLabel = t('suspended');
	} else if (user.status === USER_STATUS_ENUM.INACTIVE) {
		statusLabel = t('inactive');
	}

	return (
		<>
			<Tooltip
				title={disabled ? disabledReason : t('view-details')}
				placement="top"
				arrow
			>
				<Box component="span">
					<IconButton
						color="default"
						disabled={disabled}
						onClick={detailsDrawer.onTrue}
					>
						<Iconify icon="solar:list-bold" width={18} />
					</IconButton>
				</Box>
			</Tooltip>

			<Drawer
				open={detailsDrawer.value}
				onClose={detailsDrawer.onFalse}
				anchor="right"
				sx={(theme) => ({
					zIndex: theme.zIndex.modal + 1,
				})}
				slotProps={{
					paper: {
						sx: {
							width: 720,
							overflow: 'unset',
						},
					},
				}}
			>
				<Tooltip title={t('view-details')} placement="left" arrow>
					<DrawerAnchor
						component={RouterLink}
						href={userDetailsLink}
						sx={{ left: 0 }}
					>
						<Iconify icon="eva:expand-outline" width={18} />
					</DrawerAnchor>
				</Tooltip>

				<Box sx={{ p: 3 }}>
					<Stack spacing={2}>
						<Box>
							<Typography variant="h5">{fullName}</Typography>
							<Typography variant="body2" color="text.secondary">
								{user.email}
							</Typography>
						</Box>

						<Stack direction="row" spacing={4}>
							<Box>
								<Typography variant="overline" color="text.disabled">
									{t('level')}
								</Typography>
								<Typography variant="body2">{levelLabel}</Typography>
							</Box>
							<Box>
								<Typography variant="overline" color="text.disabled">
									{t('status')}
								</Typography>
								<Typography variant="body2">{statusLabel}</Typography>
							</Box>
						</Stack>
					</Stack>
				</Box>
			</Drawer>
		</>
	);
};

type RemoveUserActionProps = {
	user: TenantUserRowData;
	disabled: boolean;
	disabledReason: string;
};

const RemoveUserAction = ({
	user,
	disabled,
	disabledReason,
}: RemoveUserActionProps) => {
	const confirmDialog = useBoolean();
	const { t } = useTranslate();
	const { tenantId } = useParams();
	const queryClient = useQueryClient();
	const fullName = getUserFullName({
		firstName: user.firstName,
		lastName: user.lastName,
	});

	const { mutate: removeUser, isPending: isRemoving } = useRemoveTenantUser({
		// Row-level tenant-user actions rely on the centralized mutation error
		// handler to translate RFC7807/translationKey failures consistently.
		onSuccess: () => {
			toast.success(t('user-removed-success'));
			confirmDialog.onFalse();
			if (tenantId) {
				queryClient.invalidateQueries({
					queryKey: useFindTenantUsers.getKey({
						tenantId,
					}),
				});
			}
		},
	});

	const onConfirmRemove = () => {
		if (!tenantId) {
			return;
		}

		removeUser({ tenantId, userId: user.id });
	};

	return (
		<>
			<Tooltip
				title={
					disabled
						? disabledReason
						: t('remove-user-from-tenant', {
								defaultValue: 'Remove from tenant',
							})
				}
				placement="top"
				arrow
			>
				<Box component="span">
					<IconButton
						color="default"
						onClick={confirmDialog.onTrue}
						disabled={isRemoving || disabled}
						sx={{
							color: disabled ? 'action.disabled' : 'error.main',
						}}
					>
						<Iconify icon="solar:trash-bin-trash-bold" width={18} />
					</IconButton>
				</Box>
			</Tooltip>

			<ConfirmDialog
				open={confirmDialog.value}
				onClose={confirmDialog.onFalse}
				title={t('remove-user-from-tenant', {
					defaultValue: 'Remove from tenant',
				})}
				content={t('confirm-remove-user-from-tenant', {
					name: fullName,
					defaultValue:
						'Are you sure you want to remove {{name}} from this tenant?',
				})}
				action={
					<Button
						variant="contained"
						color="error"
						onClick={onConfirmRemove}
						disabled={isRemoving}
					>
						{t('remove')}
					</Button>
				}
			/>
		</>
	);
};
