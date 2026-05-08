import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Link from '@mui/material/Link';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import capitalize from 'lodash/capitalize';
import toStr from 'lodash/toString';
import trim from 'lodash/trim';
import values from 'lodash/values';
import {
	createMRTColumnHelper,
	MaterialReactTable,
	type MRT_ColumnDef,
	type MRT_Localization,
	type MRT_SortingState,
	type MRT_TableOptions,
} from 'material-react-table';
import { useBoolean } from 'minimal-shared/hooks';
import { varAlpha } from 'minimal-shared/utils';
import { parseAsString, useQueryStates } from 'nuqs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router';

import type { TenantUserCompanyForStaffResult } from '@org/client-ts/src/models';
import {
	ACCOUNT_LEVEL_ENUM,
	type AccountLevel,
	DEFAULT_PAGE_SIZE,
	FRONT_PATH_NAMES,
	USER_STATUS_ENUM,
} from '@org/shared-ts/lib/constants';

import { ConfirmDialog } from '#app/components/custom-dialog/confirm-dialog.tsx';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { Label } from '#app/components/label/label.tsx';
import type { LabelColor } from '#app/components/label/types.ts';
import { RouterLink } from '#app/components/router-link.tsx';
import { toast } from '#app/components/snackbar/index.ts';
import { useTableRowSelection } from '#app/hooks/table/use-table-row-selection.ts';
import { useUrlBackedDebouncedSearch } from '#app/hooks/table/use-url-backed-debounced-search.ts';
import { useMRTTable } from '#app/hooks/use-mrt-table.ts';
import { useTableQueryOptions } from '#app/hooks/use-table-query-options.tsx';
import { useTableState } from '#app/hooks/use-table-state.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { SelectionLockedControl } from '#app/lib/mrt-table/components/selection-locked-control.tsx';
import {
	useFindTenantUserCompanies,
	useReactivateTenantUser,
	useRemoveTenantUser,
	useSuspendTenantUser,
	useUpdateTenantUser,
} from '#app/lib/react-query/features/staff/staff-tenant.hooks.ts';

import { invalidateTenantUserCompanyQueries } from './tenant-user-companies-cache.ts';
import TenantUserCompaniesExportDialogController, {
	type TenantUserCompaniesExportDialogControllerRef,
} from './tenant-user-companies-export-dialog-controller.tsx';
import TenantUserCompaniesSelectionActions from './tenant-user-companies-selection-actions.tsx';
import type { TenantUserCompanyData } from './tenant-user-companies-table.types.ts';

const GLOBALLY_SUSPENDED_STATUS_VALUE = 'globally_suspended';
const GLOBALLY_SUSPENDED_STATUS_DESCRIPTION = 'GloballySuspended';

const ACCOUNT_LEVEL_OPTIONS: AccountLevel[] = values(ACCOUNT_LEVEL_ENUM);
const columnHelper = createMRTColumnHelper<TenantUserCompanyData>();
const defaultSorting: MRT_SortingState[number] = {
	desc: false,
	id: 'tenant_name',
};

const isGloballySuspendedStatus = (status: string | null) => {
	return (
		status === GLOBALLY_SUSPENDED_STATUS_VALUE ||
		status === GLOBALLY_SUSPENDED_STATUS_DESCRIPTION
	);
};

type TenantUserCompaniesTableProps = {
	onLinkCompany: () => void;
};

