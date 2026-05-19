import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import capitalize from 'lodash/capitalize';
import map from 'lodash/map';
import {
	createMRTColumnHelper,
	MaterialReactTable,
	type MRT_ColumnDef,
	type MRT_SortingState,
} from 'material-react-table';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import type { AuditLogListItem } from '@org/client-ts/src/models';
import {
	DEFAULT_PAGE_SIZE,
	FRONT_PATH_NAMES,
} from '@org/shared-ts/lib/constants';

import { DateRangeFilter } from '#app/components/date-range-filter/date-range-filter.tsx';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { MultiSelectChipFilter } from '#app/components/multi-select-chip-filter/multi-select-chip-filter.tsx';
import QueryDisplay from '#app/components/query-display.tsx';
import { RouterLink } from '#app/components/router-link.tsx';
import { useMRTTable } from '#app/hooks/use-mrt-table.ts';
import { useTableQueryOptions } from '#app/hooks/use-table-query-options.tsx';
import { useTableState } from '#app/hooks/use-table-state.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import {
	useFindStaffAuditLogs,
	useGetStaffAuditLogActions,
} from '#app/lib/react-query/features/staff/staff-audit-log.hooks.ts';
import { dayjs, fDateTime, fToNow } from '#app/utils/format-time.ts';

import AuditLogsExportDialogController, {
	type AuditLogsExportDialogControllerRef,
} from './audit-logs-export-dialog-controller.tsx';
import { useStaffAuditLogsFilters } from './use-staff-audit-logs-filters';

type AuditLogRowData = {
	id: string;
	userName: string;
	userEmail: string;
	action: string;
	ipAddress: string;
	targetId: string;
	createdAt: Date | null;
};

const AuditLogRowDataMapper = (log: AuditLogListItem): AuditLogRowData => {
	return {
		id: log.id || '',
		userName: log.userName || '-',
		userEmail: log.userEmail || '-',
		action: log.action || '-',
		ipAddress: log.ipAddress || '-',
		targetId: log.targetId || '',
		createdAt: log.createdAt || null,
	};
};

const columnHelper = createMRTColumnHelper<AuditLogRowData>();

const defaultSorting: MRT_SortingState[number] = {
	desc: true,
	id: 'created_at',
};

