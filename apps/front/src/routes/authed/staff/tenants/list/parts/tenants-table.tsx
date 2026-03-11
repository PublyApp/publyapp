import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Link from '@mui/material/Link';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Select, { type SelectChangeEvent } from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import _ from 'lodash';
import {
	createMRTColumnHelper,
	MaterialReactTable,
	type MRT_ColumnDef,
	type MRT_SortingState,
} from 'material-react-table';
import { useDebounce } from 'minimal-shared/hooks';
import { nanoid } from 'nanoid';
import { parseAsString, useQueryStates } from 'nuqs';
import { useEffect, useMemo, useState } from 'react';

import type { TenantAsStaffListItem } from '@org/client-ts/src/models';
import {
	DEFAULT_PAGE_SIZE,
	FRONT_PATH_NAMES,
	TENANT_STATUS_ENUM,
	voidFunction,
} from '@org/shared-ts/lib/constants';
import { ConfirmDialog } from '@/front/components/custom-dialog/confirm-dialog';
import { Iconify } from '@/front/components/iconify/iconify';
import { Label } from '@/front/components/label/label';
import type { LabelColor } from '@/front/components/label/types';
import { RouterLink } from '@/front/components/router-link';
import { toast } from '@/front/components/snackbar';
import { useMRTTable } from '@/front/hooks/use-mrt-table';
import { useTableQueryOptions } from '@/front/hooks/use-table-query-options';
import { useTableState } from '@/front/hooks/use-table-state';
import { useTranslate } from '@/front/hooks/use-translate';
import { getUntypedNumber } from '@/front/lib/js-client/kiota-utils';
import {
	useBulkDeleteTenants,
	useBulkReactivateTenants,
	useBulkSuspendTenants,
	useFindTenants,
	useReactivateTenant,
	useSuspendTenant,
} from '@/front/lib/react-query/features/staff/staff-tenant.hooks';

export type TenantRowData = {
	id: string;
	name: string;
	logoUrl: string;
	usersCount: number;
	maxUsers: number;
	status: string;
	isSuspended: boolean;
	createdAt?: Date;
	updatedAt?: Date;
	code?: string;
};

const TenantRowDataMapper = (tenant: TenantAsStaffListItem): TenantRowData => {
	return {
		id: tenant.id || nanoid(),
		name: tenant.name || '-',
		logoUrl: tenant.logoUrl || '-',
		usersCount: getUntypedNumber(tenant.usersCount, 0),
		maxUsers: getUntypedNumber(tenant.maxUsers, 0),
		status: tenant.status || '-',
		isSuspended: tenant.isSuspended ?? false,
	};
};

const columnHelper = createMRTColumnHelper<TenantRowData>();

// Use snake_case sort IDs to match backend API
const defaultSorting: MRT_SortingState[number] = {
	desc: true,
	id: 'created_at',
};