const TenantUserCompaniesTable = ({
	onLinkCompany,
}: TenantUserCompaniesTableProps) => {
	const { userId = '' } = useParams();
	const { t } = useTranslate();
	const exportDialogRef =
		useRef<TenantUserCompaniesExportDialogControllerRef | null>(null);
	const [filterStates, setFilterStates] = useQueryStates({
		q: parseAsString.withDefault(''),
	});
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

	const companiesQuery = useFindTenantUserCompanies({
		variables: {
			userId,
			cursor: apiVariables.cursor || undefined,
			limit: apiVariables.limit,
			sort: apiVariables.sort,
			q: filterStates.q || undefined,
		},
		enabled: userId.length > 0,
	});

	useEffect(() => {
		setNextCursor?.(companiesQuery.data?.nextCursor);
	}, [companiesQuery.data?.nextCursor, setNextCursor]);

	const rows = useMemo<TenantUserCompanyData[]>(() => {
		return (companiesQuery.data?.data ?? []).map(
			(company: TenantUserCompanyForStaffResult) => ({
				id: toStr(company.tenantId),
				tenantId: toStr(company.tenantId),
				tenantName: company.tenantName ?? t('un-named'),
				tenantLogoUrl: company.tenantLogoUrl ?? undefined,
				level: company.level ?? undefined,
				status: company.status ?? undefined,
				createdAt: company.createdAt ?? undefined,
				updatedAt: company.updatedAt ?? undefined,
			}),
		);
	}, [companiesQuery.data?.data, t]);
	const {
		rowSelection,
		setRowSelection,
		selectedRows,
		selectedCount,
		isSelectionMode,
		clearSelection,
	} = useTableRowSelection({
		rows,
		reconcileVisibleRows: true,
		reconcileVisibleRowsEnabled: !companiesQuery.isFetching,
	});
	const sortingDisabledReason = t('selection-mode-disable-sorting');
	const selectionModeDisabledReason = t('selection-mode-disable-controls');
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
	const handleDebouncedSearchChange = useCallback(
		(nextSearchValue: string) => {
			resetCursorPagination?.();
			void setFilterStates({
				q: nextSearchValue,
			});
		},
		[resetCursorPagination, setFilterStates],
	);
	const { searchValue, setSearchValue } = useUrlBackedDebouncedSearch({
		persistedValue: filterStates.q,
		isSelectionMode,
		onDebouncedValueChange: handleDebouncedSearchChange,
	});

	const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		setSearchValue(event.target.value);
	};

	const { renderEmptyRowsFallback, queryState } = useTableQueryOptions({
		query: companiesQuery,
		emptyContent: {
			title: capitalize(
				t('no-items-found', {
					item: t('companies'),
					ns: 'response-message',
				}),
			),
			renderAction: () => (
				<Button
					variant="contained"
					size="small"
					startIcon={<Iconify icon="mingcute:add-line" width={16} />}
					onClick={onLinkCompany}
					sx={{ mt: 2 }}
				>
					{t('add-first-company')}
				</Button>
			),
		},
		errorContent: {
			title: capitalize(
				t('error-loading-items', {
					item: t('companies'),
					ns: 'response-message',
				}),
			),
		},
	});

	const hasNextPage = companiesQuery.data?.nextCursor != null;
	const handleCursorPaginationChange: typeof handlePaginationChange = (
		updater,
	) => {
		setNextCursor?.(companiesQuery.data?.nextCursor);
		handlePaginationChange(updater);
	};

	const columns = useMemo(() => {
		return [
			columnHelper.accessor('tenantName', {
				id: 'tenant_name',
				header: t('tenant'),
				Cell: CompanyCell,
				size: 320,
				grow: true,
			}),
			columnHelper.accessor('level', {
				header: t('level'),
				Cell: CompanyLevelCell,
				size: 130,
				grow: false,
			}),
			columnHelper.accessor('status', {
				header: t('status'),
				Cell: CompanyStatusCell,
				size: 130,
				grow: false,
			}),
			columnHelper.display({
				id: 'actions',
				header: t('actions'),
				Cell: CompanyActionsCell,
				size: 80,
				grow: false,
			}),
		];
	}, [t]);

	const table = useMRTTable('minimal-cursor', {
		columns,
		data: rows,
		enableColumnFilters: false,
		enableGlobalFilter: false,
		enableRowSelection: true,
		manualPagination: true,
		manualSorting: true,
		localization: sortTooltipLocalization,
		getRowId: (row) => row.id,
		onRowSelectionChange: (updater) => {
			setRowSelection((prev) => {
				return typeof updater === 'function' ? updater(prev) : updater;
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
			} satisfies MRT_TableOptions<TenantUserCompanyData>['muiTableHeadCellProps'];
		},
		meta: {
			handlePaginationChange: handleCursorPaginationChange,
			hasNextPage,
			hasPreviousPage,
			isPending: companiesQuery.isPending,
			disablePaginationControls: isSelectionMode,
			renderExportActions: () => (
				<Button
					size="small"
					variant="outlined"
					onClick={() => exportDialogRef.current?.open()}
					startIcon={<Iconify icon="solar:download-bold" width={18} />}
				>
					{t('export')}
				</Button>
			),
			renderSelectionActions: () => (
				<TenantUserCompaniesSelectionActions
					selectedRows={selectedRows}
					onExportSelected={() => exportDialogRef.current?.open()}
					onClearSelection={clearSelection}
				/>
			),
			renderToolbarFilters: () => (
				<TenantUserCompaniesToolbarFilters
					isSelectionMode={isSelectionMode}
					disabledReason={selectionModeDisabledReason}
					searchValue={searchValue}
					onSearchChange={handleSearchChange}
				/>
			),
		},
		renderEmptyRowsFallback,
		muiTablePaperProps: {
			sx: {
				minHeight: 0,
				flexGrow: 1,
			},
		},
	});

	return (
		<Box
			sx={{
				minWidth: 0,
				minHeight: 0,
				flexGrow: 1,
				display: 'flex',
				flexDirection: 'column',
			}}
		>
			<MaterialReactTable table={table} />
			<TenantUserCompaniesExportDialogController
				ref={exportDialogRef}
				isSelectionMode={isSelectionMode}
				selectedCount={selectedCount}
				rows={rows}
				selectedRows={selectedRows}
			/>
		</Box>
	);
};