const StaffAuditLogsTable = () => {
	const { t } = useTranslate();
	const exportDialogRef = useRef<AuditLogsExportDialogControllerRef | null>(
		null,
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

	const { actions, dateRange, filterSignature, setActions, setDateRange } =
		useStaffAuditLogsFilters(resetCursorPagination);
	const previousFilterSignatureRef = useRef(filterSignature);
	const filtersChanged = previousFilterSignatureRef.current !== filterSignature;

	const startDateIso = dateRange.from?.startOf('day').toISOString();
	const endDateIso = dateRange.to?.endOf('day').toISOString();
	// On the render where URL filters change, omit the old
	// cursor so the next query starts at the first page even
	// before table state finishes resetting.
	const cursor = filtersChanged ? undefined : apiVariables.cursor || undefined;

	useEffect(() => {
		previousFilterSignatureRef.current = filterSignature;
	}, [filterSignature]);

	const auditLogsQuery = useFindStaffAuditLogs({
		variables: {
			cursor,
			limit: apiVariables.limit,
			sort: apiVariables.sort,
			actions: actions.length > 0 ? actions : undefined,
			startDate: startDateIso,
			endDate: endDateIso,
		},
	});

	const actionsQuery = useGetStaffAuditLogActions({});

	const { renderEmptyRowsFallback, queryState } = useTableQueryOptions({
		query: auditLogsQuery,
		emptyContent: {
			title: capitalize(
				t('no-items-found', {
					item: t('audit-logs'),
					ns: 'response-message',
				}),
			),
		},
		errorContent: {
			title: capitalize(
				t('error-loading-items', {
					item: t('audit-logs'),
					ns: 'response-message',
				}),
			),
		},
	});

	const handleCursorPaginationChange: typeof handlePaginationChange =
		useCallback(
			(updater) => {
				setNextCursor?.(auditLogsQuery.data?.nextCursor);
				handlePaginationChange(updater);
			},
			[handlePaginationChange, auditLogsQuery.data?.nextCursor, setNextCursor],
		);
	const hasNextPage = auditLogsQuery.data?.nextCursor != null;

	const dataTable = useMemo(() => {
		return map(auditLogsQuery.data?.data, AuditLogRowDataMapper);
	}, [auditLogsQuery.data]);

	const columns = useMemo(() => {
		return [
			columnHelper.accessor('userName', {
				header: t('user'),
				Cell: UserCell,
				enableSorting: false,
				size: 220,
			}),
			columnHelper.accessor('action', {
				header: t('action'),
				Cell: ActionCell,
				enableSorting: false,
				size: 200,
			}),
			columnHelper.accessor('targetId', {
				header: t('target-id'),
				Cell: TargetIdCell,
				enableSorting: false,
				size: 160,
			}),
			columnHelper.accessor('ipAddress', {
				header: t('ip-address'),
				Cell: IpAddressCell,
				enableSorting: false,
				size: 140,
			}),
			columnHelper.accessor('createdAt', {
				id: 'created_at',
				header: t('created-at'),
				Cell: DateCell,
				size: 200,
			}),
			columnHelper.display({
				header: t('actions'),
				Cell: ActionsCell,
				size: 80,
			}),
		];
	}, [t]);

	const renderActionFilter = useCallback(
		(actionValues: string[], loading = false) => {
			// Audit action strings are namespaced as domain.event;
			// group by prefix to keep the filter scannable without
			// a separate taxonomy endpoint.
			const options = map(actionValues, (action) => ({
				value: action,
				label: action,
				group: action.split('.')[0] ?? '',
			}));

			return (
				<MultiSelectChipFilter
					label={t('action')}
					options={options}
					value={actions}
					onChange={setActions}
					loading={loading}
				/>
			);
		},
		[actions, setActions, t],
	);

	const renderToolbarFilters = useCallback(() => {
		return (
			<>
				<DateRangeFilter
					label={t('date')}
					value={dateRange}
					onChange={setDateRange}
					minDate={dayjs('2024-01-01')}
					maxDate={dayjs()}
				/>
				<QueryDisplay
					query={actionsQuery}
					LoadingSlot={() => renderActionFilter([], true)}
					ErrorSlot={AuditLogActionsFilterError}
					EmptySlot={() => renderActionFilter([])}
				>
					{({ data }) => renderActionFilter(data.actions ?? [])}
				</QueryDisplay>
			</>
		);
	}, [actionsQuery, dateRange, setDateRange, renderActionFilter, t]);

	const handleOpenExportDialog = useCallback(() => {
		exportDialogRef.current?.open();
	}, []);

	const renderExportActions = useCallback(() => {
		return (
			<Button
				variant="outlined"
				onClick={handleOpenExportDialog}
				startIcon={<Iconify icon="solar:download-bold" width={18} />}
			>
				{t('export')}
			</Button>
		);
	}, [handleOpenExportDialog, t]);

	const table = useMRTTable('minimal-cursor', {
		columns,
		data: dataTable,
		enableRowSelection: false,
		manualSorting: true,
		onSortingChange: handleSortingChange,
		state: {
			...tableState,
			...queryState,
			density: 'compact',
		},
		muiTablePaperProps: {
			sx: {
				flexGrow: 1,
			},
		},
		renderEmptyRowsFallback,
		meta: {
			handlePaginationChange: handleCursorPaginationChange,
			hasNextPage,
			hasPreviousPage,
			isPending: auditLogsQuery.isPending,
			renderToolbarFilters,
			renderExportActions,
		},
	});

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

			<AuditLogsExportDialogController
				ref={exportDialogRef}
				actions={actions.length > 0 ? actions : undefined}
				startDate={startDateIso}
				endDate={endDateIso}
			/>
		</Box>
	);
};