const TenantsTable = () => {
	const { t } = useTranslate();

	// Filter state with nuqs (URL-persisted)
	const [filterStates, setFilterStates] = useQueryStates({
		q: parseAsString.withDefault(''),
		status: parseAsString.withDefault(''),
	});

	const [globalFilter, setGlobalFilter] = useState(filterStates.q);
	const [statusFilter, setStatusFilter] = useState(filterStates.status);

	// Use the custom table state hook for cursor pagination
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

	// Debounce URL updates (NOT UI typing).
	const debouncedQ = useDebounce(globalFilter, 300);

	useEffect(() => {
		if (debouncedQ === filterStates.q) {
			return;
		}

		resetCursorPagination?.();
		setFilterStates({ q: debouncedQ, status: statusFilter });
	}, [
		debouncedQ,
		filterStates.q,
		resetCursorPagination,
		setFilterStates,
		statusFilter,
	]);

	const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value;
		setGlobalFilter(value);
	};

	// Status filter handler - reset cursor before updating
	const handleStatusChange = (event: SelectChangeEvent) => {
		const value = event.target.value;
		resetCursorPagination?.();
		setStatusFilter(value);
		setFilterStates({ q: globalFilter, status: value });
	};

	// Row selection state for bulk actions
	const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});

	// Bulk action mutations
	const queryClient = useQueryClient();
	const [bulkActionDialog, setBulkActionDialog] = useState<{
		type: 'suspend' | 'reactivate' | 'delete';
		open: boolean;
	}>({ type: 'suspend', open: false });

	const { mutate: bulkSuspend, isPending: isBulkSuspending } =
		useBulkSuspendTenants({
			onSuccess: (result) => {
				const succeeded = result.succeededCount ?? 0;
				const failed = result.failedCount ?? 0;
				if (failed > 0) {
					toast.warning(
						t('bulk-action-partial-success', {
							action: t('suspended') ?? 'suspended',
							succeeded,
							failed,
						}),
					);
				} else {
					toast.success(
						t('bulk-action-success', {
							action: t('suspended') ?? 'suspended',
							count: succeeded,
						}),
					);
				}
				setBulkActionDialog({ type: 'suspend', open: false });
				setRowSelection({});
				queryClient.invalidateQueries({
					queryKey: useFindTenants.getKey(),
				});
			},
		});

	const { mutate: bulkReactivate, isPending: isBulkReactivating } =
		useBulkReactivateTenants({
			onSuccess: (result) => {
				const succeeded = result.succeededCount ?? 0;
				const failed = result.failedCount ?? 0;
				if (failed > 0) {
					toast.warning(
						t('bulk-action-partial-success', {
							action: t('reactivate') ?? 'reactivated',
							succeeded,
							failed,
						}),
					);
				} else {
					toast.success(
						t('bulk-action-success', {
							action: t('reactivate') ?? 'reactivated',
							count: succeeded,
						}),
					);
				}
				setBulkActionDialog({ type: 'reactivate', open: false });
				setRowSelection({});
				queryClient.invalidateQueries({
					queryKey: useFindTenants.getKey(),
				});
			},
		});

	const { mutate: bulkDelete, isPending: isBulkDeleting } =
		useBulkDeleteTenants({
			onSuccess: (result) => {
				const succeeded = result.succeededCount ?? 0;
				const failed = result.failedCount ?? 0;
				if (failed > 0) {
					toast.warning(
						t('bulk-action-partial-success', {
							action: t('deleted') ?? 'deleted',
							succeeded,
							failed,
						}),
					);
				} else {
					toast.success(
						t('bulk-action-success', {
							action: t('deleted') ?? 'deleted',
							count: succeeded,
						}),
					);
				}
				setBulkActionDialog({ type: 'delete', open: false });
				setRowSelection({});
				queryClient.invalidateQueries({
					queryKey: useFindTenants.getKey(),
				});
			},
		});

	const handleBulkSuspend = () => {
		const selectedIds = Object.keys(rowSelection);
		bulkSuspend({ tenantIds: selectedIds });
	};

	const handleBulkReactivate = () => {
		const selectedIds = Object.keys(rowSelection);
		bulkReactivate({ tenantIds: selectedIds });
	};

	const handleBulkDelete = () => {
		const selectedIds = Object.keys(rowSelection);
		bulkDelete({ tenantIds: selectedIds });
	};

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

	// Sync latest cursor into the table state outside render
	useEffect(() => {
		if (setNextCursor) {
			setNextCursor(tenantsQuery.data?.nextCursor ?? null);
		}
	}, [tenantsQuery.data?.nextCursor, setNextCursor]);

	const { renderEmptyRowsFallback, queryState } = useTableQueryOptions({
		query: tenantsQuery,
		emptyContent: {
			title: _.capitalize(
				t('no-items-found', {
					item: t('tenants'),
					ns: 'response-message',
				}),
			),
		},
		errorContent: {
			title: _.capitalize(
				t('error-loading-items', {
					item: t('tenants'),
					ns: 'response-message',
				}),
			),
		},
	});

	const dataTable = useMemo(() => {
		if (!tenantsQuery.data?.data) return [];
		return _.map(tenantsQuery.data.data, (tenant) =>
			TenantRowDataMapper(tenant),
		);
	}, [tenantsQuery.data]);

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
		onRowSelectionChange: (updater) => {
			if (typeof updater === 'function') {
				setRowSelection(updater(rowSelection));
			} else {
				setRowSelection(updater);
			}
		},
		onSortingChange: handleSortingChange,
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
			isPending: tenantsQuery.isPending,
		},
		renderEmptyRowsFallback,
		muiTablePaperProps: {
			sx: {
				flexGrow: 1,
			},
		},
	});

	// Bulk actions
	const selectedCount = Object.keys(rowSelection).length;

	// Toolbar with search and filters
	const renderTopToolbar = () => {
		return (
			<Box
				sx={{
					p: 2,
					display: 'flex',
					gap: 2,
					alignItems: 'center',
					flexWrap: 'wrap',
				}}
			>
				<TextField
					size="small"
					placeholder={t('search-tenants')}
					value={globalFilter}
					onChange={handleSearchChange}
					slotProps={{
						input: {
							startAdornment: (
								<InputAdornment position="start">
									<Iconify icon="eva:search-fill" />
								</InputAdornment>
							),
						},
					}}
					sx={{ minWidth: 250 }}
				/>

				<Select
					size="small"
					value={statusFilter}
					onChange={handleStatusChange}
					displayEmpty
					sx={{ minWidth: 150 }}
				>
					<MenuItem value="">{t('all-statuses')}</MenuItem>
					<MenuItem value="active">{t('active')}</MenuItem>
					<MenuItem value="pending">{t('pending')}</MenuItem>
					<MenuItem value="suspended">{t('suspended')}</MenuItem>
					<MenuItem value="archived">{t('archived')}</MenuItem>
				</Select>

				<Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
					<Button
						size="small"
						variant="outlined"
						onClick={() => {
							// Client-side export of current page only
							// Note: Full filtered export requires backend endpoint
							const dataToExport = dataTable;
							const headers = [
								'Name',
								'Status',
								'Users',
								'Max Users',
								'Suspended',
							];
							const rows = dataToExport.map((t) => [
								`"${t.name}"`,
								t.status,
								t.usersCount.toString(),
								t.maxUsers.toString(),
								t.isSuspended ? 'Yes' : 'No',
							]);
							const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
							const blob = new Blob([csv], { type: 'text/csv' });
							const url = URL.createObjectURL(blob);
							const a = document.createElement('a');
							a.href = url;
							a.download = 'tenants.csv';
							a.click();
							URL.revokeObjectURL(url);
						}}
						startIcon={<Iconify icon="solar:download-bold" />}
					>
						{t('export-csv')}
					</Button>
					<Button
						size="small"
						variant="outlined"
						onClick={() => {
							// Client-side export of current page only
							const blob = new Blob([JSON.stringify(dataTable, null, 2)], {
								type: 'application/json',
							});
							const url = URL.createObjectURL(blob);
							const a = document.createElement('a');
							a.href = url;
							a.download = 'tenants.json';
							a.click();
							URL.revokeObjectURL(url);
						}}
						startIcon={<Iconify icon="solar:copy-bold" />}
					>
						{t('export-json')}
					</Button>
				</Box>

				{selectedCount > 0 && (
					<Box
						sx={{ ml: 'auto', display: 'flex', gap: 1, alignItems: 'center' }}
					>
						<Typography variant="body2">
							{t('selected-count', { count: selectedCount })}
						</Typography>
						<Button
							size="small"
							color="warning"
							variant="outlined"
							onClick={() =>
								setBulkActionDialog({ type: 'suspend', open: true })
							}
							startIcon={<Iconify icon="solar:forbidden-circle-bold" />}
						>
							{t('bulk-suspend')}
						</Button>
						<Button
							size="small"
							color="success"
							variant="outlined"
							onClick={() =>
								setBulkActionDialog({ type: 'reactivate', open: true })
							}
							startIcon={<Iconify icon="solar:play-circle-bold" />}
						>
							{t('bulk-reactivate')}
						</Button>
						<Button
							size="small"
							color="error"
							variant="outlined"
							onClick={() =>
								setBulkActionDialog({ type: 'delete', open: true })
							}
							startIcon={<Iconify icon="solar:trash-bin-trash-bold" />}
						>
							{t('bulk-delete')}
						</Button>
					</Box>
				)}
			</Box>
		);
	};

	return (
		<Box
			sx={{
				flexGrow: 1,
				display: 'flex',
				flexDirection: 'column',
				border: 'none',
			}}
		>
			{renderTopToolbar()}
			<MaterialReactTable table={table} />

			{/* Bulk Suspend Confirmation Dialog */}
			<ConfirmDialog
				open={bulkActionDialog.type === 'suspend' && bulkActionDialog.open}
				onClose={() => setBulkActionDialog({ type: 'suspend', open: false })}
				title={t('bulk-suspend')}
				content={t('bulk-suspend-confirm', { count: selectedCount })}
				action={
					<Button
						variant="contained"
						color="warning"
						onClick={handleBulkSuspend}
						disabled={isBulkSuspending}
					>
						{t('suspend')}
					</Button>
				}
			/>

			{/* Bulk Reactivate Confirmation Dialog */}
			<ConfirmDialog
				open={bulkActionDialog.type === 'reactivate' && bulkActionDialog.open}
				onClose={() => setBulkActionDialog({ type: 'reactivate', open: false })}
				title={t('bulk-reactivate')}
				content={t('bulk-reactivate-confirm', { count: selectedCount })}
				action={
					<Button
						variant="contained"
						color="success"
						onClick={handleBulkReactivate}
						disabled={isBulkReactivating}
					>
						{t('reactivate')}
					</Button>
				}
			/>

			{/* Bulk Delete Confirmation Dialog */}
			<ConfirmDialog
				open={bulkActionDialog.type === 'delete' && bulkActionDialog.open}
				onClose={() => setBulkActionDialog({ type: 'delete', open: false })}
				title={t('bulk-delete')}
				content={t('bulk-delete-confirm', { count: selectedCount })}
				action={
					<Button
						variant="contained"
						color="error"
						onClick={handleBulkDelete}
						disabled={isBulkDeleting}
					>
						{t('delete')}
					</Button>
				}
			/>
		</Box>
	);
};

