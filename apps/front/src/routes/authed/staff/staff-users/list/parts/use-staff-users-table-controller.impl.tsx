import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import capitalize from 'lodash/capitalize';
import isEqual from 'lodash/isEqual';
import map from 'lodash/map';
import toStr from 'lodash/toString';
import trim from 'lodash/trim';
import {
	createMRTColumnHelper,
	type MRT_ColumnDef,
	type MRT_Localization,
	type MRT_SortingState,
	type MRT_TableOptions,
} from 'material-react-table';
import { useDebounce } from 'minimal-shared/hooks';
import { parseAsString, useQueryStates } from 'nuqs';
import {
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
	type ChangeEvent,
	type SyntheticEvent,
} from 'react';

import type { StaffUserItem } from '@org/client-ts/src/models';
import {
	ACCOUNT_LEVEL_ENUM,
	DEFAULT_PAGE_SIZE,
	FRONT_PATH_NAMES,
	USER_STATUS_ENUM,
} from '@org/shared-ts/lib/constants';
import { getUserFullName } from '@org/shared-ts/utils/user.utils';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { Label } from '#app/components/label/label.tsx';
import type { LabelColor } from '#app/components/label/types.ts';
import { RouterLink } from '#app/components/router-link.tsx';
import { useMRTTable } from '#app/hooks/use-mrt-table.ts';
import { useTableQueryOptions } from '#app/hooks/use-table-query-options.tsx';
import { useTableState } from '#app/hooks/use-table-state.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { useGetUserAuthData } from '#app/lib/react-query/features/common/auth.hooks.ts';
import {
	STAFF_USER_STATUS_FILTER_VALUES,
	type StaffUserStatusFilter,
	useFindStaffUser,
} from '#app/lib/react-query/features/staff/staff-user.hooks.ts';

import type { StaffUsersExportDialogControllerRef } from './staff-users-export-dialog-controller.tsx';
import StaffUserRowActions from './staff-user-row-actions.tsx';
import StaffUsersSelectionActions from './staff-users-selection-actions.tsx';
import StaffUsersToolbarFilters from './staff-users-toolbar-filters.tsx';
import { reconcileVisibleRowSelection } from './staff-users-list-helpers.ts';
import {
	type StaffUsersBulkActionType,
	useStaffUsersBulkActions,
} from './use-staff-users-bulk-actions.ts';

export type StaffUserRowData = {
	id: string;
	avatarUrl: string;
	firstName: string;
	lastName: string;
	level: string;
	status: string;
	email: string;
};

type StaffUserStatusFilterOption = {
	label: string;
	value: StaffUserStatusFilter;
};

const columnHelper = createMRTColumnHelper<StaffUserRowData>();

const defaultSorting: MRT_SortingState[number] = {
	desc: true,
	id: 'created_at',
};

const isStaffUserStatusFilter = (
	value: string,
): value is StaffUserStatusFilter => {
	return STAFF_USER_STATUS_FILTER_VALUES.includes(
		value as StaffUserStatusFilter,
	);
};

const parseStatusFilter = (value: string): StaffUserStatusFilter[] => {
	if (!value) {
		return [];
	}

	return Array.from(new Set(value.split(',').filter(isStaffUserStatusFilter)));
};

const getStatusLabel = (
	t: ReturnType<typeof useTranslate>['t'],
	value: StaffUserStatusFilter,
) => {
	if (value === 'active') {
		return t('active');
	}

	if (value === 'pending') {
		return t('pending');
	}

	if (value === 'suspended') {
		return t('suspended');
	}

	return t('inactive');
};

const mapStaffUserRowData = (staffUser: StaffUserItem): StaffUserRowData => {
	return {
		id: toStr(staffUser.id),
		avatarUrl: staffUser.avatarUrl || '',
		firstName: staffUser.firstName || '',
		lastName: staffUser.lastName || '',
		level: staffUser.level || '',
		status: staffUser.status || '',
		email: staffUser.email || '',
	};
};