export default StaffAuditLogsTable;

const AuditLogActionsFilterError = () => {
	const { t } = useTranslate();
	const title = capitalize(
		t('error-loading-items', {
			item: t('actions'),
			ns: 'response-message',
		}),
	);

	return (
		<Box
			role="status"
			sx={{
				minHeight: 36,
				display: 'inline-flex',
				alignItems: 'center',
				gap: 1,
				px: 1.5,
				border: '1px solid',
				borderColor: 'error.main',
				borderRadius: 1,
				color: 'error.main',
			}}
		>
			<Iconify icon="solar:danger-triangle-bold" width={18} />
			<Typography variant="body2" noWrap>
				{title}
			</Typography>
		</Box>
	);
};

const UserCell: MRT_ColumnDef<AuditLogRowData, string>['Cell'] = (props) => {
	const userName = props.cell.getValue();
	const userEmail = props.row.original.userEmail;

	return (
		<Box
			sx={{
				minWidth: 0,
				display: 'flex',
				flexDirection: 'column',
				gap: 0.25,
			}}
		>
			<Typography variant="body2" noWrap>
				{userName || '-'}
			</Typography>
			<Typography
				variant="caption"
				noWrap
				sx={{ color: 'text.disabled', display: 'block' }}
			>
				{userEmail || '-'}
			</Typography>
		</Box>
	);
};

const ActionCell: MRT_ColumnDef<AuditLogRowData, string>['Cell'] = (props) => {
	const action = props.cell.getValue();

	return (
		<Typography
			variant="body2"
			sx={{
				fontFamily: 'monospace',
				fontSize: '0.8rem',
			}}
		>
			{action || '-'}
		</Typography>
	);
};

const TargetIdCell: MRT_ColumnDef<AuditLogRowData, string>['Cell'] = (
	props,
) => {
	const targetId = props.cell.getValue();

	if (!targetId) {
		return (
			<Typography variant="body2" sx={{ color: 'text.disabled' }}>
				-
			</Typography>
		);
	}

	return (
		<Tooltip title={targetId} placement="top" arrow>
			<Typography
				variant="body2"
				sx={{
					fontFamily: 'monospace',
					fontSize: '0.75rem',
					color: 'text.secondary',
					maxWidth: 140,
					overflow: 'hidden',
					textOverflow: 'ellipsis',
					whiteSpace: 'nowrap',
				}}
			>
				{targetId}
			</Typography>
		</Tooltip>
	);
};

const IpAddressCell: MRT_ColumnDef<AuditLogRowData, string>['Cell'] = (
	props,
) => {
	const ipAddress = props.cell.getValue();

	return (
		<Typography
			variant="body2"
			sx={{
				fontFamily: 'monospace',
				fontSize: '0.8rem',
				color: 'text.secondary',
			}}
		>
			{ipAddress || '-'}
		</Typography>
	);
};

const DateCell: MRT_ColumnDef<AuditLogRowData, Date | null>['Cell'] = (
	props,
) => {
	const dateValue = props.cell.getValue();

	if (!dateValue) {
		return <Typography variant="body2">-</Typography>;
	}

	return (
		<Box sx={{ display: 'flex', flexDirection: 'column' }}>
			<Typography variant="body2">{fDateTime(dateValue)}</Typography>
			<Typography variant="caption" sx={{ color: 'text.secondary' }}>
				{fToNow(dateValue)}
			</Typography>
		</Box>
	);
};

const ActionsCell: MRT_ColumnDef<AuditLogRowData>['Cell'] = (props) => {
	const { t } = useTranslate();
	const logId = props.row.original.id;

	return (
		<Tooltip title={t('view-details')} placement="top" arrow>
			<IconButton
				color="default"
				LinkComponent={RouterLink}
				href={FRONT_PATH_NAMES.staff.auditLogs.details(logId)}
				size="small"
				aria-label={t('view-details')}
			>
				<Iconify icon="solar:eye-bold" />
			</IconButton>
		</Tooltip>
	);
};