export default TenantUserCompaniesTable;

type TenantUserCompaniesToolbarFiltersProps = {
	isSelectionMode: boolean;
	disabledReason: string;
	searchValue: string;
	onSearchChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
};

const TenantUserCompaniesToolbarFilters = ({
	isSelectionMode,
	disabledReason,
	searchValue,
	onSearchChange,
}: TenantUserCompaniesToolbarFiltersProps) => {
	const { t } = useTranslate();

	return (
		<Stack
			direction={{ xs: 'column', sm: 'row' }}
			spacing={2}
			alignItems={{ xs: 'stretch', sm: 'center' }}
		>
			<Stack spacing={0.5} sx={{ minWidth: 0 }}>
				<Typography variant="h5">{t('companies')}</Typography>
				<Typography variant="body2" sx={{ color: 'text.secondary' }}>
					{t('list-of-items', { items: t('companies') })}
				</Typography>
			</Stack>
			<SelectionLockedControl
				isSelectionMode={isSelectionMode}
				disabledReason={disabledReason}
				describeChild
			>
				<Box component="span">
					<TextField
						size="small"
						placeholder={t('search-companies')}
						value={searchValue}
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
			</SelectionLockedControl>
		</Stack>
	);
};

const CompanyCell: MRT_ColumnDef<TenantUserCompanyData, string>['Cell'] = (
	props,
) => {
	const company = props.row.original;
	const tenantName = trim(props.cell.getValue()) || '-';
	const normalizedLogoUrl = trim(company.tenantLogoUrl ?? '');

	return (
		<Box sx={{ gap: 2, display: 'flex', alignItems: 'center', minWidth: 0 }}>
			<Avatar
				alt={tenantName}
				src={normalizedLogoUrl || undefined}
				sx={
					normalizedLogoUrl
						? {}
						: {
								bgcolor: 'background.neutral',
								color: 'text.disabled',
							}
				}
			>
				{!normalizedLogoUrl ? (
					<Iconify icon="solar:buildings-bold" width={20} />
				) : null}
			</Avatar>

			<Box sx={{ minWidth: 0 }}>
				<Link
					color="inherit"
					component={RouterLink}
					href={FRONT_PATH_NAMES.staff.tenants.details(company.tenantId).root}
					sx={{
						display: 'block',
						fontWeight: 600,
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
					}}
				>
					{tenantName}
				</Link>
				<Typography
					variant="caption"
					sx={{
						color: 'text.secondary',
						display: 'block',
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
					}}
				>
					{company.tenantId}
				</Typography>
			</Box>
		</Box>
	);
};

const CompanyLevelCell: MRT_ColumnDef<
	TenantUserCompanyData,
	string | undefined