export default TenantsTable;

// ----------------------------------------------------------------------

const TenantCell: MRT_ColumnDef<TenantRowData, string>['Cell'] = (props) => {
	const name = props.row.original.name;
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
			<Avatar alt={name} variant="rounded" sx={{ width: 46, height: 46 }} />

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

	const status = props.cell.getValue();

	let color: LabelColor = 'default';

	if (status === TENANT_STATUS_ENUM.ACTIVE) {
		color = 'success';
	} else if (status === TENANT_STATUS_ENUM.PENDING) {
		color = 'warning';
	} else if (status === TENANT_STATUS_ENUM.SUSPENDED) {
		color = 'error';
	} else if (status === TENANT_STATUS_ENUM.ARCHIVED) {
		color = 'warning';
	}

	return (
		<Label variant="soft" color={color}>
			{status || _.toLower(t('unknown-item', { item: 'status' }))}
		</Label>
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
	const tenantId = props.row.original.id;
	const tenantName = props.row.original.name;
	const status = props.row.original.status;
	const isSuspended = props.row.original.isSuspended;
	const { t } = useTranslate();
	const queryClient = useQueryClient();

	const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
	const [reactivateDialogOpen, setReactivateDialogOpen] = useState(false);

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

	const handleSuspend = () => {
		suspendTenant({ tenantId });
	};

	const handleReactivate = () => {
		reactivateTenant({ tenantId });
	};

	// Show suspend button only when tenant is Active and not already suspended
	const canSuspend = status === TENANT_STATUS_ENUM.ACTIVE && !isSuspended;
	// Show reactivate button only when tenant is suspended
	const canReactivate = isSuspended;

	return (
		<>
			<Box sx={{ display: 'flex', alignItems: 'center' }}>
				<Tooltip title={t('view-details')} placement="top" arrow>
					<IconButton
						color={'default'}
						LinkComponent={RouterLink}
						href={FRONT_PATH_NAMES.staff.tenants.details(tenantId).root}
					>
						<Iconify icon="solar:eye-bold" />
					</IconButton>
				</Tooltip>

				{canSuspend && (
					<Tooltip title={t('suspend')} placement="top" arrow>
						<IconButton
							color={'default'}
							onClick={() => setSuspendDialogOpen(true)}
							sx={{ color: 'warning.main' }}
						>
							<Iconify icon="solar:forbidden-circle-bold" />
						</IconButton>
					</Tooltip>
				)}

				{canReactivate && (
					<Tooltip title={t('reactivate')} placement="top" arrow>
						<IconButton
							color={'default'}
							onClick={() => setReactivateDialogOpen(true)}
							sx={{ color: 'success.main' }}
						>
							<Iconify icon="solar:play-circle-bold" />
						</IconButton>
					</Tooltip>
				)}

				<Tooltip title="Delete" placement="top" arrow>
					<IconButton
						color={'default'}
						onClick={voidFunction}
						sx={{ color: 'error.main' }}
					>
						<Iconify icon="solar:trash-bin-trash-bold" />
					</IconButton>
				</Tooltip>
			</Box>

			<ConfirmDialog
				open={suspendDialogOpen}
				onClose={() => setSuspendDialogOpen(false)}
				title={t('suspend-tenant')}
				content={t('suspend-tenant-confirm', { name: tenantName })}
				action={
					<Button
						variant="contained"
						color="warning"
						onClick={handleSuspend}
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
				content={t('reactivate-tenant-confirm', { name: tenantName })}
				action={
					<Button
						variant="contained"
						color="success"
						onClick={handleReactivate}
						disabled={isReactivating}
					>
						{t('reactivate')}
					</Button>
				}
			/>
		</>
	);
};