export const useStaffUsersTableController = () => {
	const { t } = useTranslate();
	const searchTooltipId = useId();
	const statusTooltipId = useId();
	const exportDialogRef = useRef<StaffUsersExportDialogControllerRef | null>(
		null,
	);
	const staffUserStatusOptions = useMemo<StaffUserStatusFilterOption[]>(() => {
		return STAFF_USER_STATUS_FILTER_VALUES.map((value) => {
			return {
				label: getStatusLabel(t, value),
				value,
			};
		});
	}, [t]);

	const [filterStates, setFilterStates] = useQueryStates({
		q: parseAsString.withDefault(''),
		status: parseAsString.withDefault(''),
	});
	const [globalFilter, setGlobalFilter] = useState(filterStates.q);
	const [statusFilter, setStatusFilter] = useState<StaffUserStatusFilter[]>(
		() => {
			return parseStatusFilter(filterStates.status);
		},
	);

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

	const debouncedQ = useDebounce(globalFilter, 300);

	useEffect(() => {
		setGlobalFilter(filterStates.q);
	}, [filterStates.q]);

	useEffect(() => {
		const nextStatusFilter = parseStatusFilter(filterStates.status);

		if (!isEqual(nextStatusFilter, statusFilter)) {
			setStatusFilter(nextStatusFilter);
		}
	}, [filterStates.status, statusFilter]);

	const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
		setGlobalFilter(event.target.value);
	};

	const handleStatusChange = (
		_event: SyntheticEvent,
		selectedOptions: StaffUserStatusFilterOption[],
	) => {
		const nextStatusFilter = map(selectedOptions, (option) => {
			return option.value;
		});

		resetCursorPagination?.();
		setStatusFilter(nextStatusFilter);
		setFilterStates({
			q: globalFilter,
			status: nextStatusFilter.join(','),
		});
	};

	const staffUsersQuery = useFindStaffUser({
		variables: {
			cursor: apiVariables.cursor || undefined,
			limit: apiVariables.limit,
			sort: apiVariables.sort,
			q: filterStates.q || undefined,
			status: statusFilter.length > 0 ? statusFilter : undefined,
		},
	});

	const { renderEmptyRowsFallback, queryState } = useTableQueryOptions({
		query: staffUsersQuery,
		emptyContent: {
			title: capitalize(
				t('no-items-found', {
					item: t('staff-users'),
					ns: 'response-message',
				}),
			),
		},
		errorContent: {
			title: capitalize(
				t('error-loading-items', {
					item: t('staff-users'),
					ns: 'response-message',
				}),
			),
		},
	});

	const rows = useMemo(() => {
		return map(staffUsersQuery.data?.data, mapStaffUserRowData);
	}, [staffUsersQuery.data]);

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
					size: 320,
				},
			),
			columnHelper.accessor('level', {
				header: t('level'),
				Cell: LevelCell,
				size: 140,
			}),
			columnHelper.accessor('status', {
				header: t('status'),
				Cell: StatusCell,
				size: 140,
			}),
			columnHelper.display({
				header: t('actions'),
				Cell: ActionsCell,
				enableSorting: false,
				size: 180,
			}),
		];
	}, [t]);

	const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
	const [bulkActionDialog, setBulkActionDialog] = useState<{
		type: StaffUsersBulkActionType;
		open: boolean;
	}>({
		type: 'suspend',
		open: false,
	});
	const reconciledRowSelection = useMemo(() => {
		return reconcileVisibleRowSelection(rowSelection, rows);
	}, [rowSelection, rows]);

	useEffect(() => {
		if (isEqual(reconciledRowSelection, rowSelection)) {
			return;
		}

		setRowSelection(reconciledRowSelection);
	}, [reconciledRowSelection, rowSelection]);

	const selectedRows = useMemo(() => {
		return rows.filter((row) => {
			return reconciledRowSelection[row.id];
		});
	}, [reconciledRowSelection, rows]);
	const selectedUserIds = useMemo(() => {
		return selectedRows.map((row) => row.id);
	}, [selectedRows]);
	const selectedCount = selectedRows.length;
	const isSelectionMode = selectedCount > 0;
	const isCancellingSelectionLockedSearchRef = useRef(false);
	const selectionModeDisabledReason = t('selection-mode-disable-controls');
	const sortingDisabledReason = t('selection-mode-disable-sorting');
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

	useEffect(() => {
		if (!isSelectionMode) {
			return;
		}

		isCancellingSelectionLockedSearchRef.current = true;
		if (globalFilter === filterStates.q) {
			return;
		}

		setGlobalFilter(filterStates.q);
	}, [filterStates.q, globalFilter, isSelectionMode]);

	useEffect(() => {
		if (isSelectionMode) {
			return;
		}

		if (isCancellingSelectionLockedSearchRef.current) {
			if (debouncedQ !== filterStates.q) {
				return;
			}

			isCancellingSelectionLockedSearchRef.current = false;
			return;
		}

		if (debouncedQ === filterStates.q) {
			return;
		}

		resetCursorPagination?.();
		setFilterStates({
			q: debouncedQ,
			status: statusFilter.join(','),
		});
	}, [
		debouncedQ,
		filterStates.q,
		isSelectionMode,
		resetCursorPagination,
		setFilterStates,
		statusFilter,
	]);

	const {
		handleBulkSuspend,
		handleBulkReactivate,
		handleBulkDelete,
		isBulkSuspending,
		isBulkReactivating,
		isBulkDeleting,
	} = useStaffUsersBulkActions({
		selectedUserIds,
		onSuccess: (type) => {
			setBulkActionDialog({ type, open: false });
			setRowSelection({});
		},
	});

	useEffect(() => {
		if (selectedCount > 0 || !bulkActionDialog.open) {
			return;
		}

		setBulkActionDialog((currentDialogState) => {
			if (!currentDialogState.open) {
				return currentDialogState;
			}

			return {
				...currentDialogState,
				open: false,
			};
		});
	}, [bulkActionDialog.open, selectedCount]);

	const handleCursorPaginationChange: typeof handlePaginationChange =
		useCallback(
			(updater) => {
				setNextCursor?.(staffUsersQuery.data?.nextCursor ?? null);
				handlePaginationChange(updater);
			},
			[handlePaginationChange, setNextCursor, staffUsersQuery.data?.nextCursor],
		);
	const hasNextPage = staffUsersQuery.data?.nextCursor != null;

	const openExportDialog = () => {
		exportDialogRef.current?.open();
	};

	const openBulkActionDialog = (type: StaffUsersBulkActionType) => {
		setBulkActionDialog({ type, open: true });
	};

	const closeBulkActionDialog = (type: StaffUsersBulkActionType) => {
		setBulkActionDialog({ type, open: false });
	};

	const renderToolbarFilters = () => {
		return (
			<StaffUsersToolbarFilters
				searchTooltipId={searchTooltipId}
				statusTooltipId={statusTooltipId}
				isSelectionMode={isSelectionMode}
				disabledReason={selectionModeDisabledReason}
				globalFilter={globalFilter}
				statusFilter={statusFilter}
				statusOptions={staffUserStatusOptions}
				onSearchChange={handleSearchChange}
				onStatusChange={handleStatusChange}
			/>
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
			<StaffUsersSelectionActions
				onOpenExportDialog={openExportDialog}
				onOpenBulkActionDialog={openBulkActionDialog}
			/>
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
			setRowSelection((previousRowSelection) => {
				return typeof updater === 'function'
					? updater(previousRowSelection)
					: updater;
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
			rowSelection: reconciledRowSelection,
		},
		meta: {
			handlePaginationChange: handleCursorPaginationChange,
			hasNextPage,
			hasPreviousPage,
			isPending: staffUsersQuery.isPending,
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
			} satisfies MRT_TableOptions<StaffUserRowData>['muiTableHeadCellProps'];
		},
	});

	return {
		table,
		exportDialogRef,
		rows,
		selectedRows,
		selectedCount,
		rowsCount: rows.length,
		isSelectionMode,
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

const UserCell: MRT_ColumnDef<StaffUserRowData, string>['Cell'] = (props) => {
	const { t } = useTranslate();
	const { data: userAuthData } = useGetUserAuthData();
	const userId = props.row.original.id;
	const fullName = trim(props.cell.getValue()) || t('un-named');
	const avatarUrl = props.row.original.avatarUrl;
	const normalizedAvatarUrl = trim(avatarUrl);
	const email = props.row.original.email;
	const isMe = userAuthData.id === userId;

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
				sx={{ typography: 'body2', flex: '1 1 auto', alignItems: 'flex-start' }}
			>
				<Stack direction="row" spacing={1} alignItems="center">
					<Link
						component={RouterLink}
						href={FRONT_PATH_NAMES.staff.staffUsers.details(userId)}
						color="inherit"
						sx={{ cursor: 'pointer' }}
					>
						{fullName}
					</Link>
					{isMe ? <Label variant="inverted">me</Label> : null}
				</Stack>

				<Box component="span" sx={{ color: 'text.disabled' }}>
					{email}
				</Box>
			</Stack>
		</Box>
	);
};