>['Cell'] = (props) => {
	const company = props.row.original;
	const { userId = '' } = useParams();
	const { t } = useTranslate();
	const queryClient = useQueryClient();
	const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
	const tenantId = company.tenantId;
	const isGloballySuspended = isGloballySuspendedStatus(company.status ?? null);
	const level = company.level ?? '';

	let label: string = t('unknown-item', { item: 'role' });
	let color: LabelColor = 'default';

	if (level === ACCOUNT_LEVEL_ENUM.ADMIN) {
		label = t('admin');
		color = 'success';
	} else if (level === ACCOUNT_LEVEL_ENUM.USER) {
		label = t('user');
		color = 'warning';
	}

	const { mutate: updateTenantUser, isPending: isUpdatingLevel } =
		useUpdateTenantUser({
			onSuccess: async () => {
				toast.success(t('user-level-updated-success'));
				setMenuAnchorEl(null);
				await invalidateTenantUserCompanyQueries({
					queryClient,
					userId,
				});
			},
		});

	const handleChangeLevel = (nextLevel: AccountLevel) => {
		if (!ACCOUNT_LEVEL_OPTIONS.includes(nextLevel) || nextLevel === level) {
			setMenuAnchorEl(null);
			return;
		}

		updateTenantUser({ tenantId, userId, level: nextLevel });
	};

	return (
		<Box sx={{ display: 'flex', alignItems: 'center' }}>
			<Tooltip
				title={
					isGloballySuspended
						? t('globally-suspended-row-disabled')
						: t('change-role')
				}
				placement="top"
				arrow
			>
				<Box component="span">
					<ButtonBase
						onClick={(event) => {
							setMenuAnchorEl(event.currentTarget);
						}}
						disabled={isUpdatingLevel || isGloballySuspended}
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

const CompanyStatusCell: MRT_ColumnDef<
	TenantUserCompanyData,
	string | undefined
>['Cell'] = (props) => {
	const company = props.row.original;
	const { userId = '' } = useParams();
	const { t } = useTranslate();
	const queryClient = useQueryClient();
	const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
	const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
	const [pendingStatus, setPendingStatus] = useState<string | null>(null);

	const tenantId = company.tenantId;
	const status = company.status ?? null;
	const isGloballySuspended = isGloballySuspendedStatus(status);

	let label: string = t('unknown-item', { item: 'status' });
	let color: LabelColor = 'default';

	if (isGloballySuspended) {
		label = t('globally-suspended');
		color = 'error';
	} else if (status === USER_STATUS_ENUM.ACTIVE) {
		label = t('active');
		color = 'success';
	} else if (status === USER_STATUS_ENUM.SUSPENDED) {
		label = t('suspended');
		color = 'warning';
	}

	const { mutate: suspendUser, isPending: isSuspending } = useSuspendTenantUser(
		{
			onSuccess: async () => {
				toast.success(t('tenant-user-suspended-success'));
				setConfirmDialogOpen(false);
				setMenuAnchorEl(null);
				await invalidateTenantUserCompanyQueries({
					queryClient,
					userId,
				});
			},
		},
	);

	const { mutate: reactivateUser, isPending: isReactivating } =
		useReactivateTenantUser({
			onSuccess: async () => {
				toast.success(t('tenant-user-reactivated-success'));
				setConfirmDialogOpen(false);
				setMenuAnchorEl(null);
				await invalidateTenantUserCompanyQueries({
					queryClient,
					userId,
				});
			},
		});

	const isPending = isSuspending || isReactivating;
	const isActive = status === USER_STATUS_ENUM.ACTIVE;
	const isSuspended = status === USER_STATUS_ENUM.SUSPENDED;
	const canChangeStatus = !isGloballySuspended && (isActive || isSuspended);

	const handleStatusClick = (nextStatus: string) => {
		if (nextStatus === status) {
			setMenuAnchorEl(null);
			return;
		}

		setPendingStatus(nextStatus);
		setConfirmDialogOpen(true);
	};

	const handleConfirm = () => {
		if (!pendingStatus) {
			return;
		}

		if (pendingStatus === USER_STATUS_ENUM.SUSPENDED) {
			suspendUser({ tenantId, userId });
			return;
		}

		if (pendingStatus === USER_STATUS_ENUM.ACTIVE) {
			reactivateUser({ tenantId, userId });
		}
	};

	if (!canChangeStatus) {
		return (
			<Tooltip
				title={isGloballySuspended ? t('globally-suspended-row-disabled') : ''}
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
						? t('suspend-tenant-user-description')
						: t('reactivate-tenant-user-description')
				}
				action={
					<Button
						variant="contained"
						color="inherit"
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

const CompanyActionsCell: MRT_ColumnDef<TenantUserCompanyData>['Cell'] = (
	props,
) => {
	const company = props.row.original;

	return (
		<Box sx={{ display: 'flex', alignItems: 'center' }}>
			<RemoveTenantUserCompanyAction company={company} />
		</Box>
	);
};

const RemoveTenantUserCompanyAction = ({
	company,
}: {
	company: TenantUserCompanyData;
}) => {
	const { userId = '' } = useParams();
	const { t } = useTranslate();
	const queryClient = useQueryClient();
	const confirmDialog = useBoolean();

	const { mutate: removeUser, isPending: isRemoving } = useRemoveTenantUser({
		onSuccess: async () => {
			toast.success(t('user-removed-success'));
			confirmDialog.onFalse();
			await invalidateTenantUserCompanyQueries({
				queryClient,
				userId,
			});
		},
	});

	return (
		<>
			<Tooltip title={t('remove')} placement="top" arrow>
				<Box component="span">
					<IconButton
						color="default"
						disabled={isRemoving}
						onClick={confirmDialog.onTrue}
						sx={{
							color: isRemoving ? 'action.disabled' : 'text.secondary',
						}}
					>
						<Iconify icon="solar:trash-bin-trash-bold" width={18} />
					</IconButton>
				</Box>
			</Tooltip>

			<ConfirmDialog
				open={confirmDialog.value}
				onClose={confirmDialog.onFalse}
				title={t('remove-user-from-tenant')}
				content={t('confirm-remove-user-from-tenant-details')}
				action={
					<Button
						variant="contained"
						color="inherit"
						onClick={() => removeUser({ tenantId: company.tenantId, userId })}
						disabled={isRemoving}
					>
						{t('remove')}
					</Button>
				}
			/>
		</>
	);
};
