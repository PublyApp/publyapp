import Autocomplete from '@mui/material/Autocomplete';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
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
import _ from 'lodash';
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
import { useEffect, useId, useMemo, useState } from 'react';
import { useParams } from 'react-router';

import {
	ACCOUNT_LEVEL_ENUM,
	DEFAULT_PAGE_SIZE,
	FRONT_PATH_NAMES,
	USER_STATUS_ENUM,
	voidFunction,
} from '@org/shared-ts/lib/constants';
import { logger } from '@org/shared-ts/lib/logger/iso-logger';
import { getErrorMessage } from '@org/shared-ts/utils/error.utils';
import { getUserFullName } from '@org/shared-ts/utils/user.utils';
import { ConfirmDialog } from '@/front/components/custom-dialog/confirm-dialog';
import DrawerAnchor from '@/front/components/drawer-anchor';
import { Iconify } from '@/front/components/iconify/iconify';
import type { LabelColor } from '@/front/components/label';
import { Label } from '@/front/components/label/label';
import { RouterLink } from '@/front/components/router-link';
import { toast } from '@/front/components/snackbar';
import { useMRTTable } from '@/front/hooks/use-mrt-table';
import { useTableQueryOptions } from '@/front/hooks/use-table-query-options';
import { useTableState } from '@/front/hooks/use-table-state';
import { useTranslate } from '@/front/hooks/use-translate';
import {
	useGetVerificationLink,
	useSendEmailVerificationReminder,
} from '@/front/lib/react-query/features/common/auth.hooks';
import {
	useFindTenantUsers,
	useRemoveTenantUser,
	useUpdateTenantUser,
} from '@/front/lib/react-query/features/staff/staff-tenant.hooks';

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

const parseStatusFilter = (value: string) => {
	if (!value) {
		return [];
	}

	return value.split(',').filter(Boolean);
};