const StatusCell: MRT_ColumnDef<StaffUserRowData, string>['Cell'] = (props) => {
	const { t } = useTranslate();
	const status = props.cell.getValue();

	let label = t('unknown-item', { item: 'status' });
	let color: LabelColor = 'default';

	if (status === USER_STATUS_ENUM.ACTIVE) {
		label = t('active');
		color = 'success';
	} else if (status === USER_STATUS_ENUM.PENDING) {
		label = t('pending');
		color = 'warning';
	} else if (status === USER_STATUS_ENUM.BANNED) {
		label = t('banned');
		color = 'error';
	} else if (status === USER_STATUS_ENUM.SUSPENDED) {
		label = t('suspended');
		color = 'warning';
	} else if (status === USER_STATUS_ENUM.INACTIVE) {
		label = t('inactive');
		color = 'default';
	}

	return (
		<Label variant="soft" color={color}>
			{label}
		</Label>
	);
};

const LevelCell: MRT_ColumnDef<StaffUserRowData, string>['Cell'] = (props) => {
	const { t } = useTranslate();
	const level = props.cell.getValue();

	let label = t('unknown-item', { item: 'role' });
	let color: LabelColor = 'default';

	if (level === ACCOUNT_LEVEL_ENUM.ADMIN) {
		label = t('admin');
		color = 'success';
	} else if (level === ACCOUNT_LEVEL_ENUM.USER) {
		label = t('user');
		color = 'warning';
	}

	return (
		<Label variant="soft" color={color}>
			{label}
		</Label>
	);
};

const ActionsCell: MRT_ColumnDef<StaffUserRowData>['Cell'] = (props) => {
	return <StaffUserRowActions user={props.row.original} />;
};