const TenantUsersTable = () => {
	const { t } = useTranslate();
	const { tenantId } = useParams();
	const queryClient = useQueryClient();
	const searchTooltipId = useId();
	const statusTooltipId = useId();
	const statusOptions = useMemo(() => {
		return [
			{ label: t('active'), value: USER_STATUS_ENUM.ACTIVE },
			{ label: t('pending'), value: USER_STATUS_ENUM.PENDING },
			{ label: t('suspended'), value: USER_STATUS_ENUM.SUSPENDED },
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
	const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
	const [selectionActionAnchorEl, setSelectionActionAnchorEl] =
		useState<null | HTMLElement>(null);
	const [exportDialogOpen, setExportDialogOpen] = useState(false);
	const [exportFormat, setExportFormat] = useState<'csv' | 'json' | 'xlsx'>(
		'csv',
	);
	const [bulkRemoveDialogOpen, setBulkRemoveDialogOpen] = useState(false);

	const debouncedSearchValue = useDebounce(searchValue, 300);

	const {
		handlePaginationChange,
		handleSortingChange,
		apiVariables,
		tableState,
		setNextCursor,
		hasNextPage,
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
		if (!_.isEqual(nextStatusFilter, statusFilter)) {
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
		const nextStatusFilter = selectedOptions.map((option) => option.value);
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
					return getUserFullName(_.pick(row, ['firstName', 'lastName']));
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
			tenantId: _.toString(tenantId),
			cursor: apiVariables.cursor || undefined,
			limit: apiVariables.limit,
			sort: apiVariables.sort,
			q: filterStates.q || undefined,
			status: filterStates.status || undefined,
		},
		enabled: !!tenantId,
	});

	// Sync latest cursor into the table state outside render
	useEffect(() => {
		if (setNextCursor) {
			setNextCursor(tenantUsersQuery.data?.nextCursor);
		}
	}, [tenantUsersQuery.data?.nextCursor, setNextCursor]);

	const { renderEmptyRowsFallback, queryState } = useTableQueryOptions({
		query: tenantUsersQuery,
		emptyContent: {
			title: _.capitalize(
				t('no-items-found', {
					item: t('users'),
					ns: 'response-message',
				}),
			),
		},
		errorContent: {
			title: _.capitalize(
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

		return _.map(tenantUsersQuery.data.data, (tenantUser) => {
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
		setSelectionActionAnchorEl(null);
	};

	const openExportDialog = () => {
		closeSelectionActionMenu();
		setExportFormat('csv');
		setExportDialogOpen(true);
	};

	const exportRows = (format: 'csv' | 'json') => {
		const rowsToExport = isSelectionMode ? selectedRows : rows;

		if (format === 'csv') {
			const headers = ['Name', 'Email', 'Level', 'Status'];
			const csvRows = rowsToExport.map((row) => [
				`"${getUserFullName(_.pick(row, ['firstName', 'lastName']))}"`,
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
		setExportDialogOpen(false);
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

		for (const userId of Object.keys(rowSelection)) {
			try {
				await removeTenantUserAsync({
					tenantId,
					userId,
				});
				succeeded += 1;
			} catch {
				failed += 1;
			}
		}

		setBulkRemoveDialogOpen(false);
		setRowSelection({});
		await queryClient.invalidateQueries({
			queryKey: useFindTenantUsers.getKey({ tenantId }),
		});

		if (succeeded === 0 && failed > 0) {
			toast.error(
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
						setSelectionActionAnchorEl(event.currentTarget);
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
							setBulkRemoveDialogOpen(true);
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
			setRowSelection((prev) => {
				if (typeof updater === 'function') {
					return updater(prev);
				}

				return updater;
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
			handlePaginationChange,
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

	return (
		<Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
			<MaterialReactTable table={table} />

			<Dialog
				open={exportDialogOpen}
				onClose={() => setExportDialogOpen(false)}
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
										count: rows.length,
										defaultValue:
											'Export the current result set ({{count}} item(s)).',
									})}
						</Typography>
						<Tabs
							value={exportFormat}
							onChange={(_event, value: 'csv' | 'json' | 'xlsx') => {
								if (value) {
									setExportFormat(value);
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
					<Button variant="outlined" onClick={() => setExportDialogOpen(false)}>
						{t('cancel')}
					</Button>
				</DialogActions>
			</Dialog>

			<ConfirmDialog
				open={bulkRemoveDialogOpen}
				onClose={() => setBulkRemoveDialogOpen(false)}
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
						{t('remove', { defaultValue: 'Remove' })}
					</Button>
				}
			/>
		</Box>
	);
};

export default TenantUsersTable;

// ----------------------------------------------------------------------

const UserCell: MRT_ColumnDef<TenantUserRowData, string>['Cell'] = (props) => {
	const userId = props.row.original.id;
	const fullName = props.cell.getValue();
	const avatarUrl = props.row.original.avatarUrl;
	const email = props.row.original.email;
	const openDrawer = useBoolean();

	const userDetailsLink = FRONT_PATH_NAMES.staff.tenantUsers.details(userId);

	return (
		<Box sx={{ gap: 2, display: 'flex', alignItems: 'center' }}>
			<Avatar alt={fullName} src={avatarUrl} />

			<Stack
				sx={{
					typography: 'body2',
					flex: '1 1 auto',
					alignItems: 'flex-start',
				}}
			>
				<Stack direction="row" gap={0.7}>
					<Link
						color="inherit"
						sx={{ cursor: 'pointer' }}
						onClick={openDrawer.onTrue}
					>
						{fullName}
					</Link>
					<Link
						component={RouterLink}
						href={userDetailsLink}
						color="text.secondary"
						sx={{ position: 'relative', top: -3 }}
					>
						<Iconify
							icon="eva:external-link-outline"
							width={16}
							height={16}
							fontWeight={900}
						/>
					</Link>
				</Stack>
				<Box component="span" sx={{ color: 'text.disabled' }}>
					{email}
				</Box>
			</Stack>
			<Drawer
				open={openDrawer.value}
				onClose={openDrawer.onFalse}
				anchor="right"
				sx={(theme) => {
					return {
						zIndex: theme.zIndex.modal + 1,
					};
				}}
				slotProps={{
					paper: {
						sx: {
							width: 720,
							overflow: 'unset',
						},
					},
				}}
			>
				<DrawerAnchor component={RouterLink} href={userDetailsLink}>
					<Iconify icon="eva:expand-outline" />
				</DrawerAnchor>
				<Box sx={{ width: 300, p: 2 }}>
					<Typography>{fullName}</Typography>
				</Box>
			</Drawer>
		</Box>
	);
};

const StatusCell: MRT_ColumnDef<TenantUserRowData, string>['Cell'] = (
	props,
) => {
	const { t } = useTranslate();

	const status = props.cell.getValue();

	let t_message: string = t('unknown-item', { item: 'status' });
	let color: LabelColor = 'default';

	if (status === USER_STATUS_ENUM.ACTIVE) {
		t_message = t('active');
		color = 'success';
	} else if (status === USER_STATUS_ENUM.PENDING) {
		t_message = t('pending');
		color = 'warning';
	} else if (status === USER_STATUS_ENUM.BANNED) {
		t_message = t('banned');
		color = 'error';
	} else if (status === USER_STATUS_ENUM.SUSPENDED) {
		t_message = t('suspended');
		color = 'warning';
	} else if (status === USER_STATUS_ENUM.INACTIVE) {
		t_message = t('inactive');
		color = 'default';
	}

	return (
		<Label variant="soft" color={color}>
			{t_message}
		</Label>
	);
};

const LevelCell: MRT_ColumnDef<TenantUserRowData, string>['Cell'] = (props) => {
	const { t } = useTranslate();

	const level = props.cell.getValue();

	let t_message: string = t('unknown-item', { item: 'role' });
	let color: LabelColor = 'default';

	if (level === ACCOUNT_LEVEL_ENUM.ADMIN) {
		t_message = t('admin');
		color = 'success';
	} else if (level === ACCOUNT_LEVEL_ENUM.USER) {
		t_message = t('user');
		color = 'warning';
	}

	return (
		<Label variant="soft" color={color}>
			{t_message}
		</Label>
	);
};

const ALLOW_COPY_LINK = false;

const UserActionsCell: MRT_ColumnDef<TenantUserRowData>['Cell'] = (props) => {
	const userId = props.row.original.id;
	const isUserPending = props.row.original.status === USER_STATUS_ENUM.PENDING;
	const currentLevel = props.row.original.level;

	const confirmDialog = useBoolean();
	const levelMenuAnchor = useBoolean();
	const { t } = useTranslate();
	const { tenantId } = useParams();
	const queryClient = useQueryClient();

	const { mutate: removeUser, isPending: isRemoving } = useRemoveTenantUser({
		onSuccess: () => {
			toast.success(t('user-removed-success'));
			confirmDialog.onFalse();
			if (tenantId) {
				queryClient.invalidateQueries({
					queryKey: useFindTenantUsers.getKey({ tenantId }),
				});
			}
		},
		onError: (error: unknown) => {
			const message =
				(error as { message?: string })?.message || t('user-removed-error');
			toast.error(message);
		},
	});

	const { mutate: updateUser, isPending: isUpdating } = useUpdateTenantUser({
		onSuccess: () => {
			toast.success(t('user-level-updated-success'));
			levelMenuAnchor.onFalse();
			if (tenantId) {
				queryClient.invalidateQueries({
					queryKey: useFindTenantUsers.getKey({ tenantId }),
				});
			}
		},
		onError: (error: unknown) => {
			const message =
				(error as { message?: string })?.message ||
				t('user-level-updated-error');
			toast.error(message);
		},
	});

	const onConfirmDeleteRow = () => {
		if (!tenantId) return;
		removeUser({ tenantId, userId });
	};

	const handleChangeLevel = (newLevel: 'Admin' | 'User') => {
		if (!tenantId) return;
		updateUser({ tenantId, userId, level: newLevel });
	};

	const isLoading = isRemoving || isUpdating;

	const renderConfirmDialog = () => (
		<ConfirmDialog
			open={confirmDialog.value}
			onClose={confirmDialog.onFalse}
			title={t('delete-item', { item: t('staff-user') })}
			content={t('confirm-delete-dialog-text')}
			action={
				<Button
					variant="contained"
					color="error"
					onClick={onConfirmDeleteRow}
					disabled={isLoading}
				>
					{t('delete')}
				</Button>
			}
		/>
	);

	return (
		<>
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
				<Tooltip title={t('change-role')} placement="top" arrow>
					<IconButton
						color={'default'}
						onClick={levelMenuAnchor.onTrue}
						disabled={isLoading}
					>
						<Iconify icon="solar:shield-check-bold" />
					</IconButton>
				</Tooltip>

				<Menu
					open={levelMenuAnchor.value}
					onClose={levelMenuAnchor.onFalse}
					anchorEl={levelMenuAnchor.value ? document.activeElement : null}
					anchorOrigin={{
						vertical: 'top',
						horizontal: 'left',
					}}
					transformOrigin={{
						vertical: 'top',
						horizontal: 'right',
					}}
				>
					<MenuItem
						disabled={currentLevel === 'Admin'}
						onClick={() => handleChangeLevel('Admin')}
					>
						<Stack direction="row" alignItems="center" gap={1}>
							<Iconify icon="solar:shield-check-bold" />
							{t('admin')}
						</Stack>
					</MenuItem>
					<MenuItem
						disabled={currentLevel === 'User'}
						onClick={() => handleChangeLevel('User')}
					>
						<Stack direction="row" alignItems="center" gap={1}>
							<Iconify icon="solar:user-id-bold" />
							{t('user')}
						</Stack>
					</MenuItem>
				</Menu>

				<FollowUpButton
					isUserPending={isUserPending}
					email={props.row.original.email}
				/>

				<CopyLinkButton
					isUserPending={isUserPending}
					userId={userId}
					onClose={voidFunction}
				/>

				<Tooltip title={t('view-details')} placement="top" arrow>
					<IconButton
						color={'default'}
						LinkComponent={RouterLink}
						href={FRONT_PATH_NAMES.staff.tenantUsers.details(userId)}
					>
						<Iconify icon="solar:eye-bold" />
					</IconButton>
				</Tooltip>

				<Tooltip title={t('delete')} placement="top" arrow>
					<IconButton
						color={'default'}
						onClick={confirmDialog.onTrue}
						disabled={isLoading}
						sx={{ color: 'error.main' }}
					>
						<Iconify icon="solar:trash-bin-trash-bold" />
					</IconButton>
				</Tooltip>
			</Box>

			{renderConfirmDialog()}
		</>
	);
};

const CopyLinkButton = ({
	isUserPending,
	userId,
	onClose,
	forceShow = false,
}: {
	isUserPending: boolean;
	userId: string;
	onClose?: () => void;
	forceShow?: boolean;
}) => {
	const { t } = useTranslate();

	const {
		data: linkData,
		refetch: fetchVerificationLink,
		isLoading: isLoadingGetVerificationLink,
	} = useGetVerificationLink({
		variables: { userId },
		enabled: false,
	});

	if ((!isUserPending || !ALLOW_COPY_LINK) && !forceShow) {
		return null;
	}

	return (
		<Tooltip
			title={_.capitalize(t('copy-item', { item: t('verification-link') }))}
			placement="top"
		>
			<IconButton
				color={'default'}
				loading={isLoadingGetVerificationLink}
				onClick={async () => {
					let link = linkData?.link || 'unable to get verification link';
					if (!linkData) {
						const result = await fetchVerificationLink();
						if (result.error) {
							logger.error(getErrorMessage(result.error), {
								error: result.error,
							});
							toast.error(t('copy-to-clipboard-error'));
							return;
						}
						if (result.data) {
							link = result.data.link || link;
						}
					}
					navigator.clipboard.writeText(link);
					toast.success(t('copy-to-clipboard-success'));
					onClose?.();
				}}
			>
				<Iconify icon="solar:copy-bold-duotone" />
			</IconButton>
		</Tooltip>
	);
};

const FollowUpButton = ({
	isUserPending,
	email,
	forceShow = false,
}: {
	isUserPending: boolean;
	email: string;
	forceShow?: boolean;
}) => {
	const { t } = useTranslate();

	const {
		mutateAsync: sendEmailVerificationReminder,
		isPending: isPendingSendEmailVerificationReminder,
	} = useSendEmailVerificationReminder({
		onSuccess: () => {
			toast.success(t('email-verification-follow-up-success'));
		},
	});

	if (!isUserPending && !forceShow) return null;

	return (
		<Tooltip
			title={_.capitalize(t('send-email-verification-follow-up'))}
			placement="top"
		>
			<IconButton
				color={'default'}
				loading={isPendingSendEmailVerificationReminder}
				onClick={async () => {
					await sendEmailVerificationReminder({ email });
				}}
			>
				<Iconify icon="custom:send-fill" />
			</IconButton>
		</Tooltip>
	);
};
